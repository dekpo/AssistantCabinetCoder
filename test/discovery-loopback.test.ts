/**
 * The target rule of Lot X1c (decision D-018, from the server's D-074): a specific bind address
 * gives the plain-HTTP loopback, a wildcard keeps the older rule, and `server.env` is read again
 * at every discovery (the server's D-081: the address can change while the server runs).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoverServer, targetUrlFor, type DiscoveryInput } from "../src/discovery";

const MAC_ENV = "/Library/Application Support/AssistantCabinetServer/config/server.env";
const MAC_CA = "/Library/Application Support/AssistantCabinetServer/config/ca.pem";

function macInput(
  text: string | undefined,
  overrides: Partial<DiscoveryInput> = {},
): DiscoveryInput {
  return {
    serverUrl: "",
    caFile: "",
    autoDiscover: true,
    platform: "darwin",
    env: {},
    readText: async (file) => (file === MAC_ENV ? text : undefined),
    ...overrides,
  };
}

describe("targetUrlFor: a specific bind address gives the loopback", () => {
  const base = { port: 1975, tls: false, tlsNames: [], authRequired: false };

  it("uses http://127.0.0.1 for a specific IPv4 address, TLS off", () => {
    assert.equal(targetUrlFor({ ...base, bindAddress: "192.168.75.1" }), "http://127.0.0.1:1975");
  });

  it("uses http://127.0.0.1 for a specific IPv4 address, TLS on", () => {
    assert.equal(
      targetUrlFor({
        ...base,
        bindAddress: "192.168.75.1",
        tls: true,
        tlsNames: ["192.168.75.1", "cabinet.local"],
      }),
      "http://127.0.0.1:1975",
    );
  });

  it("uses http://127.0.0.1 for an IPv6 address, TLS off and on", () => {
    assert.equal(targetUrlFor({ ...base, bindAddress: "fd00::5" }), "http://127.0.0.1:1975");
    assert.equal(
      targetUrlFor({ ...base, bindAddress: "fd00::5", tls: true, tlsNames: ["fd00::5"] }),
      "http://127.0.0.1:1975",
    );
  });

  it("uses http://127.0.0.1 for a host name, TLS off and on", () => {
    assert.equal(targetUrlFor({ ...base, bindAddress: "cabinet.local" }), "http://127.0.0.1:1975");
    assert.equal(
      targetUrlFor({
        ...base,
        bindAddress: "cabinet.local",
        tls: true,
        tlsNames: ["cabinet.local"],
      }),
      "http://127.0.0.1:1975",
    );
  });

  it("keeps the port", () => {
    assert.equal(
      targetUrlFor({ ...base, bindAddress: "10.0.0.5", port: 8443, tls: true }),
      "http://127.0.0.1:8443",
    );
  });
});

describe("targetUrlFor: a wildcard keeps the older rule", () => {
  const base = { port: 1975, tls: false, tlsNames: [], authRequired: false };

  it("uses http://127.0.0.1 for a wildcard, TLS off", () => {
    assert.equal(targetUrlFor({ ...base, bindAddress: "0.0.0.0" }), "http://127.0.0.1:1975");
    assert.equal(targetUrlFor({ ...base, bindAddress: "::" }), "http://127.0.0.1:1975");
  });

  it("uses HTTPS on the first certificate name for a wildcard, TLS on", () => {
    assert.equal(
      targetUrlFor({ ...base, bindAddress: "0.0.0.0", tls: true, tlsNames: ["cabinet.local"] }),
      "https://cabinet.local:1975",
    );
    assert.equal(
      targetUrlFor({ ...base, bindAddress: "::", tls: true, tlsNames: ["fd00::5", "x.local"] }),
      "https://[fd00::5]:1975",
    );
  });

  it("gives nothing for a wildcard, TLS on, without a certificate name", () => {
    assert.equal(targetUrlFor({ ...base, bindAddress: "0.0.0.0", tls: true }), undefined);
  });
});

describe("discoverServer with the loopback target", () => {
  it("finds the Mac's server on the loopback, not on its network address", async () => {
    const outcome = await discoverServer(
      macInput("SERVER_BIND_ADDRESS=192.168.75.1\nSERVER_PORT=1975\nAUTH_MODE=off\n"),
    );
    assert.ok(outcome.ok);
    assert.equal(outcome.target.url, "http://127.0.0.1:1975");
    assert.equal(outcome.target.source, "installation");
    assert.equal(outcome.target.authRequired, false);
    assert.equal(outcome.target.caFile, undefined);
  });

  it("attaches no authority file to the loopback target, even with TLS on and a caFile setting", async () => {
    const text = "SERVER_BIND_ADDRESS=192.168.75.1\nSERVER_PORT=1975\nTLS_MODE=on\n";
    const plain = await discoverServer(macInput(text));
    assert.ok(plain.ok);
    assert.equal(plain.target.url, "http://127.0.0.1:1975");
    assert.equal(plain.target.caFile, undefined);
    const withSetting = await discoverServer(macInput(text, { caFile: "/Users/me/ca.pem" }));
    assert.ok(withSetting.ok);
    assert.equal(withSetting.target.caFile, undefined);
  });

  it("attaches the authority file to a wildcard HTTPS target", async () => {
    const text =
      "SERVER_BIND_ADDRESS=0.0.0.0\nSERVER_PORT=1975\nTLS_MODE=on\nTLS_SUBJECT_ALT_NAMES=mac.local\n";
    const found = await discoverServer(macInput(text));
    assert.ok(found.ok);
    assert.equal(found.target.url, "https://mac.local:1975");
    assert.equal(found.target.caFile, MAC_CA);
    const withSetting = await discoverServer(macInput(text, { caFile: " /Users/me/ca.pem " }));
    assert.ok(withSetting.ok);
    assert.equal(withSetting.target.caFile, "/Users/me/ca.pem");
  });

  it("still lets a configured server address win", async () => {
    const outcome = await discoverServer(
      macInput("SERVER_BIND_ADDRESS=192.168.75.1\nSERVER_PORT=1975\n", {
        serverUrl: "https://192.168.75.1:1975",
        caFile: "/Users/me/ca.pem",
      }),
    );
    assert.ok(outcome.ok);
    assert.equal(outcome.target.url, "https://192.168.75.1:1975");
    assert.equal(outcome.target.source, "setting");
    assert.equal(outcome.target.caFile, "/Users/me/ca.pem");
  });

  it("reads server.env again at every discovery, so a changed port is seen at once", async () => {
    let text = "SERVER_BIND_ADDRESS=192.168.75.1\nSERVER_PORT=1975\n";
    let reads = 0;
    const input = macInput(undefined, {
      readText: async (file) => {
        reads += 1;
        return file === MAC_ENV ? text : undefined;
      },
    });
    const first = await discoverServer(input);
    text = "SERVER_BIND_ADDRESS=10.0.0.7\nSERVER_PORT=2001\n";
    const second = await discoverServer(input);
    assert.ok(first.ok && second.ok);
    assert.equal(first.target.url, "http://127.0.0.1:1975");
    assert.equal(second.target.url, "http://127.0.0.1:2001");
    assert.equal(reads, 2);
  });
});
