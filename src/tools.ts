/**
 * The chat panel's four workspace tools (Lot P0b): what the model is told about them, how a call's
 * arguments are checked, and how a call is run. Pure: the file system, the workspace folders and
 * the user's decision on an edit are passed in (`ToolDeps`).
 *
 * Every text here is read by the model only. It is neutral about who the user is (no profession,
 * no organisation): a guard test sits beside this file. Names are short and plain, chosen for
 * small local models. Nothing here writes: `propose_edit` only plans a change and asks the user;
 * the editor applies it after the click (the adapter `extension`).
 *
 * Malformed arguments are never thrown: they become a result the model reads
 * ("invalid arguments: ...") so that it can correct itself.
 */
import { parseArguments } from "./convert";
import { TOOL_NOTES } from "./messages";
import {
  MAX_QUERY_CHARS,
  WorkspaceError,
  listFolder,
  planEdit,
  readFileExcerpt,
  readWorkspaceText,
  resolvePath,
  searchText,
  type EditReason,
  type WorkspaceFs,
  type WorkspaceReason,
} from "./workspace";

export const TOOL_NAMES = ["read_file", "list_files", "search_text", "propose_edit"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** The longest `old_text` or `new_text` of one edit, in characters. */
export const MAX_EDIT_CHARS = 200_000;

/** Sent first in every request that offers the tools. Short on purpose: small windows. */
export const SYSTEM_PROMPT = [
  "You are a coding assistant working in the project open in the editor.",
  "Use the tools to look at the project before you answer: list_files and search_text to find code, read_file to read it.",
  "To change a file, call propose_edit; read the file first and copy old_text exactly from it.",
  "Paths are relative to the project folder.",
  "Each edit is shown to the user, who accepts or rejects it: say a change was made only when the result says it was applied.",
  "Answer in the language of the user's message, briefly.",
].join(" ");

export interface ToolDefinition {
  type: "function";
  function: { name: ToolName; description: string; parameters: object };
}

const PATH_PARAMETER = {
  type: "string",
  description: "Path relative to the project folder, for example src/main.py.",
};

/** The four tools, as the contract's `tools` field carries them. */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a text file of the project. Returns its lines, each preceded by its number and a tab. A long file is returned in parts: use start_line and end_line to read further.",
      parameters: {
        type: "object",
        properties: {
          path: PATH_PARAMETER,
          start_line: { type: "integer", description: "First line to read, from 1." },
          end_line: { type: "integer", description: "Last line to read." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List the files and folders of a folder of the project. Folder names end with a slash.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Folder relative to the project folder; empty for the project folder.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_text",
      description:
        "Search the text files of the project for a plain text (not a regular expression). Returns each matching line with its file and line number. Case is ignored unless the text holds a capital letter.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The text to find." },
          path: {
            type: "string",
            description: "A folder or file to search in; empty for the whole project.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_edit",
      description:
        "Propose a change to one file. old_text must be copied exactly from the file's current text (spaces and line breaks included) and appear only once; it is replaced by new_text. To create a new file, give an empty old_text and the whole file as new_text. The user sees the change and accepts or rejects it; the result says which.",
      parameters: {
        type: "object",
        properties: {
          path: PATH_PARAMETER,
          old_text: { type: "string", description: "The exact text to replace." },
          new_text: { type: "string", description: "The text that replaces it." },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
  },
];

export type ToolRequest =
  | { tool: "read_file"; path: string; startLine: number | undefined; endLine: number | undefined }
  | { tool: "list_files"; path: string }
  | { tool: "search_text"; query: string; path: string }
  | { tool: "propose_edit"; path: string; oldText: string; newText: string };

/** Why a call was not run, or how it failed: a closed list, so it can be logged. */
export type ToolReason =
  | "unknown_tool"
  | "invalid_arguments"
  | WorkspaceReason
  | EditReason
  | "file_changed"
  | "unsaved_changes"
  | "not_applied";

export type ParsedCall =
  | { ok: true; request: ToolRequest }
  | { ok: false; reason: "unknown_tool" | "invalid_arguments"; result: string };

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

function invalid(detail: string): ParsedCall {
  return { ok: false, reason: "invalid_arguments", result: `Error: invalid arguments: ${detail}.` };
}

/** A whole number from 1, also when a small model sends it as a string. */
function lineNumber(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number =
    typeof value === "string" && /^\d{1,9}$/.test(value.trim()) ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number >= 1 ? number : null;
}

function optionalPath(value: unknown): string | null {
  return value === undefined || value === null ? "" : typeof value === "string" ? value : null;
}

/** Checks a call's name and arguments (the JSON text the model sent). */
export function parseToolCall(name: string, argumentsText: string): ParsedCall {
  if (!isToolName(name)) {
    return {
      ok: false,
      reason: "unknown_tool",
      result: `Error: there is no tool with that name. The tools are ${TOOL_NAMES.join(", ")}.`,
    };
  }
  let args: Record<string, unknown>;
  try {
    args = parseArguments(argumentsText, undefined) as Record<string, unknown>;
  } catch {
    return invalid("the arguments are not a JSON object");
  }
  switch (name) {
    case "read_file": {
      const path = args["path"];
      const startLine = lineNumber(args["start_line"]);
      const endLine = lineNumber(args["end_line"]);
      if (typeof path !== "string" || path.trim() === "") {
        return invalid("path must be a non-empty string");
      }
      if (startLine === null || endLine === null) {
        return invalid("start_line and end_line must be whole numbers from 1");
      }
      return { ok: true, request: { tool: name, path, startLine, endLine } };
    }
    case "list_files": {
      const path = optionalPath(args["path"]);
      return path === null
        ? invalid("path must be a string")
        : { ok: true, request: { tool: name, path } };
    }
    case "search_text": {
      const query = args["query"];
      const path = optionalPath(args["path"]);
      if (typeof query !== "string" || query === "" || query.length > MAX_QUERY_CHARS) {
        return invalid(`query must be a non-empty string of at most ${MAX_QUERY_CHARS} characters`);
      }
      if (path === null) {
        return invalid("path must be a string");
      }
      return { ok: true, request: { tool: name, query, path } };
    }
    case "propose_edit": {
      const path = args["path"];
      const oldText = args["old_text"];
      const newText = args["new_text"];
      if (typeof path !== "string" || path.trim() === "") {
        return invalid("path must be a non-empty string");
      }
      if (typeof oldText !== "string" || typeof newText !== "string") {
        return invalid("old_text and new_text must be strings");
      }
      if (oldText.length > MAX_EDIT_CHARS || newText.length > MAX_EDIT_CHARS) {
        return invalid(`old_text and new_text must hold at most ${MAX_EDIT_CHARS} characters`);
      }
      return { ok: true, request: { tool: name, path, oldText, newText } };
    }
  }
}

/** What the panel shows of a call: its target (a path or a query), never a file's content. */
export function targetOf(name: string, argumentsText: string): string {
  const parsed = parseToolCall(name, argumentsText);
  if (!parsed.ok) {
    return "";
  }
  const request = parsed.request;
  return request.tool === "search_text"
    ? request.query
    : request.path.trim() === ""
      ? "."
      : request.path.trim();
}

/** A change waiting for the user's decision. */
export interface EditProposal {
  /** The real absolute path, and the path relative to its workspace folder. */
  absolute: string;
  display: string;
  kind: "create" | "edit";
  before: string;
  after: string;
  /** Where the replaced text starts and ends in `before`. */
  start: number;
  end: number;
  newText: string;
}

/** What became of a proposed change. */
export type EditDecision =
  "applied" | "rejected" | "stopped" | "file_changed" | "unsaved_changes" | "not_applied";

export interface ToolDeps {
  fs: WorkspaceFs;
  /** The open workspace folders, absolute. */
  roots: readonly string[];
  /** Shows the change and waits for the user; applies it on Accept (through the editor). */
  proposeEdit(proposal: EditProposal): Promise<EditDecision>;
}

export type ToolStatus = "done" | "failed" | "accepted" | "rejected" | "stopped";

export interface ToolOutcome {
  status: ToolStatus;
  /** The text the model reads in the `tool` message. */
  result: string;
  /** A short note for the panel (from `messages.ts`): lines read, matches, why it failed. */
  note: string;
  /** Why it failed (logged as a code). */
  reason?: ToolReason | undefined;
}

/** The result the model reads for a refusal of the workspace rules. */
const REFUSALS: Record<WorkspaceReason | EditReason, string> = {
  no_workspace: "Error: no project folder is open.",
  invalid_path: "Error: the path is not valid.",
  outside_workspace:
    "Error: the path is outside the project folder. Only files inside it can be used.",
  not_found: "Error: nothing exists at this path. Use list_files to see what exists.",
  not_a_file: "Error: this path is not a file.",
  not_a_folder: "Error: this path is not a folder.",
  too_large: "Error: the file is too large to be read here.",
  binary: "Error: the file is not a text file.",
  unreadable: "Error: the file cannot be read.",
  text_not_found:
    "Error: old_text was not found in the file. Read the file again and copy old_text exactly.",
  text_not_unique:
    "Error: old_text appears more than once in the file. Include more lines around it so that it appears once.",
  file_missing:
    "Error: the file does not exist. To create it, give an empty old_text and the whole file as new_text.",
  file_exists:
    "Error: old_text is empty but the file already exists. Give the exact text to replace.",
  no_change: "Error: old_text and new_text are the same, so nothing would change.",
};

const DECISIONS: Record<Exclude<EditDecision, "applied" | "rejected">, string> = {
  stopped: "Not applied: the user stopped the request.",
  file_changed:
    "Not applied: the file changed since the edit was proposed. Read it again before proposing another edit.",
  unsaved_changes:
    "Not applied: the file has unsaved changes in the editor. Ask the user to save or discard them.",
  not_applied: "Not applied: the editor could not apply the change.",
};

/** The result given for a call that was not run because the user stopped the request. */
export const STOPPED_RESULT = "Not run: the user stopped the request.";
/** The result given for a call left without one by an editor window that closed. */
export const INTERRUPTED_RESULT = "Not run: the editor window closed before it ran.";

function failure(reason: ToolReason, result: string): ToolOutcome {
  return { status: "failed", result, note: TOOL_NOTES.reason(reason), reason };
}

/** Runs one call. Never throws: a refusal is a result the model reads. */
export async function runToolCall(
  name: string,
  argumentsText: string,
  deps: ToolDeps,
): Promise<ToolOutcome> {
  const parsed = parseToolCall(name, argumentsText);
  if (!parsed.ok) {
    return failure(parsed.reason, parsed.result);
  }
  try {
    return await run(parsed.request, deps);
  } catch (error) {
    const reason = error instanceof WorkspaceError ? error.reason : "unreadable";
    return failure(reason, REFUSALS[reason]);
  }
}

async function run(request: ToolRequest, deps: ToolDeps): Promise<ToolOutcome> {
  switch (request.tool) {
    case "read_file": {
      const excerpt = await readFileExcerpt(
        deps.fs,
        deps.roots,
        request.path,
        request.startLine,
        request.endLine,
      );
      const range =
        excerpt.numbered.length === 0
          ? `no lines in that range; the file has ${excerpt.total} lines`
          : `lines ${excerpt.from}-${excerpt.to} of ${excerpt.total}`;
      const lines = [`File ${excerpt.display} (${range}):`, ...excerpt.numbered];
      if (excerpt.more) {
        lines.push(`[More lines follow: call read_file with start_line ${excerpt.to + 1}.]`);
      }
      return {
        status: "done",
        result: lines.join("\n"),
        note: TOOL_NOTES.lines(excerpt.from, excerpt.to, excerpt.total),
      };
    }
    case "list_files": {
      const listing = await listFolder(deps.fs, deps.roots, request.path);
      const lines = [
        `Folder ${listing.display} (${listing.entries.length} entries):`,
        ...listing.entries,
      ];
      if (listing.truncated) {
        lines.push("[More entries exist: list a subfolder.]");
      }
      return {
        status: "done",
        result: lines.join("\n"),
        note: TOOL_NOTES.entries(listing.entries.length),
      };
    }
    case "search_text": {
      const outcome = await searchText(deps.fs, deps.roots, request.query, request.path);
      const lines =
        outcome.matches.length === 0
          ? [`No match in ${outcome.filesSearched} files.`]
          : [
              `${outcome.matches.length} matching lines:`,
              ...outcome.matches.map((match) => `${match.display}:${match.line}: ${match.text}`),
            ];
      if (outcome.truncated) {
        lines.push("[The search stopped at its limit: search a smaller folder or a longer text.]");
      }
      return {
        status: "done",
        result: lines.join("\n"),
        note: TOOL_NOTES.matches(outcome.matches.length),
      };
    }
    case "propose_edit":
      return proposeEdit(request, deps);
  }
}

async function proposeEdit(
  request: Extract<ToolRequest, { tool: "propose_edit" }>,
  deps: ToolDeps,
): Promise<ToolOutcome> {
  const target = await resolvePath(deps.fs, deps.roots, request.path, true);
  const current = target.exists
    ? (await readWorkspaceText(deps.fs, target.absolute)).text
    : undefined;
  const plan = planEdit(current, request.oldText, request.newText);
  if (!plan.ok) {
    return failure(plan.reason, REFUSALS[plan.reason]);
  }
  const decision = await deps.proposeEdit({
    absolute: target.absolute,
    display: target.display,
    kind: plan.kind,
    before: plan.before,
    after: plan.after,
    start: plan.start,
    end: plan.end,
    newText: request.newText,
  });
  switch (decision) {
    case "applied":
      return {
        status: "accepted",
        result: `The user accepted the edit: it was applied to ${target.display}.`,
        note: TOOL_NOTES.accepted,
      };
    case "rejected":
      return {
        status: "rejected",
        result: `Rejected by the user: ${target.display} is unchanged. Ask the user what to do instead.`,
        note: TOOL_NOTES.rejected,
      };
    case "stopped":
      return { status: "stopped", result: DECISIONS.stopped, note: TOOL_NOTES.stopped };
    default:
      return failure(decision, DECISIONS[decision]);
  }
}
