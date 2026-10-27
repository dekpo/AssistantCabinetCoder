import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  discoverServer,
  normalizeServerUrl,
  parseEnvText,
  readTextFile,
  serverSettingsFromEnv,
  targetUrlFor,
  type DiscoveryInput,
} from "../src/discovery";

const WINDOWS_ENV = "C:\\ProgramData\\AssistantCabinetServer\\config\\server.env";
const WINDOWS_CA = "C:\\ProgramData\\AssistantCabinetServer\\config\\ca.pem";

function input(text: string | undefined, overrides: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return {
    serverUrl: "",
    caFile: "",
    autoDiscover: true,
    platform: "win32",
    env: {},
    readText: async (file) => (file === WINDOWS_ENV ? text : undefined),
    ...overrides,
  };
}

describe("parseEnvText", () => {
  it("reads KEY=VALUE, skips comments and blanks, trims, keeps the last word", () => {
    const values = parseEnvText("# note\n\nSERVER_PORT = 8090 \nSERVER_PORT=8091\nTLS_MODE=on\n");
    assert.equal(values.get("SERVER_PORT"), "8091");
    assert.equal(values.get("TLS_MODE"), "on");
    assert.equal(values.size, 2);
  });

  it("keeps the first equals sign as the separator", () => {
    assert.equal(parseEnvText("MODEL_ALIASES=a:b=c").get("MODEL_ALIASES"), "a:b=c");
  });

  it("ignores quoted values, lowercase keys, lines without an equals sign and a BOM", () => {
    const values = parseEnvText('\uFEFFSERVER_PORT=9000\nTLS_MODE="on"\nlower=1\nno equals here\n');
    assert.equal(values.get("SERVER_PORT"), "9000");
    assert.equal(values.has("TLS_MODE"), false);
    assert.equal(values.has("lower"), false);
  });

  it("handles Windows and old Mac line ends", () => {
    assert.equal(parseEnvText("SERVER_PORT=1\r\nTLS_MODE=on\rAUTH_MODE=required").size, 3);
  });
});

describe("serverSettingsFromEnv", () => {
  it("applies the server defaults for a key the file does not set", () => {
    const result = serverSettingsFromEnv(parseEnvText("AUTH_MODE=off"));
    assert.ok(result.ok);
    assert.equal(result.settings.bindAddress, "127.0.0.1");
    assert.equal(result.settings.port, 8080);
    assert.equal(result.settings.tls, false);
  });

  it("rejects a file with none of the five keys", () => {
    assert.deepEqual(serverSettingsFromEnv(parseEnvText("OTHER=1\nGARBAGE")), {
      ok: false,
      reason: "no_settings",
    });
  });

  it("rejects a bad port and a bad address", () => {
    for (const port of ["0", "70000", "abc", "80.5", ""]) {
      assert.deepEqual(serverSettingsFromEnv(parseEnvText(`SERVER_PORT=${port}`)), {
        ok: false,
        reason: "invalid_port",
      });
    }
    assert.deepEqual(
      serverSettingsFromEnv(parseEnvText("SERVER_BIND_ADDRESS=a b\nSERVER_PORT=1")),
      {
        ok: false,
        reason: "invalid_address",
      },
    );
  });

  it("splits the certificate names and ignores empty entries", () => {
    const result = serverSettingsFromEnv(
      parseEnvText("TLS_SUBJECT_ALT_NAMES=cabinet.local, 192.168.1.83,,"),
    );
    assert.ok(result.ok);
    assert.deepEqual(result.settings.tlsNames, ["cabinet.local", "192.168.1.83"]);
  });
});

describe("targetUrlFor", () => {
  const base = { port: 8090, tls: false, tlsNames: [], authRequired: false };

  it("uses a specific bind address as it is", () => {
    assert.equal(
      targetUrlFor({ ...base, bindAddress: "192.168.1.83" }),
      "http://192.168.1.83:8090",
    );
  });

  it("uses the loopback for a wildcard in plain HTTP", () => {
    assert.equal(targetUrlFor({ ...base, bindAddress: "0.0.0.0" }), "http://127.0.0.1:8090");
    assert.equal(targetUrlFor({ ...base, bindAddress: "::" }), "http://127.0.0.1:8090");
  });

  it("uses the first certificate name for a wildcard in HTTPS", () => {
    const settings = {
      ...base,
      bindAddress: "0.0.0.0",
      tls: true,
      tlsNames: ["cabinet.local", "192.168.1.83"],
    };
    assert.equal(targetUrlFor(settings), "https://cabinet.local:8090");
  });

  it("gives nothing for a wildcard in HTTPS without a certificate name", () => {
    assert.equal(targetUrlFor({ ...base, bindAddress: "0.0.0.0", tls: true }), undefined);
  });

  it("brackets an IPv6 address", () => {
    assert.equal(targetUrlFor({ ...base, bindAddress: "::1" }), "http://[::1]:8090");
  });

  it("drops the default port of the scheme", () => {
    assert.equal(targetUrlFor({ ...base, bindAddress: "10.0.0.5", port: 80 }), "http://10.0.0.5");
  });
});

describe("normalizeServerUrl", () => {
  it("keeps the origin only", () => {
    assert.equal(normalizeServerUrl(" http://192.168.1.83:8090/ "), "http://192.168.1.83:8090");
    assert.equal(normalizeServerUrl("https://cabinet.local"), "https://cabinet.local");
  });

  it("refuses what is not a plain server address", () => {
    for (const bad of [
      "",
      "192.168.1.83:8090",
      "ftp://host",
      "http://user:pass@host",
      "http://host/path",
      "http://host?x=1",
      "http://host#frag",
      "not a url",
    ]) {
      assert.equal(normalizeServerUrl(bad), undefined, bad);
    }
  });
});

describe("discoverServer", () => {
  it("uses the configured address and ignores the installation", async () => {
    const outcome = await discoverServer(
      input("SERVER_PORT=1", { serverUrl: "http://10.0.0.9:8090", caFile: " C:\\x\\ca.pem " }),
    );
    assert.ok(outcome.ok);
    assert.equal(outcome.target.url, "http://10.0.0.9:8090");
    assert.equal(outcome.target.source, "setting");
    assert.equal(outcome.target.caFile, "C:\\x\\ca.pem");
  });

  it("reports a configured address that is not valid", async () => {
    assert.deepEqual(await discoverServer(input(undefined, { serverUrl: "nonsense" })), {
      ok: false,
      reason: "invalid_server_url",
    });
  });

  it("reads the installation on Windows", async () => {
    const outcome = await discoverServer(
      input("SERVER_BIND_ADDRESS=192.168.1.83\nSERVER_PORT=8090\nAUTH_MODE=required\n"),
    );
    assert.ok(outcome.ok);
    assert.equal(outcome.target.url, "http://192.168.1.83:8090");
    assert.equal(outcome.target.source, "installation");
    assert.equal(outcome.target.authRequired, true);
    assert.equal(outcome.target.caFile, undefined);
  });

  it("defaults the authority file to ca.pem beside server.env for HTTPS", async () => {
    const outcome = await discoverServer(
      input(
        "SERVER_BIND_ADDRESS=0.0.0.0\nSERVER_PORT=8443\nTLS_MODE=on\nTLS_SUBJECT_ALT_NAMES=cabinet.local\n",
      ),
    );
    assert.ok(outcome.ok);
    assert.equal(outcome.target.url, "https://cabinet.local:8443");
    assert.equal(outcome.target.caFile, WINDOWS_CA);
  });

  it("lets the caFile setting win over the default", async () => {
    const outcome = await discoverServer(
      input("SERVER_BIND_ADDRESS=10.0.0.5\nTLS_MODE=on\n", { caFile: "D:\\mine.pem" }),
    );
    assert.ok(outcome.ok);
    assert.equal(outcome.target.caFile, "D:\\mine.pem");
  });

  it("reads the installation on macOS", async () => {
    const outcome = await discoverServer({
      ...input(undefined),
      platform: "darwin",
      readText: async (file) =>
        file === "/Library/Application Support/AssistantCabinetServer/config/server.env"
          ? "SERVER_PORT=8090\n"
          : undefined,
    });
    assert.ok(outcome.ok);
    assert.equal(outcome.target.url, "http://127.0.0.1:8090");
  });

  it("says why nothing was found", async () => {
    assert.deepEqual(await discoverServer(input(undefined)), {
      ok: false,
      reason: "no_installation",
    });
    assert.deepEqual(await discoverServer(input("garbage\nnot a settings file")), {
      ok: false,
      reason: "no_settings",
    });
    assert.deepEqual(await discoverServer(input("SERVER_PORT=1", { autoDiscover: false })), {
      ok: false,
      reason: "autodiscover_off",
    });
    assert.deepEqual(await discoverServer(input("SERVER_PORT=1", { platform: "linux" })), {
      ok: false,
      reason: "unsupported_platform",
    });
    assert.deepEqual(await discoverServer(input("SERVER_PORT=99999")), {
      ok: false,
      reason: "invalid_port",
    });
    assert.deepEqual(await discoverServer(input("SERVER_BIND_ADDRESS=0.0.0.0\nTLS_MODE=on\n")), {
      ok: false,
      reason: "no_tls_names",
    });
  });

  it("reads only server.env", async () => {
    const asked: string[] = [];
    await discoverServer({
      ...input(undefined),
      readText: async (file) => {
        asked.push(file);
        return "SERVER_PORT=8090";
      },
    });
    assert.deepEqual(asked, [WINDOWS_ENV]);
  });
});

describe("readTextFile", () => {
  it("reads a small file and refuses a missing or oversized one", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "acc-read-"));
    try {
      const small = path.join(folder, "small.env");
      await writeFile(small, "SERVER_PORT=1\n");
      assert.equal(await readTextFile(small), "SERVER_PORT=1\n");
      assert.equal(await readTextFile(path.join(folder, "missing.env")), undefined);
      assert.equal(await readTextFile(small, 3), undefined);
      assert.equal(await readTextFile(folder), undefined);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
