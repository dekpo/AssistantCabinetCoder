import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { CabinetError } from "../src/codes";
import { parseSse, type SseEvent } from "../src/sse";
import {
  MAX_AGENTS,
  agentCount,
  agentFor,
  closeAgents,
  loadCaFile,
  open,
  type TransportOptions,
} from "../src/transport";
import {
  createAuthority,
  issueServerCertificate,
  privateKeyPem,
  type Authority,
} from "./support/pki";
import { startStub, type Stub } from "./stub-gateway/stub";

after(() => closeAgents());

function base(url: string, extra: Partial<TransportOptions> = {}): TransportOptions {
  return { baseUrl: url, timeoutSeconds: 5, ...extra };
}

async function failureOf(promise: Promise<unknown>): Promise<CabinetError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof CabinetError, "a CabinetError is thrown");
    return error;
  }
  assert.fail("the call should have failed");
}

async function collect(stream: AsyncIterable<SseEvent>): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function chat(scenario?: string): string {
  return JSON.stringify({
    model: "cabinet-code",
    stream: true,
    messages: [],
    stub_scenario: scenario,
  });
}

const chatBody = chat();

describe("transport over plain HTTP", () => {
  it("runs streaming and non-streaming calls through the same path", async () => {
    const stub = await startStub();
    try {
      const plain = await open(base(stub.url), { method: "GET", path: "/ide/v1/models" });
      assert.equal(plain.status, 200);
      assert.match(await plain.text(), /"ide_api":1/);

      const streamed = await open(base(stub.url), {
        method: "POST",
        path: "/ide/v1/chat/completions",
        body: chatBody,
        accept: "text/event-stream",
      });
      assert.equal(streamed.status, 200);
      const events = await collect(parseSse(streamed.chunks()));
      assert.equal(events.at(-1)?.kind, "done");
      assert.equal(events.filter((event) => event.kind === "data").length, 4);
    } finally {
      await stub.close();
    }
  });

  it("parses a stream whose bytes arrive three at a time", async () => {
    const stub = await startStub();
    try {
      const reply = await open(base(stub.url), {
        method: "POST",
        path: "/ide/v1/chat/completions",
        body: chat("split"),
        accept: "text/event-stream",
      });
      const events = await collect(parseSse(reply.chunks()));
      const texts = events.flatMap((event) =>
        event.kind === "data"
          ? [
              (event.value as { choices: { delta: { content?: string } }[] }).choices[0]?.delta
                .content,
            ]
          : [],
      );
      assert.ok(texts.includes("from the stub, caf\u00e9."));
    } finally {
      await stub.close();
    }
  });

  it("does not send an Authorization header without a key", async () => {
    const stub = await startStub();
    try {
      await (await open(base(stub.url), { method: "GET", path: "/health" })).text();
      await (await open(base(stub.url, { apiKey: "" }), { method: "GET", path: "/health" })).text();
      await (
        await open(base(stub.url, { apiKey: "K1" }), { method: "GET", path: "/health" })
      ).text();
      assert.deepEqual(
        stub.requests.map((request) => request.authorization),
        [undefined, undefined, "Bearer K1"],
      );
    } finally {
      await stub.close();
    }
  });

  it("refuses a path that is not an absolute path on the server", async () => {
    const stub = await startStub();
    try {
      for (const bad of ["health", "//other-host/health", "http://other-host/health"]) {
        assert.equal(
          (await failureOf(open(base(stub.url), { method: "GET", path: bad }))).code,
          "invalid_server_url",
        );
      }
      assert.equal(stub.requests.length, 0);
    } finally {
      await stub.close();
    }
  });

  it("aborts the socket when the call is cancelled while waiting for the first byte", async () => {
    const stub = await startStub({ slowFirstByteMs: 3000 });
    try {
      const controller = new AbortController();
      const pending = open(base(stub.url, { timeoutSeconds: 30 }), {
        method: "POST",
        path: "/ide/v1/chat/completions",
        body: chat("slow"),
        signal: controller.signal,
      });
      while (stub.requests.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      controller.abort();
      assert.equal((await failureOf(pending)).code, "cancelled");
      for (let wait = 0; stub.aborted === 0 && wait < 100; wait += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(stub.aborted, 1, "the server saw the connection close");
    } finally {
      await stub.close();
    }
  });

  it("stops reading a response when the call is cancelled mid-stream", async () => {
    const stub = await startStub({ mode: "oversize" });
    try {
      const controller = new AbortController();
      const reply = await open(base(stub.url, { timeoutSeconds: 30 }), {
        method: "GET",
        path: "/ide/v1/models",
        signal: controller.signal,
      });
      let seen = 0;
      const reading = (async () => {
        for await (const chunk of reply.chunks()) {
          seen += chunk.length;
          controller.abort();
        }
      })();
      assert.equal((await failureOf(reading)).code, "cancelled");
      assert.ok(seen < 5 * 1024 * 1024);
    } finally {
      await stub.close();
    }
  });

  it("refuses to start when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await failureOf(
      open(base("http://127.0.0.1:9"), {
        method: "GET",
        path: "/health",
        signal: controller.signal,
      }),
    );
    assert.equal(error.code, "cancelled");
  });

  it("gives up when no byte arrives within the timeout", async () => {
    const stub = await startStub({ slowFirstByteMs: 3000 });
    try {
      const started = Date.now();
      const error = await failureOf(
        open(base(stub.url, { timeoutSeconds: 0.3 }), {
          method: "POST",
          path: "/ide/v1/chat/completions",
          body: chat("slow"),
          accept: "text/event-stream",
        }),
      );
      assert.equal(error.code, "timeout");
      assert.ok(Date.now() - started < 2500);
    } finally {
      await stub.close();
    }
  });

  it("reuses one keep-alive connection for successive calls", async () => {
    const stub = await startStub();
    try {
      for (let index = 0; index < 3; index += 1) {
        await (await open(base(stub.url), { method: "GET", path: "/health" })).text();
      }
      assert.equal(stub.connections, 1);
      assert.equal(stub.requests.length, 3);
    } finally {
      await stub.close();
    }
  });

  it("keeps a bounded number of agents, one per server address", () => {
    closeAgents();
    const first = agentFor("http://10.0.0.1:1");
    assert.equal(agentFor("http://10.0.0.1:1/"), first);
    for (let port = 2; port < 40; port += 1) {
      agentFor(`http://10.0.0.1:${port}`);
    }
    assert.equal(agentCount(), MAX_AGENTS);
    assert.notEqual(agentFor("http://10.0.0.1:1"), first);
    closeAgents();
    assert.equal(agentCount(), 0);
  });

  it("caps a JSON body but not a stream", async () => {
    const stub = await startStub({ mode: "oversize" });
    try {
      const capped = await open(base(stub.url, { maxBodyBytes: 100_000 }), {
        method: "GET",
        path: "/ide/v1/models",
      });
      assert.equal((await failureOf(capped.text())).code, "response_too_large");

      const stream = await open(base(stub.url), { method: "GET", path: "/ide/v1/models" });
      let total = 0;
      for await (const chunk of stream.chunks()) {
        total += chunk.length;
      }
      assert.ok(total > 5 * 1024 * 1024);
    } finally {
      await stub.close();
    }
  });
});

describe("transport over HTTPS", () => {
  let folder: string;
  let authority: Authority;
  let other: Authority;
  let stub: Stub;
  let goodFile: string;

  before(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "acc-tls-"));
    authority = createAuthority("Test Authority One");
    other = createAuthority("Test Authority Two");
    const server = issueServerCertificate(authority, { dns: ["localhost"], ips: ["127.0.0.1"] });
    stub = await startStub({ tls: { key: server.keyPem, cert: server.certPem } });
    goodFile = path.join(folder, "ca.pem");
    await writeFile(goodFile, authority.certPem);
  });

  after(async () => {
    await stub.close();
    await rm(folder, { recursive: true, force: true });
  });

  it("trusts the server signed by the authority file", async () => {
    const reply = await open(base(stub.url, { caFile: goodFile }), {
      method: "GET",
      path: "/health",
    });
    assert.equal(reply.status, 200);
    assert.match(await reply.text(), /ok/);
  });

  it("refuses the server when the authority file holds another authority", async () => {
    const file = path.join(folder, "other.pem");
    await writeFile(file, other.certPem);
    const error = await failureOf(
      open(base(stub.url, { caFile: file }), { method: "GET", path: "/health" }),
    );
    assert.equal(error.code, "certificate_untrusted");
    assert.ok(error.detail !== undefined && /^[A-Z0-9_]+$/.test(error.detail));
  });

  it("refuses the server when no authority file is given and the system does not know it", async () => {
    const error = await failureOf(open(base(stub.url), { method: "GET", path: "/health" }));
    assert.equal(error.code, "certificate_untrusted");
  });

  it("refuses a certificate whose names do not include the address used", async () => {
    const server = issueServerCertificate(authority, { dns: ["somewhere.example"] });
    const wrongName = await startStub({ tls: { key: server.keyPem, cert: server.certPem } });
    try {
      const error = await failureOf(
        open(base(wrongName.url, { caFile: goodFile }), { method: "GET", path: "/health" }),
      );
      assert.equal(error.code, "certificate_untrusted");
      assert.equal(error.detail, "ERR_TLS_CERT_ALTNAME_INVALID");
    } finally {
      await wrongName.close();
    }
  });

  it("refuses a file that contains a private key, before any connection", async () => {
    const file = path.join(folder, "with-key.pem");
    await writeFile(file, authority.certPem + privateKeyPem(authority));
    const connectionsBefore = stub.connections;
    const error = await failureOf(
      open(base(stub.url, { caFile: file }), { method: "GET", path: "/health" }),
    );
    assert.equal(error.code, "ca_file_has_private_key");
    assert.equal(stub.connections, connectionsBefore);
  });

  it("refuses an unreadable file and a file that is not a certificate", async () => {
    assert.equal(
      (await failureOf(loadCaFile(path.join(folder, "missing.pem")))).code,
      "ca_file_unreadable",
    );
    assert.equal((await failureOf(loadCaFile(folder))).code, "ca_file_unreadable");
    const text = path.join(folder, "text.pem");
    await writeFile(text, "just some text\n");
    assert.equal((await failureOf(loadCaFile(text))).code, "ca_file_not_certificate");
    const broken = path.join(folder, "broken.pem");
    await writeFile(broken, "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n");
    assert.equal((await failureOf(loadCaFile(broken))).code, "ca_file_not_certificate");
  });

  it("returns only the certificate blocks of a bundle", async () => {
    const file = path.join(folder, "bundle.pem");
    await writeFile(file, `# note\n${authority.certPem}\n${other.certPem}`);
    const loaded = await loadCaFile(file);
    assert.equal(loaded.match(/BEGIN CERTIFICATE/g)?.length, 2);
    assert.equal(loaded.includes("note"), false);
  });

  it("re-reads the authority file at each request", async () => {
    const file = path.join(folder, "changing.pem");
    const options = base(stub.url, { caFile: file });
    await writeFile(file, authority.certPem);
    assert.equal((await open(options, { method: "GET", path: "/health" })).status, 200);

    await writeFile(file, other.certPem);
    assert.equal(
      (await failureOf(open(options, { method: "GET", path: "/health" }))).code,
      "certificate_untrusted",
    );

    await writeFile(file, "garbage");
    assert.equal(
      (await failureOf(open(options, { method: "GET", path: "/health" }))).code,
      "ca_file_not_certificate",
    );

    await writeFile(file, authority.certPem);
    assert.equal((await open(options, { method: "GET", path: "/health" })).status, 200);
  });
});
