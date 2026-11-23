import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { ROOT, readJson } from "./support/repo";

interface Manifest {
  icon?: string;
  files: string[];
}

const ICON = "images/icon.png";
const manifest = readJson<Manifest>("package.json");

describe("extension icon", () => {
  it("is declared in the manifest and kept in the package", () => {
    assert.equal(manifest.icon, ICON);
    assert.ok(manifest.files.includes(ICON));
  });

  it("is a 256 by 256 PNG with an alpha channel", () => {
    const bytes = readFileSync(path.join(ROOT, ICON));
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok(bytes.subarray(0, 8).equals(signature), "not a PNG file");
    assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
    assert.equal(bytes.readUInt32BE(16), 256);
    assert.equal(bytes.readUInt32BE(20), 256);
    // Colour type 6 is truecolour with alpha: the background stays transparent.
    assert.equal(bytes[25], 6);
  });
});
