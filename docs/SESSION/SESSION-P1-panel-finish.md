# Lot P1: finishing the panel, and the editor-chat provider removed

> **Status of this file: aligned on 23 November 2026 at the end of Lot P0b** (COMMON-RULES section 9). This lot starts in a **new chat tab**: everything it needs is named here or in the files below. Talk to the owner in French; every file stays English. The owner wants the work to move fast: open with the task list, ask only what this file leaves open, and walk the human test with no action faster than about 20 seconds (AGENTS.md).
>
> **Read first:**
> - `docs/VIBE-CODING-PRACTICES.md`, `docs/SESSION/COMMON-RULES.md`, `AGENTS.md`;
> - `docs/DECISIONS.md` (D-026 to D-032, above all **D-030, D-031, D-032**);
> - `docs/LESSONS.md` (all of it, up to lesson 28);
> - `docs/ARCHITECTURE.md`, `docs/HUMAN-TESTS-PROTOCOL.md`;
> - `docs/human-tests/P0b-panel-agent.md` and its run record;
> - `docs/handoffs/SERVER.md` (what the extension asked the server);
> - `docs/IDE-CONTRACT.md` sections 2, 3 and 7 (copied from the server's `develop` at `969d047`: `features.stop_at_every_stage`, `data[].max_context_window`, the guard's ratio);
> - read-only, `git -C ../AssistantCabinetServer show develop:docs/handoffs/CODER-EXTENSION.md` sections 6 and later (the server may have answered there; no fetch, no checkout).

Branch: `feat/p1-panel-finish`, from `feat/p0b-panel-agent` (its last commit is the owner's commit of P0b). The base of every `git diff --stat` is `feat/p0b-panel-agent`. Estimate: 6 hours of agent work, then the owner's test (about 25 minutes). Version **0.5.0** (from 0.4.0). Needs nothing new from the server. The server's packages Mac 0.1.14 and MSI 0.1.36 (server Lot 46) may or may not be installed when the test runs: read `/health` and `GET /ide/v1/models` first.

## What P0b left (facts)

- **Baseline:** `npm test` gives **474 tests, 474 passing** on `feat/p0b-panel-agent`; `npm run lint` and `npx prettier --check .` are clean. Run them first, and report a red baseline to the owner before building anything. A red contract guard means the server changed its contract again (lesson 7).
- **The panel's agent.**
  - The loop (`agent`, at most 12 steps), four tools (`tools`, `workspace`), and edits applied only after **Accept** through `WorkspaceEdit` in `extension.ts` (`editorWorkspace`).
  - Saved format 2.
  - The log carries `step=`, `tools=` and `call=tool` lines.
- **Measured on the Mac (server 0.1.13):**
  - a task's first request is 585 to 679 prompt tokens;
  - `gpt-oss:20b` did the three tasks right with every call valid, in 1.8 to 12.3 s;
  - `qwen2.5-coder:14b` wrote every tool call as plain text (left to the server, D-031 (3); do **not** parse it in this lot).
- **Defects seen in the run, to fix here:**
  1. Markdown tables are not drawn (the pipes show).
  2. The target `.` of a **List** line reads like the separator dot.
  3. `gpt-oss:20b` once answered in Polish to an English message: the system prompt's sentence on the language is not enough.
- **The owner asked earlier**, and it is planned here: a copy button on code blocks.

## Goal

The owner's verdict D-031: the panel **Go with changes**; the provider in the editor's chat **removed**; then documents and images, the agent catalogue, the release.

## Tasks (binding unless the owner changes them at the start)

1. **Remove the editor-chat provider** (D-031 (2)), with no dead code left:
   - the code: `src/provider.ts`, `src/convert.ts`, `src/tokens.ts`;
   - their tests: `test/provider*.test.ts`, `test/convert.test.ts`, `test/tokens.test.ts`, `test/stub-small-model.test.ts` if only the provider used it, `test/fixtures/convert/`;
   - the manifest's `languageModelChatProviders` contribution, and its registration and `Host` in `extension.ts`;
   - what only the provider used in `messages.ts` (`CONVERSION_*`, `describeConversionFailure`, `describeModelTooltip` if unused) and in `test/support/` (`fake-host.ts`, `editor.ts` if unused);
   - the README sections about the editor's chat (**The three agents**, the editor-chat limits);
   - `docs/ARCHITECTURE.md`'s provider sections.

   `tools.ts` reuses `convert.parseArguments`: move that small function into `tools.ts` with its tests. Keep the commands (`manage` stays the status bar's menu). Read every guard that names the provider before deleting.

   **Named exceptions** (existing tests to edit, list them to the owner before editing): `test/manifest.test.ts` (version 0.5.0 and, if it names it, the provider contribution) and `test/provider-guards.test.ts`. Delete the latter if all it checks is the provider, and move its version and README checks to `test/manifest.test.ts`.

   Also remove the identifiers that disappear (provider `vendor`, the editor-chat tool names of the paused X2a and X2b, and the context keys if unused) from the table of `AGENTS.md` and `docs/SESSION/COMMON-RULES.md`. Ask the owner in one line if a doubt remains.
2. **Markdown tables** in `render` (a header row, a separator row of dashes and colons, body rows; cells hold inline marks; a malformed table stays a paragraph; linear time on hostile input, with a test) and their drawing in `media/panel.js` (`createElement` only).
3. **A copy icon on every code block.** The click posts `{type: "copyCode", index...}` with the turn's and the block's indexes, never the text. The extension copies the block's text from its own copy of the conversation with `vscode.env.clipboard.writeText`. Validate the message in `protocol`, add the icon to `page.TOOL_ICONS` or a new icon set (the test of `page.ICONS` pins its six icons), and give the tooltip **Copy**.
4. **The List line's target**: the workspace folder itself is shown as its folder name (or a word from `messages.AGENT_PANEL`), never `.`.
5. **The answer's language**: strengthen the system prompt (for example, "Write every answer in the language of the user's last message." as its own sentence, placed last). The pinned size `SYSTEM_PROMPT_CHARS` of `test/tools.test.ts` changes with it. That is a new test file of P0b's, but still an existing test: name it as an exception. Keep the prompt neutral and short.
6. **What the server's D-101 makes possible** (D-032):
   - read `features.stop_at_every_stage` and `max_context_window` in `client.parseModels`; a missing flag is "not known" and a missing field is `null`;
   - with the flag `true`, the note after a stop before the first word is the plain **Stopped.**, because the older-server sentence is wrong there;
   - when a `context_too_large` refusal comes from a model whose `max_context_window` is larger than its `context_window`, the overflow sentence says the window can be raised, up to that maximum. It already names the command.
7. **Version 0.5.0**, README, `docs/ARCHITECTURE.md`, decisions (next free number D-033), lessons, `docs/human-tests/P1-panel-finish.md`, and `docs/handoffs/SERVER.md` if anything changes for the server.

## Files this lot may change or create

- Change: `src/` (the panel's modules, `client.ts` by addition, `messages.ts`, `log.ts`, `extension.ts`, `page.ts`, `render.ts`, `tools.ts`), `media/panel.js`, `media/panel.css`, `package.json`, the stub (additions only), `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/LESSONS.md`, `AGENTS.md`, `docs/SESSION/COMMON-RULES.md`, `docs/SESSION/PLAN-EXTENSION.md`, `docs/handoffs/SERVER.md`.
- Create: new tests, `docs/human-tests/P1-panel-finish.md`.
- Delete: the provider's files listed in task 1, with their tests.
- Existing tests: only by addition, apart from the named exceptions of tasks 1 and 5.
- **Untouchable** (an empty `git diff --stat feat/p0b-panel-agent -- <paths>` in the report): `src/transport.ts`, `src/sse.ts`, `src/discovery.ts`, `src/platform.ts`, `src/keys.ts`, `src/codes.ts`, `src/store.ts`, `src/workspace.ts`, `src/agent.ts`, `docs/IDE-CONTRACT.md`, `docs/VIBE-CODING-PRACTICES.md`, `docs/SPIKE-FINDINGS.md`, the run records of the earlier human tests, `test/guards.test.ts`, `test/workspace.test.ts`, `test/agent.test.ts`, `test/support/pki.ts`.

## Human test (about 25 minutes, the Mac, a throw-away profile `p1-vscode-*`)

Prepared and walked as in P0b: the agent writes the scratch project, runs every command, and checks the stub's console and the log. The owner only clicks, pastes ready texts and takes named screenshots, and never has an action faster than about 20 seconds. Show:
- (a) the provider is gone from the editor's chat (its model picker has no **Assistant Cabinet Coder** tab), the panel works;
- (b) a table and a copied code block (the agent reads the clipboard with `pbpaste`);
- (c) the **List** line of the project folder;
- (d) `gpt-oss:20b`, two of P0b's tasks again, the answers in the message's language (one message in English, one in French);
- (e) on 0.1.14 if it is installed: a stop before the first word shows **Stopped.**, and the next request in a new conversation starts at once (lesson 26: a text the server has never read).

Warn about the desktop application before loading a model.

## Done means

As in P0b. The run record is appended, then `docs/handoffs/SERVER.md` is updated for the server, and the next prompt file (documents and images) is aligned (COMMON-RULES section 9) and named to the owner.

---

Binding rules, identifiers and VS Code facts: `docs/SESSION/COMMON-RULES.md`.
