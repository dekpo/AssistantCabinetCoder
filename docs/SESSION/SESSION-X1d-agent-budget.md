# Lot X1d: let Agent mode start with a 32768-token model (the input budget and the token estimate)

> **Read first:** `docs/VIBE-CODING-PRACTICES.md`, `docs/SESSION/COMMON-RULES.md`, `AGENTS.md`, `docs/DECISIONS.md` (D-016 and D-022 above all), `docs/LESSONS.md` (all of it, lessons 13 to 16 above all), `docs/ARCHITECTURE.md`, `docs/HUMAN-TESTS-PROTOCOL.md`, `docs/SPIKE-FINDINGS.md`, the run record of `docs/human-tests/X1b-chat.md` (Part 5 step 4), `docs/IDE-CONTRACT.md` (the `context_window` and `max_output_tokens` rows, and the limits paragraph of the chat request), `src/provider.ts` (`toModelEntry`), `src/tokens.ts`, `src/extension.ts` (`provideTokenCount`), `test/stub-gateway/stub.ts`.

Branch: `feat/x1d-agent-budget`, created by the owner from `feat/x1c-server-catch-up` once Part B of X1c is committed. Check with `git log --oneline -3` that you are on it; if not, stop and say so. Estimate: about 1 hour of measuring, a stop for the owner's choice, then about 2 hours of building and a human test of about 20 minutes. Needs: the stub first; then the Mac's own server (package 0.1.11, `IDE_ENABLED=on`, decision D-020) for the real test.

## Why this lot exists

On VS Code 1.147.0, Agent mode refused the Mac's `qwen2.5-coder:14b` at once, without calling the extension: "static system messages and tool definitions exceed this model's context budget" (run record of X1b, lesson 15). The extension reports `maxInputTokens` = window - ceiling (D-016): 32768 - 16384 = 16384 for every 32768-token model of the Mac, and every model there has a window of at most 32768. Its token estimate errs high on purpose (3.0 characters per token until a request is calibrated). The contract says `context_window` covers prompt and answer, and `max_output_tokens` is at most half the window; the extension sends no `max_tokens`. Agent mode with the stub's 131072-token `cabinet-code` worked, which hid the problem.

## Part A: measure, then stop (agent)

1. **Reproduce on the stub.** Add one stub model, `cabinet-small`: window 32768, ceiling 16384, tools yes, vision no (additions only in `test/stub-gateway/stub.ts`; the existing models and markers unchanged). With the owner, one Agent turn with `cabinet-small` on VS Code 1.147.0: expected the same refusal. This keeps the shared server's models out of the measuring.
2. **Measure what the editor counts**, with counts only (no text, no tool name in any log): whether the editor calls `provideTokenCount` before refusing, how many times, and the sum and the largest of the estimates. If a temporary count-only log line is needed, it lives in a local build that is never committed, and is removed before Part B; say so in the report. Also measure the characters of the tool definitions the editor sends in an Agent turn that does start (with `cabinet-code`): the stub may print the count of tools and the characters of their JSON to its own console (counts only).
3. **Stop and report to the owner in French**: what was measured, and the options with their cost, for example (a) a smaller output reserve in `maxInputTokens` (for instance window minus a quarter of the window), keeping `maxOutputTokens`; (b) a starting ratio closer to the real one (for instance 4.0, with the calibration unchanged); (c) both; (d) nothing in the extension: the owner raises the window of the code models on the server (`cabinet models context`, a server step with a memory cost shared with the desktop application, COMMON-RULES section 7). Give a recommendation; the owner chooses. Nothing of Part B starts before the answer.

## Part B: build (agent), after the owner's choice

May change: `src/provider.ts` (`toModelEntry` only), `src/tokens.ts` (constants only), `test/stub-gateway/stub.ts` (additions only), `package.json` (version 0.2.2), `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (a new decision that amends D-016), `docs/LESSONS.md`, `docs/human-tests/X1d-agent-budget.md` (new). Create: new test files.
**Named exceptions in existing tests**, only those the chosen option makes false, each reported with its diff: `test/provider.test.ts` lines 86 and 110 (the budget rule), `test/tokens.test.ts` line 67 (`DEFAULT_RATIO < 4`), `test/manifest.test.ts` line 34 and `test/provider-guards.test.ts` lines 51 to 53 (the version). Any other existing test that fails: stop and tell the owner.
**Untouchable (empty `git diff --stat feat/x1c-server-catch-up -- <paths>` in the report):** `src/transport.ts`, `src/sse.ts`, `src/discovery.ts`, `src/platform.ts`, `src/keys.ts`, `src/client.ts`, `src/codes.ts`, `src/convert.ts`, `src/log.ts`, `src/messages.ts`, `src/extension.ts`, `docs/IDE-CONTRACT.md`, `docs/VIBE-CODING-PRACTICES.md`, `docs/SPIKE-FINDINGS.md`, the frozen records in `docs/human-tests/`, and everything in `../AssistantCabinetServer` (read-only).

Baseline: **253 tests pass, 0 fail** (the final count of X1c); record the real one before the first edit.

Build the chosen option with its tests (a 32768-token model with a 16384 ceiling, the fallback window, a tiny window, the estimate before and after calibration), update the README's "Known limits" (the line "Agent mode does not start with a 32768-token model on VS Code 1.147.0") and `docs/ARCHITECTURE.md`. Full suite, `npm run lint`, `npm run format`, lesson 3's check, `npm run package` (19 files expected).

## Part C: the human test (owner, about 20 minutes)

`docs/human-tests/X1d-agent-budget.md`, written for the Mac (zsh, `/Users/ydekpo/...`), in a throw-away profile as in X1b, from what the run of X1b really showed (lessons 10 to 16): the stub's `cabinet-small` in Agent mode (it must now start); then the Mac's own server, with the warning about the desktop application first: one Agent turn and one Plan turn with `qwen2.5-coder:14b` on a scratch folder (allow only a tool that creates or edits a file, **Skip** a terminal tool), the log lines (duration, prompt tokens), the file checked by the agent. Give it one part per message, run every command that needs no click yourself, ask for screenshots only when a deviation needs one. Append the run record.

## Out of scope, to report only

- The stop button does not cancel the request on 1.147.0 (lesson 13): the editor never cancels; nothing to change in the extension until a later VS Code shows otherwise.
- `qwen2.5-coder:14b` wrote a tool call as plain JSON text in Ask (X1b run, Part 5 step 3): a question for the server project, never changed from here.
- No picture can be attached on 1.147.0 signed out (lesson 12): for Lot X2a.

## Done means

Part A reported and the owner's choice recorded; tests green against the baseline (253), lint and format clean, the named exceptions with their diffs, the empty `git diff --stat` of the untouchable paths, `assistant-cabinet-coder-0.2.2.vsix` built; the run record written with an Agent turn of a real 32768-token model that started (or the reason it did not). Final report in French with the git commands, and the next lot: X2a, after aligning `docs/SESSION/SESSION-X2a-view-image.md` (COMMON-RULES section 9).

---

Binding rules, identifiers and VS Code facts: `docs/SESSION/COMMON-RULES.md`.
