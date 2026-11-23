/**
 * The workspace rules of the panel's tools (Lot P0b): where a path may lead, what may be read, and
 * how an edit is planned. Pure: the file system is passed in (`WorkspaceFs`), so the tests use
 * temporary folders and the adapter gives the real one. Nothing here writes: an edit is only
 * planned here, and applied by the editor after the user's click (the adapter `extension`).
 *
 * The safety rules are those of the paused Lot X2a: a path is resolved with `realpath` and must lie
 * inside an open workspace folder (a symbolic link that leads outside is refused); a file over the
 * size limit and a binary file are refused before their text is used. Failures are reasons, never
 * text: the path and the content stay out of every error.
 */
import { promises as nodeFs } from "node:fs";
import * as path from "node:path";

/** A file larger than this is never read, searched or edited. */
export const MAX_FILE_BYTES = 1_000_000;
/** One `read_file` call returns at most this many lines and characters. */
export const MAX_READ_LINES = 400;
export const MAX_READ_CHARS = 40_000;
/** One `list_files` call returns at most this many entries. */
export const MAX_LIST_ENTRIES = 200;
/** One `search_text` call returns at most this many lines and visits at most this many files. */
export const MAX_SEARCH_RESULTS = 50;
export const MAX_SEARCH_FILES = 2000;
/** A line of a search result is cut to this many characters. */
export const MAX_SEARCH_LINE_CHARS = 200;
/** The longest path and the longest query a tool accepts. */
export const MAX_PATH_CHARS = 1024;
export const MAX_QUERY_CHARS = 200;
/** Folders that listing and searching skip. */
export const SKIPPED_FOLDERS: readonly string[] = [".git", "node_modules"];
/** How many first bytes are checked for a NUL byte, the sign of a binary file. */
const BINARY_PROBE_BYTES = 8192;

export type EntryKind = "file" | "folder" | "other";

export interface FileStat {
  kind: EntryKind;
  size: number;
}

export interface DirEntry {
  name: string;
  /** A symbolic link is `other`: it is listed, never followed by a search. */
  kind: EntryKind;
}

/** The read-only file system the tools need. Every method rejects when the path is missing. */
export interface WorkspaceFs {
  realpath(target: string): Promise<string>;
  stat(target: string): Promise<FileStat>;
  readFile(target: string): Promise<Uint8Array>;
  readDir(target: string): Promise<DirEntry[]>;
}

function kindOf(entry: { isFile(): boolean; isDirectory(): boolean }): EntryKind {
  return entry.isFile() ? "file" : entry.isDirectory() ? "folder" : "other";
}

/**
 * The real file system, read only: `realpath` (the operating system's own, so the case of a name
 * is the disk's), `stat` (following links: a path is checked with `realpath` before), `readFile`
 * and `readdir`. There is no write method, and the guards keep it so.
 */
export const nodeWorkspaceFs: WorkspaceFs = {
  realpath: (target) => nodeFs.realpath(target),
  stat: async (target) => {
    const stat = await nodeFs.stat(target);
    return { kind: kindOf(stat), size: stat.size };
  },
  readFile: (target) => nodeFs.readFile(target),
  readDir: async (target) =>
    (await nodeFs.readdir(target, { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      kind: entry.isSymbolicLink() ? "other" : kindOf(entry),
    })),
};

export type WorkspaceReason =
  | "no_workspace"
  | "invalid_path"
  | "outside_workspace"
  | "not_found"
  | "not_a_file"
  | "not_a_folder"
  | "too_large"
  | "binary"
  | "unreadable";

/** A refusal. `message` is the reason: never a path, never content. */
export class WorkspaceError extends Error {
  constructor(readonly reason: WorkspaceReason) {
    super(reason);
    this.name = "WorkspaceError";
  }
}

export interface ResolvedPath {
  /** The real absolute path (symbolic links resolved). */
  absolute: string;
  /** The path relative to its workspace folder, with forward slashes; `.` for the folder itself. */
  display: string;
  /** Whether something exists at that path. */
  exists: boolean;
}

function inside(root: string, candidate: string): boolean {
  return (
    candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : root + path.sep)
  );
}

function displayOf(root: string, absolute: string): string {
  const relative = path.relative(root, absolute);
  return relative === "" ? "." : relative.split(path.sep).join("/");
}

async function realRoots(fs: WorkspaceFs, roots: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (const root of roots) {
    try {
      out.push(await fs.realpath(root));
    } catch {
      // A workspace folder that no longer exists offers nothing.
    }
  }
  return out;
}

/**
 * Resolves a path the model gave: relative to the first workspace folder, or absolute. The real
 * path (every symbolic link followed) must lie inside one of the folders. With `mayBeMissing`, a
 * path that does not exist yet is resolved through its nearest existing parent (for a new file).
 */
export async function resolvePath(
  fs: WorkspaceFs,
  roots: readonly string[],
  requested: string,
  mayBeMissing = false,
): Promise<ResolvedPath> {
  const folders = await realRoots(fs, roots);
  const first = folders[0];
  if (first === undefined) {
    throw new WorkspaceError("no_workspace");
  }
  const wanted = requested.trim();
  if (wanted.length > MAX_PATH_CHARS || wanted.includes("\0")) {
    throw new WorkspaceError("invalid_path");
  }
  const candidate = path.isAbsolute(wanted) ? path.resolve(wanted) : path.resolve(first, wanted);
  let absolute: string;
  let exists = true;
  try {
    absolute = await fs.realpath(candidate);
  } catch {
    if (!mayBeMissing) {
      // A missing path inside the workspace is "not found"; outside it, the answer is the same
      // refusal as for an existing one, so the model learns nothing about the rest of the disk.
      throw new WorkspaceError(
        folders.some((root) => inside(root, candidate)) ? "not_found" : "outside_workspace",
      );
    }
    exists = false;
    absolute = await missingPath(fs, candidate);
  }
  const root = folders.find((folder) => inside(folder, absolute));
  if (root === undefined) {
    throw new WorkspaceError("outside_workspace");
  }
  return { absolute, display: displayOf(root, absolute), exists };
}

/** The real path of a file that does not exist yet: its nearest existing parent, resolved. */
async function missingPath(fs: WorkspaceFs, candidate: string): Promise<string> {
  const rest: string[] = [];
  let current = candidate;
  for (;;) {
    const parent = path.dirname(current);
    rest.unshift(path.basename(current));
    if (parent === current) {
      throw new WorkspaceError("outside_workspace");
    }
    try {
      return path.join(await fs.realpath(parent), ...rest);
    } catch {
      current = parent;
    }
  }
}

/** A NUL byte in the first bytes, or bytes that are not UTF-8, make a file binary. */
export function decodeText(bytes: Uint8Array): string {
  const probe = bytes.subarray(0, BINARY_PROBE_BYTES);
  if (probe.includes(0)) {
    throw new WorkspaceError("binary");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new WorkspaceError("binary");
  }
}

/** The text of a file inside the workspace: refused when too large or binary, before any use. */
export async function readWorkspaceText(
  fs: WorkspaceFs,
  absolute: string,
): Promise<{ text: string; size: number }> {
  let stat: FileStat;
  try {
    stat = await fs.stat(absolute);
  } catch {
    throw new WorkspaceError("not_found");
  }
  if (stat.kind !== "file") {
    throw new WorkspaceError("not_a_file");
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new WorkspaceError("too_large");
  }
  let bytes: Uint8Array;
  try {
    bytes = await fs.readFile(absolute);
  } catch {
    throw new WorkspaceError("unreadable");
  }
  if (bytes.length > MAX_FILE_BYTES) {
    throw new WorkspaceError("too_large");
  }
  return { text: decodeText(bytes), size: bytes.length };
}

/** The lines of a text: a final line break does not make an empty last line. */
export function splitLines(text: string): string[] {
  if (text === "") {
    return [];
  }
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

export interface FileExcerpt {
  display: string;
  /** The lines, numbered from `from`, each `<number>\t<text>`. */
  numbered: string[];
  from: number;
  to: number;
  total: number;
  /** Whether lines after `to` exist. */
  more: boolean;
}

/** Lines `start` to `end` of a file (1-based, inclusive), bounded in lines and characters. */
export async function readFileExcerpt(
  fs: WorkspaceFs,
  roots: readonly string[],
  requested: string,
  start?: number,
  end?: number,
): Promise<FileExcerpt> {
  const target = await resolvePath(fs, roots, requested);
  const { text } = await readWorkspaceText(fs, target.absolute);
  const lines = splitLines(text);
  const from = Math.max(1, start ?? 1);
  const last = Math.min(lines.length, end ?? Number.MAX_SAFE_INTEGER, from + MAX_READ_LINES - 1);
  const numbered: string[] = [];
  let chars = 0;
  let to = from - 1;
  for (let line = from; line <= last; line += 1) {
    const entry = `${line}\t${lines[line - 1] ?? ""}`;
    if (numbered.length > 0 && chars + entry.length > MAX_READ_CHARS) {
      break;
    }
    numbered.push(entry.length > MAX_READ_CHARS ? entry.slice(0, MAX_READ_CHARS) : entry);
    chars += entry.length + 1;
    to = line;
  }
  return {
    display: target.display,
    numbered,
    from,
    to,
    total: lines.length,
    more: to < lines.length,
  };
}

export interface FolderListing {
  display: string;
  /** Folders first, then the rest, each sorted by name; a folder's name ends with `/`. */
  entries: string[];
  truncated: boolean;
}

function byName(a: DirEntry, b: DirEntry): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** The entries of a folder inside the workspace, without `.git` and `node_modules`. */
export async function listFolder(
  fs: WorkspaceFs,
  roots: readonly string[],
  requested: string,
): Promise<FolderListing> {
  const target = await resolvePath(fs, roots, requested === "" ? "." : requested);
  const entries = await folderEntries(fs, target.absolute);
  const folders = entries.filter((entry) => entry.kind === "folder").sort(byName);
  const others = entries.filter((entry) => entry.kind !== "folder").sort(byName);
  const names = [...folders.map((entry) => `${entry.name}/`), ...others.map((entry) => entry.name)];
  return {
    display: target.display,
    entries: names.slice(0, MAX_LIST_ENTRIES),
    truncated: names.length > MAX_LIST_ENTRIES,
  };
}

async function folderEntries(fs: WorkspaceFs, absolute: string): Promise<DirEntry[]> {
  let stat: FileStat;
  try {
    stat = await fs.stat(absolute);
  } catch {
    throw new WorkspaceError("not_found");
  }
  if (stat.kind !== "folder") {
    throw new WorkspaceError("not_a_folder");
  }
  try {
    const entries = await fs.readDir(absolute);
    return entries.filter(
      (entry) => !(entry.kind === "folder" && SKIPPED_FOLDERS.includes(entry.name)),
    );
  } catch {
    throw new WorkspaceError("unreadable");
  }
}

export interface SearchMatch {
  display: string;
  line: number;
  text: string;
}

export interface SearchOutcome {
  display: string;
  matches: SearchMatch[];
  /** More matches exist, or the file limit was reached before the search ended. */
  truncated: boolean;
  filesSearched: number;
}

/**
 * Plain text search (never a regular expression) in the text files below a folder, or in one file.
 * Case is ignored unless the query holds a capital letter. Symbolic links are not followed; large,
 * binary and unreadable files are skipped.
 */
export async function searchText(
  fs: WorkspaceFs,
  roots: readonly string[],
  query: string,
  requested: string,
): Promise<SearchOutcome> {
  const target = await resolvePath(fs, roots, requested === "" ? "." : requested);
  const folders = await realRoots(fs, roots);
  const root = folders.find((folder) => inside(folder, target.absolute)) ?? target.absolute;
  const ignoreCase = query === query.toLowerCase();
  const needle = ignoreCase ? query.toLowerCase() : query;
  const outcome: SearchOutcome = {
    display: target.display,
    matches: [],
    truncated: false,
    filesSearched: 0,
  };
  let stat: FileStat;
  try {
    stat = await fs.stat(target.absolute);
  } catch {
    throw new WorkspaceError("not_found");
  }
  const files: string[] = [];
  if (stat.kind === "file") {
    files.push(target.absolute);
  } else if (stat.kind === "folder") {
    await collectFiles(fs, target.absolute, files);
  } else {
    throw new WorkspaceError("not_a_folder");
  }
  if (files.length > MAX_SEARCH_FILES) {
    files.length = MAX_SEARCH_FILES;
    outcome.truncated = true;
  }
  for (const file of files) {
    let text: string;
    try {
      text = (await readWorkspaceText(fs, file)).text;
    } catch {
      continue;
    }
    outcome.filesSearched += 1;
    const lines = splitLines(text);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if ((ignoreCase ? line.toLowerCase() : line).includes(needle)) {
        if (outcome.matches.length >= MAX_SEARCH_RESULTS) {
          outcome.truncated = true;
          return outcome;
        }
        const trimmed = line.trim();
        outcome.matches.push({
          display: displayOf(root, file),
          line: index + 1,
          text:
            trimmed.length > MAX_SEARCH_LINE_CHARS
              ? `${trimmed.slice(0, MAX_SEARCH_LINE_CHARS)}...`
              : trimmed,
        });
      }
    }
  }
  return outcome;
}

/** Every file below a folder, breadth first, sorted, at most one more than the limit. */
async function collectFiles(fs: WorkspaceFs, top: string, out: string[]): Promise<void> {
  const queue = [top];
  while (queue.length > 0 && out.length <= MAX_SEARCH_FILES) {
    const folder = queue.shift() as string;
    let entries: DirEntry[];
    try {
      entries = (await fs.readDir(folder)).sort(byName);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.kind === "file") {
        out.push(full);
      } else if (entry.kind === "folder" && !SKIPPED_FOLDERS.includes(entry.name)) {
        queue.push(full);
      }
    }
  }
}

export type EditReason =
  "text_not_found" | "text_not_unique" | "file_missing" | "file_exists" | "no_change";

export type EditPlan =
  | {
      ok: true;
      kind: "create" | "edit";
      /** The file's text before and after the change. */
      before: string;
      after: string;
      /** Where `old_text` starts and ends in `before` (both 0 for a new file). */
      start: number;
      end: number;
    }
  | { ok: false; reason: EditReason };

/**
 * Plans the replacement of one exact, unique occurrence of `oldText`. `current` is the file's text,
 * or `undefined` when the file does not exist: then only an empty `oldText` is accepted, and the
 * file is created with `newText`. Nothing is written here.
 */
export function planEdit(current: string | undefined, oldText: string, newText: string): EditPlan {
  if (current === undefined) {
    return oldText === ""
      ? { ok: true, kind: "create", before: "", after: newText, start: 0, end: 0 }
      : { ok: false, reason: "file_missing" };
  }
  if (oldText === "") {
    return current === ""
      ? { ok: true, kind: "edit", before: "", after: newText, start: 0, end: 0 }
      : { ok: false, reason: "file_exists" };
  }
  if (oldText === newText) {
    return { ok: false, reason: "no_change" };
  }
  const start = current.indexOf(oldText);
  if (start < 0) {
    return { ok: false, reason: "text_not_found" };
  }
  if (current.indexOf(oldText, start + 1) >= 0) {
    return { ok: false, reason: "text_not_unique" };
  }
  const end = start + oldText.length;
  return {
    ok: true,
    kind: "edit",
    before: current,
    after: current.slice(0, start) + newText + current.slice(end),
    start,
    end,
  };
}
