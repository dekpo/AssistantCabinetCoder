# Lot X0: the spike (about 2 hours, no product code)

> **Read first, in this order:** `docs/VIBE-CODING-PRACTICES.md`, then `docs/SESSION/COMMON-RULES.md` (binding rules, identifiers, VS Code facts), then `docs/SESSION/PLAN-EXTENSION.md`. Then `docs/IDE-CONTRACT.md` sections 1 to 3 (to shape the stand-in). Nothing else exists yet in the repository: `AGENTS.md`, `DECISIONS.md`, `LESSONS.md` are created by this lot.

Branch: `feat/x0-spike`, from `docs/setup` (the owner has committed it: it holds `.gitignore`, `docs/VIBE-CODING-PRACTICES.md` and `docs/IDE-CONTRACT.md`; check with `git log` and `git branch`, and stop if the branch does not exist). Estimate: 2 hours of agent work, then the owner's run of about 40 minutes. Needs nothing from the server.

## Goal

Replace every "still unknown" of COMMON-RULES section 8 with a measured fact before the real extension is designed, and set up the repository.

## Questions for the owner, at the very start (one short message, in French, with a recommended answer each)

1. **Publisher** of the extension (recommended: `assistantcabinet`).
2. **Licence** of the extension (recommended: MIT; Apache-2.0 is the other option; the agent does not invent one). Until the owner answers, nothing is written to `LICENSE`.
3. **Go-ahead for the dev dependencies**: give the list with exact versions checked by `npm view`, and the licence of each (TypeScript, `@types/vscode`, `@types/node`, `@vscode/vsce`, ESLint with its TypeScript plugin, Prettier or the formatter chosen). **Test runner: Node's built-in runner (`node --test`) on the compiled output**, so that no runner is added. `@types/vscode` is pinned to the same minimum version as `engines.vscode` (the `vsce` tool refuses a newer one).

## Files this lot may change or create

Create: `README.md`, `AGENTS.md`, `package.json`, `package-lock.json`, `tsconfig.json`, the lint and format configuration, `LICENSE` (only after the owner's answer), `docs/ARCHITECTURE.md` (stub), `docs/DECISIONS.md`, `docs/LESSONS.md`, `docs/HUMAN-TESTS-PROTOCOL.md`, `docs/human-tests/X0-spike.md`, `docs/SPIKE-FINDINGS.md`, everything under `spike/`.
May change: `.gitignore` (only to add a missing line; `docs/SESSION/` and `docs/SESSION-*.md` are already there, check).
**Untouchable (empty `git diff --stat docs/setup -- <paths>` in the report):** `docs/VIBE-CODING-PRACTICES.md`, `docs/IDE-CONTRACT.md`.

## Do

1. **Repository set-up** (small):
   - `README.md` (three lines), and `AGENTS.md`: the binding rules of COMMON-RULES section 4 in short form (language, git, privacy, terminal, tests, what never to touch), pointing to `docs/VIBE-CODING-PRACTICES.md` instead of repeating it, and listing the identifiers table (section 1) so that a chat that does not have the local session folder still knows the names.
   - `package.json` skeleton (exact-pinned dev dependencies only, scripts `build`, `test`, `lint`, `format`, `package` for the real extension to come; `spike/` has its own `package.json`), `tsconfig.json` (strict), lint and format configuration.
   - `docs/ARCHITECTURE.md` stub (the module list of COMMON-RULES section 1, one line each); `docs/DECISIONS.md` starting with **D-001 The project and extension are named AssistantCabinetCoder (owner, 27 October 2026)**, **D-002 No merge into `main` until the owner declares the product perfect (25 October 2026)**, **D-003 the practices of `docs/VIBE-CODING-PRACTICES.md` apply**, then the owner's answers of this lot (publisher, licence, test runner); `docs/LESSONS.md` empty with its header; `docs/HUMAN-TESTS-PROTOCOL.md` (a short page: the human-test rules of COMMON-RULES section 4 and the run-record format).
2. **A throw-away spike extension** in `spike/` (clearly marked, deleted at the end of Lot X1b): a language model provider with vendor `cabinetspike` that serves **two** models, one with `toolCalling: true, imageInput: true` and one with both `false`, and answers from a script: for a plain turn it replies with a fixed sentence; when `options.tools` is non-empty it replies with a tool call to the first tool whose name contains `read` (arguments `{}` or the minimal required ones read from its schema) and, when the history ends with a tool result, with a fixed closing sentence. It registers:
   - one tool `spike_image` (`contributes.languageModelTools`, `canBeReferencedInPrompt: true`) that returns a `LanguageModelToolResult` holding a 16-pixel PNG made in code;
   - one tool `spike_gated` with a `when` clause on a context key `cabinetSpike.gated`, and a command `Spike: Toggle Gated Tool` that flips that key with `setContext` (question (k));
   - one static custom agent through `contributes.chatAgents` pointing to `spike/agents/spike.agent.md` (tools `['read']`, no `model`);
   - one setting with `"scope": "machine"`;
   - activation through `onLanguageModelChatProvider:cabinetspike` (and, if the models do not show up without running a command first, record what does make them show up).
   Its output channel prints **structure only**: the number of messages; for each message its role and the **kinds** of its parts (text, tool call, tool result, data with mime type and byte length) and the character length of text parts; the **names** of `options.tools` (no schemas) and their count; `toolMode`; the keys of `modelOptions`; the names of `vscode.lm.tools`; never text. Package it with `vsce`.
3. **`docs/human-tests/X0-spike.md`**, the owner's script, following COMMON-RULES section 4 ("Human tests") and **Git Bash** (the install can be done with `code --install-extension` or by the menu; one backup and one restore of anything changed, for example the user settings file). It answers, with a written expected result for each:
   - (a) The VS Code version and channel; the `.vsix` installs from **Extensions view > ... > Install from VSIX...**; the owner is **signed out of GitHub** for the whole test (say how to check and how to sign out).
   - (b) With no GitHub sign-in and no Copilot plan: does the chat view open; do both spike models appear in the model picker (and without running any command first); in which agents (Ask, Agent, Plan) with **Session Target = Local**; does the model without tool calling appear in Agent and in Plan; what exactly does the picker say when something is missing.
   - (c) What an Ask turn, an Agent turn and a `/plan` turn hand to the provider: message counts, role sequence, part kinds, tool counts, the list of tool names (names only), characters of the first message, `toolMode`, `modelOptions` keys. Recorded as numbers and names, never text.
   - (d) Images: paste an image into the chat and attach a small PNG: what arrives (part kind, mime type, bytes, count). Attach a text file, a selection, a `#file` reference and a PDF: what arrives for each (text parts, nothing, an error shown by the editor).
   - (e) The tool-result image: ask the Agent to call `spike_image`; does the next request carry the image inside the tool result part (kind, mime, bytes).
   - (f) Does the static custom agent appear in the agents dropdown of a sideloaded `.vsix` in **stable**; is its `tools` list respected; does an agent with no `model` use the selected model; how is a model named in the picker (the exact string, to write `model:` fields correctly).
   - (g) Does a workspace `.vscode/settings.json` override the `machine`-scoped setting (it must not).
   - (h) Under a remote window (WSL or SSH), on which side does the extension run with `extensionKind` set to `["ui"]` and to `["workspace"]`; if the owner has no remote available, record "not tested".
   - (i) The list of `vscode.lm.tools` names in Agent (this decides the `tools:` lists of the agent files) and whether the editor's file and search tools are offered to a provider's models without a Copilot plan (if the editor's file tools are **not** available to a provider's models, say so in capitals: Lot X2a stops on it).
   - (j) The names of the telemetry-related settings of VS Code and of the chat features that the guide should tell users to review.
   - (k) Does a `when` clause hide the contributed tool `spike_gated` from the agent's tool list and from `vscode.lm.tools` while the key is false, and show it when true.
4. **`docs/SPIKE-FINDINGS.md`** left empty with those headings ((a) to (k)), for the owner's run, and a short **decision section** for the owner's verdict after the run: *Go*, *Go with changes* (what), or *Stop* (why). The outcomes that change the plan are written in advance: if Agent or Plan do not offer the provider's models without sign-in, the next lots keep the provider but the user guide must say what the user has to do; if images or attachments arrive differently from the rules in COMMON-RULES, Lot X1b's conversion changes; if `chatAgents` does not work in a sideloaded `.vsix`, Lot X3 keeps only the sync command; if a `when` clause does not hide a tool, Lot X2b registers the tool always and answers with a clear message when the feature is off; if the editor's file tools are not offered to a provider's models, Lot X2a stops and the owner decides.

## Done means

The spike `.vsix` builds; `docs/human-tests/X0-spike.md` was walked by you as far as is possible without VS Code (the build, the packaging, the manifest checks) and says plainly what only the owner can walk; the repository files above exist; the report in French lists what the owner must do (about 40 minutes), gives the git commands, and **stops**. Do not start Lot X1a. This chat stays open for the owner's run: the owner pastes the output of each part, you read it before giving the next, you write the findings into `docs/SPIKE-FINDINGS.md` and the run record at the end of the test file, and a deviation is a finding about the test first. The owner alone writes the decision (*Go*, *Go with changes*, *Stop*); you record it as a decision in `docs/DECISIONS.md`, and then give the git commands for the findings.

---

Binding rules, identifiers and VS Code facts: `docs/SESSION/COMMON-RULES.md`.
