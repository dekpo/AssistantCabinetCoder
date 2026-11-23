import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";

/** The repository root: compiled tests live in `out/test/...`. */
export const ROOT = path.resolve(__dirname, "..", "..", "..");

export function readText(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

export function readJson<T>(relative: string): T {
  return JSON.parse(readText(relative)) as T;
}

/** Files below `relative` (a folder of the repository) with one of the extensions, sorted. */
export function listFiles(relative: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (folder: string): void => {
    for (const name of readdirSync(path.join(ROOT, folder)).sort()) {
      const child = path.posix.join(folder, name);
      if (statSync(path.join(ROOT, child)).isDirectory()) {
        walk(child);
      } else if (extensions.some((extension) => name.endsWith(extension))) {
        found.push(child);
      }
    }
  };
  walk(relative);
  return found;
}
