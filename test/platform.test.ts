import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { platformKind, publicCaFile, serverConfigFolder, serverEnvFile } from "../src/platform";

describe("platform", () => {
  it("names the three platform kinds", () => {
    assert.equal(platformKind("win32"), "windows");
    assert.equal(platformKind("darwin"), "macos");
    assert.equal(platformKind("linux"), "other");
    assert.equal(platformKind("freebsd"), "other");
  });

  it("uses ProgramData on Windows", () => {
    const env = { ProgramData: "D:\\Data" };
    assert.equal(serverConfigFolder("win32", env), "D:\\Data\\AssistantCabinetServer\\config");
    assert.equal(
      serverEnvFile("win32", env),
      "D:\\Data\\AssistantCabinetServer\\config\\server.env",
    );
    assert.equal(publicCaFile("win32", env), "D:\\Data\\AssistantCabinetServer\\config\\ca.pem");
  });

  it("falls back to C:\\ProgramData when the variable is missing or not absolute", () => {
    const expected = "C:\\ProgramData\\AssistantCabinetServer\\config";
    assert.equal(serverConfigFolder("win32", {}), expected);
    assert.equal(serverConfigFolder("win32", { ProgramData: "relative" }), expected);
  });

  it("reads the upper-case spelling of the variable", () => {
    assert.equal(
      serverConfigFolder("win32", { PROGRAMDATA: "E:\\PD" }),
      "E:\\PD\\AssistantCabinetServer\\config",
    );
  });

  it("uses the Application Support folder on macOS", () => {
    assert.equal(
      serverEnvFile("darwin", {}),
      "/Library/Application Support/AssistantCabinetServer/config/server.env",
    );
    assert.equal(
      publicCaFile("darwin", {}),
      "/Library/Application Support/AssistantCabinetServer/config/ca.pem",
    );
  });

  it("has no folder on another platform", () => {
    assert.equal(serverConfigFolder("linux", {}), undefined);
    assert.equal(serverEnvFile("linux", {}), undefined);
    assert.equal(publicCaFile("linux", {}), undefined);
  });
});
