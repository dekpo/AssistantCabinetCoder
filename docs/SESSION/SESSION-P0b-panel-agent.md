# Lot P0b: the panel's agent, a few workspace tools and approved edits

> **Status of this file (23 November 2026): written ahead of Lot P0a, not yet aligned.** At the end of P0a, align it with what really exists (COMMON-RULES section 9): the branch, the baseline count, the module names, the stub's markers, the version assertions, and the P0a run record (placement, stop, the server's slot after a stop, `prompt_tokens`).
>
> **Read first:** `docs/VIBE-CODING-PRACTICES.md`, `docs/SESSION/COMMON-RULES.md`, `AGENTS.md`, `docs/DECISIONS.md` (D-025, D-026 and the decisions of P0a), `docs/LESSONS.md` (all of it), `docs/ARCHITECTURE.md`, `docs/HUMAN-TESTS-PROTOCOL.md`, `docs/human-tests/P0a-panel.md` and its run record, `docs/IDE-CONTRACT.md` section 3 (`tools`, `tool_calls`, streamed tool calls, `tool_choice` accepted and ignored), the paused `docs/SESSION/SESSION-X2a-view-image.md` (its safety rules are reused here), and the pinned `@types/vscode` (`WorkspaceEdit`, `workspace.applyEdit`, `workspace.fs`, `workspace.isTrusted`, `TextDocumentContentProvider`, the `vscode.diff` command).

Branch: `feat/p0b-panel-agent`, from `feat/p0a-panel`. Estimate: 6 hours of agent work, then the owner's test (about 30 minutes). Version **0.4.0** (from 0.3.0). Needs nothing new from the server.

## Goal and why

Decision D-026: the question that decides the whole direction is whether the owner's local models can work as coding agents once the prompt is small and the tools are chosen for them. This lot gives the panel an agent loop and four tools, measures that on the owner's Mac, and ends with the owner's verdict on the panel (*Go*, *Go with changes*, *Stop*) and on the provider in the editor's chat (kept or removed).

## Design (binding unless the owner changes it at the start)

- **The loop** (`src/agent.ts`, pure, the sender and the tools passed in): send the conversation with the tool definitions; when the answer has `tool_calls`, run each one, append the assistant's calls and one `tool` message per result, and send again; stop at a final answer, at **Stop**, or after a step limit (12, a constant, with a clear sentence). One request per step, never a retry. Malformed tool arguments become a tool result the model reads ("invalid arguments: ..."), not a thrown error.
- **Four tools, model-facing names short and plain** (neutral descriptions, a guard test beside them):
  - `read_file` `{path, start_line?, end_line?}`: a text file inside the workspace, with line numbers, at most a fixed number of lines and bytes per call;
  - `list_files` `{path?}`: the entries of a folder inside the workspace, skipping `.git` and `node_modules`, bounded;
  - `search_text` `{query, path?}`: plain text search (not a regular expression) in the workspace's text files, bounded results with file and line;
  - `propose_edit` `{path, old_text, new_text}`: replace one exact, unique occurrence of `old_text` (an empty `old_text` on a missing file creates it). **Nothing is written before the user accepts**: the panel shows the change (the editor's diff view through `vscode.diff` on a read-only virtual document), with **Accept** and **Reject**; **Accept** applies it with `WorkspaceEdit` (so **Undo** reverts it); **Reject** returns "rejected by the user" to the model.
- **Safety, reused from X2a** (`src/workspace.ts`, pure, the file system passed in): a path is resolved with `realpath` and must lie inside an open workspace folder (a symlink that leads outside is refused); a file over a size limit and a binary file are refused before being read; the extension's sources keep no write API of `node:fs` (the existing guard), every write goes through `WorkspaceEdit` after the click; in an untrusted workspace (`workspace.isTrusted` false) the tools are off and the panel says so.
- **A short system prompt**, neutral (no profession, no organisation), saying what the tools are for; its size in characters is a test constant.
- **The log**: per step, the code, the status, the duration, `prompt_tokens`, the number of tool calls and their **names** (the extension's own four names, never arguments or results), and accepted or rejected for an edit.

## Files this lot may change or create (to be confirmed at alignment)

Create: `src/agent.ts`, `src/workspace.ts`, `src/tools.ts` (the four definitions and their runners; the module name of the table), new test files, `docs/human-tests/P0b-panel-agent.md`.
May change: the modules P0a created, `package.json` (version 0.4.0), `src/extension.ts` (registration only), `src/messages.ts` and `src/log.ts` (additions only), the stub (additions only: scripted tool calls, so the loop is tested without a model), `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/LESSONS.md`, `AGENTS.md` and `docs/SESSION/COMMON-RULES.md` (identifiers: the tool names replace `cabinet_read_document` and `cabinet_view_image` only if the owner says so).
**Named exceptions:** the version assertions (P0a's numbers). **Untouchable:** as in P0a, plus everything P0a's report lists.

## Human test (about 30 minutes, the Mac, a throw-away profile)

With the warning about the desktop application first (these parts load code models). In a small scratch workspace prepared by the agent (a few files of a tiny project):

- (a) `prompt_tokens` of the first request (expected: a few thousand, against 21 597 for the editor's Agent request).
- (b) For `qwen2.5-coder:14b` and `gpt-oss:20b` (both 32768 tokens on 21 November 2026; read `GET /ide/v1/models` again), three tasks: explain a file (read), find where a name is defined (search), add a small function (edit with approval). For each: the steps, the time, whether every tool call was valid, whether the result was right.
- (c) **Reject** leaves the file unchanged; **Accept** changes it; **Undo** reverts it; a path outside the workspace is refused.
- (d) **Stop** in the middle of the loop: no further step, no file changed.

## Done means

As in P0a, then the owner's verdict recorded as a decision: the panel (*Go*, *Go with changes*, *Stop*), the provider in the editor's chat (kept or removed), and the lots that follow (images, documents, the server's agent catalogue, the release), planned again on the panel.

---

Binding rules, identifiers and VS Code facts: `docs/SESSION/COMMON-RULES.md`.
