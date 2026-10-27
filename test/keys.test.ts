import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanKey, readKey, removeKey, saveKey, secretName, type SecretStore } from "../src/keys";

function memoryStore(): SecretStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (name) => data.get(name),
    store: async (name, value) => void data.set(name, value),
    delete: async (name) => void data.delete(name),
  };
}

describe("secretName", () => {
  it("is fixed per server address", () => {
    assert.equal(
      secretName("http://192.168.1.83:8090/"),
      "assistantCabinetCoder.apiKey:http://192.168.1.83:8090",
    );
    assert.equal(secretName("http://192.168.1.83:8090"), secretName("http://192.168.1.83:8090/"));
    assert.notEqual(secretName("http://a:1"), secretName("http://a:2"));
    assert.equal(secretName("garbage"), undefined);
  });
});

describe("cleanKey", () => {
  it("trims and accepts visible characters only", () => {
    assert.equal(cleanKey("  sk-abc123  "), "sk-abc123");
    for (const bad of [
      "",
      "   ",
      "has space",
      "line\nbreak",
      "tab\tx",
      "caf\u00e9",
      "x".repeat(513),
    ]) {
      assert.equal(cleanKey(bad), undefined);
    }
    assert.equal(cleanKey(undefined), undefined);
  });
});

describe("key store", () => {
  it("saves, reads and removes a key under the server's name", async () => {
    const store = memoryStore();
    assert.equal(await saveKey(store, "http://10.0.0.1:8090", " KEY-1 "), true);
    assert.equal(await readKey(store, "http://10.0.0.1:8090"), "KEY-1");
    assert.equal(await readKey(store, "http://10.0.0.2:8090"), undefined);
    assert.equal(await removeKey(store, "http://10.0.0.1:8090"), true);
    assert.equal(await readKey(store, "http://10.0.0.1:8090"), undefined);
    assert.equal(store.data.size, 0);
  });

  it("refuses an unusable key or address without storing anything", async () => {
    const store = memoryStore();
    assert.equal(await saveKey(store, "http://10.0.0.1:8090", "has space"), false);
    assert.equal(await saveKey(store, "nonsense", "KEY"), false);
    assert.equal(await removeKey(store, "nonsense"), false);
    assert.equal(store.data.size, 0);
  });
});
