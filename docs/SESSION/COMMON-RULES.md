# Common rules of the extension programme (Lots X0 to X4)

Every lot file of this folder says "read `docs/SESSION/COMMON-RULES.md` first". This file replaces the block of rules and VS Code facts that used to be copied at the end of each lot, so that a rule is changed in one place. It is local (the folder `docs/SESSION/` is in `.gitignore`). The general practices of the programme are in the tracked file `docs/VIBE-CODING-PRACTICES.md`; this file adds what is specific to the extension and to the lots.

## 1. The project

- **Name: AssistantCabinetCoder.** A VS Code extension that gives the editor's chat the models of the server `AssistantCabinetServer`. Folder on this machine: `C:\Users\dwyol\Documents\CURSOR\AssistantCabinetCoder`. Remote: `https://github.com/dekpo/AssistantCabinetCoder.git`. (The older session files and the shared contract say `AssistantCabinetVSCode`: same project, the owner decided on 27 October 2026 that the name is `AssistantCabinetCoder`. The contract copy keeps the old name on purpose, see section 2.)
- The server project is at `C:\Users\dwyol\Documents\CURSOR\AssistantCabinetServer`. You may **read** it when a lot says so. You never change it, nor `AssistantCabinetAI`. Its own session files for the editor surface are in its `docs/IDE-VSCODE-SESSION/` (the server's `COMMON-RULES.md` there is the model of this file).
- The tower (the server's machine): MSI 0.1.11 on 27 October 2026, `http://192.168.1.83:8090`, plain HTTP, no keys. The editor surface exists there only after the server's Lot 15b is installed and `IDE_ENABLED=on`. Until then, the stub gateway of the extension is the only gateway that speaks `/ide/v1`.

### Identifiers (one table, used by every lot; a lot never invents another spelling)

| Thing | Value |
| --- | --- |
| npm `name` | `assistant-cabinet-coder` |
| `displayName` | `Assistant Cabinet Coder` |
| `publisher` | asked of the owner in Lot X0 (proposed default `assistantcabinet`) |
| Provider `vendor` | `assistantcabinetcoder` |
| Command and setting prefix | `assistantCabinetCoder.` (commands: `manage`, `setKey`, `clearKey`, `selectCaFile`, `testConnection`, `showOutput`, later `syncAgents`, `removeSyncedAgents`) |
| Settings | `assistantCabinetCoder.serverUrl`, `.caFile`, `.autoDiscover`, `.requestTimeoutSeconds`, later `.maxAttachmentBytes` (all `"scope": "machine"`) |
| Context keys | `assistantCabinetCoder.documentAnalysis`, `.imageDescription`, `.agents` |
| Command palette category | `Assistant Cabinet Coder` |
| Tool names (model-facing) | `cabinet_read_document`, `cabinet_view_image` |
| Synced agent files | `.github/agents/cabinet-<id>.agent.md`, first line `<!-- managed by Assistant Cabinet Coder; do not edit; server catalogue id: <id> -->` |
| Package file | `assistant-cabinet-coder-<version>.vsix` |
| Sources | `src/`, tests in `test/`, stub gateway in `test/stub-gateway/` |
| Source modules (one job each) | `codes` (machine codes and `CabinetError`), `platform` (the only module that names operating-system folders), `discovery`, `transport`, `sse`, `client` (typed calls to `/health` and `/ide/v1`), `keys` (the API key in the secret store), `convert`, `tokens`, `provider`, `tools`, `agents`, `log`, `messages` (every user-facing string), plus the thin VS Code adapter `extension` |

## 2. The contract

`docs/IDE-CONTRACT.md` (tracked, committed in the first commit) is the vendored copy of the server's contract, byte-identical to the server's on 27 October 2026. **Never edit it here**: a change is made in the server project and copied over. It still names the old project name and the "Lots X0 to X4"; that is accepted, and the server project decides when to update it. If the contract is not enough for a lot, write the gap in the report; never guess the server's internals.

## 3. Read first, in every chat

`docs/VIBE-CODING-PRACTICES.md`; this file; the lot file; then, when they exist, `AGENTS.md`, `docs/DECISIONS.md`, `docs/LESSONS.md` (all of it), `docs/ARCHITECTURE.md`, `docs/HUMAN-TESTS-PROTOCOL.md`, `docs/SPIKE-FINDINGS.md` (**the facts measured by Lot X0 override every assumption in section 8 below**), and the files named in the lot's "Read first". Read each file once.

## 4. Binding rules

- **One lot per chat.** Do only the lot you were started from. If the repository is not the one at the path above, or the branch the lot starts from does not exist, stop and say so.
- **Git is owner-only.** Never commit, stage, push or tag. `git status`, `git log`, `git diff` (read-only) are allowed and are used to write the final commands. At the end give: the branch name, one or two single-line Conventional Commit subjects (one sentence, no body), and the **full copy-paste Git Bash commands for the local repository and the remote** (`git checkout <previous branch>`, `git checkout -b <branch>`, `git add <the files>`, `git commit -m "..."`, `git push -u origin <branch>`), written after reading `git status` and `git log` so they match the real state. One branch per lot, created from the previous lot's branch, never from `main`; nothing is ever proposed for `main` and no pull request (owner rule of 25 October 2026). **No AI attribution anywhere git-facing**: no Claude or model name, no co-author trailer, no generated-by link, in a commit, a branch name or a PR, whatever the tooling's default says. Nothing is published to any marketplace.
- **Language.** Every file (code, comments, tests, documents, commit subjects, machine codes, the prompts written for another chat) is English, with no French anywhere. The extension's user-facing messages are English and live in one file, `src/messages.ts`. Any command-line script of the repository speaks English only. **Reply to the owner in French, in plain words, without jargon, in short sentences.**
- **Terminal.** Everything written for the owner (human-test scripts included) uses **Git Bash** (POSIX) commands and `/c/Users/...` paths. No PowerShell, no `cmd`, except a step that is specific to Windows installation or configuration and that Git Bash cannot do: then say so in one line and keep to that step. Editor steps name every click by its exact label.
- **Work method.** Open with a task list of at most eight lines, one estimate each; then one-line status updates; end with **one report** (section 6). A baseline run of the whole test suite before the first edit (record the count; from X1a on), targeted runs while working, the full suite, the linter and the formatter once at the end. No redundant work, no extra deliverable that was not asked for, no dead code (what is removed goes with its tests, settings and documentation). If the chat grows long, say what is done and what remains: the work continues from the files.
- **Non-regression.** Each lot lists **the files it may change**; everything else stays byte-identical to the branch the lot started from, and the report pastes an empty `git diff --stat <start branch> -- <those paths>`. **An existing test is never edited to make it pass**: if one fails or seems to need a change, stop and tell the owner. New behaviour is additive and off or absent until the server reports the matching feature. Golden tests (written against the current behaviour, green before the change) cover whatever must not move.
- **Privacy (binding, same as the server's).** No telemetry of any kind. No network call to any host other than the configured server. No code, message, file content, image, file name, tool argument or tool result is ever written anywhere: not to a file, not to the output channel, not to an error message. Logs carry codes, durations and counts only. The API key lives only in VS Code's secret storage and is never printed or logged. The extension never changes a setting that is not its own, never disables another extension or provider, and has no global side effect. The only files it ever writes are those a lot names explicitly and the user approved (Lot X3: `.github/agents/cabinet-*.agent.md` and one line in `.git/info/exclude`). Privacy rules are tests, not intentions.
- **Neutrality.** Every string the model sees (tool descriptions, bundled agent instructions) is neutral about who the user is: no profession, no organisation. A guard test sits beside each such string or file.
- **Supply chain.** Zero runtime dependencies: only `node:` built-ins. Dev dependencies pinned to exact versions, lockfile committed, no install script, no download at build time other than `npm ci`. Free licences only (Apache 2.0, MIT, BSD); anything else needs the owner's decision. **Propose the list of dev dependencies (name, exact version checked with `npm view`, licence) and wait for the owner's go-ahead before the first `npm install`.**
- **Quality bar.** The owner will keep evolving this extension by asking an AI to change it: small modules with one job each (section 1), pure functions wherever possible, every behaviour covered by a test that needs neither VS Code nor the network (the stub gateway is local), the VS Code API behind one thin adapter, `docs/ARCHITECTURE.md` (what each module does, the data flow of one chat request, where to add a feature) updated by every lot. Guard tests make rules executable: a language guard (no French diacritics in tracked sources, tests and docs, except one named fixture file), a no-store test, a neutrality guard, a drift test (the README and the guide mention every command, setting and menu entry of `package.json`).
- **Honesty about what was verified.** You cannot see the owner's screen or answer a VS Code prompt: every click, install and editor step is the owner's. The report says plainly what was walked, what was not, and what is "expected, not yet seen". Facts about VS Code are checked against the pinned `@types/vscode` and the recorded spike findings, with the evidence written in the decision.
- **Stop and ask the owner** (short question in plain French, with a recommended option) when: an existing test fails or seems to need a change; a file outside the lot's list seems to need a change; a design in the lot file proves wrong against the code or the spike findings; a dependency, a download or a licence needs a go-ahead; something the contract promises seems impossible.
- **Decisions and lessons.** `docs/DECISIONS.md` (D-001, D-002, ...): one entry per decision, dated, with the reason and who decided; never reopened without the owner; the next free number. `docs/LESSONS.md` (1, 2, ...): one entry per mistake, written **the moment it is found** (what happened, the rule that prevents it).
- **Human tests** (`docs/human-tests/<lot>.md`) follow `docs/HUMAN-TESTS-PROTOCOL.md` and `docs/VIBE-CODING-PRACTICES.md` section 6: short (forty minutes at most), a script and not a list, parts of at most about fifteen commands, "You start with" / "You leave with", every command written in full where it is asked, each in its own code block with the expectation outside it, one backup at the start and one restore at the end, nothing left out without saying so. Walk everything you can first, on temporary copies and against the stub. A run record is appended by the agent after the owner has pasted the outputs.

## 5. Anatomy of a lot file

Goal and why; branch and where it starts; estimate; what to read first; **the files it may change**; numbered steps; "done means"; the final report. It ends with a pointer to this file. A lot above about six hours is split.

Branch chain (each created from the previous one once the owner has accepted it): `docs/setup` (first commit: `.gitignore`, the practices, the contract) -> `feat/x0-spike` -> `feat/x1a-foundations` -> `feat/x1b-provider` -> `feat/x2a-view-image` -> `feat/x2b-read-document` -> `feat/x3-agents` -> `feat/x4-release`. A skipped lot is named by the owner; the next branch then starts from the newest one.

## 6. The final report (in French)

Short sections: what was built; what was walked (with the test counts, baseline then final); what was **not** walked and what is "expected, not yet seen"; decisions taken (with their numbers); gaps found in the contract; the proof that the untouchable paths are unchanged (the empty `git diff --stat`); what the owner has to do and how long it takes; the git commands (section 4); the next lot.

## 7. Pairing with the server's lots

| Extension lot | Server lot it is tested against | Until then |
| --- | --- | --- |
| X0, X1a | none | the stub; `GET /health` of the tower works today |
| X1b | 15b installed (MSI 0.1.12) and `IDE_ENABLED=on` | the stub |
| X2a | none for `view` mode | the stub |
| X2b | 17b (route), 17a (engine) | the stub |
| X3 | 16 | the stub |
| X4 | all, plus 18 (large machines) and 19 (editor-only keys), which have no extension lot but appear in the compatibility table | the stub |

The server's lots may be done in another order or later; every extension lot runs against the stub first and tolerates a server that lacks the feature (`features`, `ide_api`, a `404` means "editor surface off").

## 8. What was verified about VS Code before the spike (docs dated 21 October 2026, and `vscode.d.ts` of the `main` branch), and what is still unknown

Re-read the real definitions at the start of your work: `@types/vscode` is the authority, not this summary. After Lot X0, `docs/SPIKE-FINDINGS.md` overrides everything below.

Verified:
- **Provider API**: `contributes.languageModelChatProviders` (`vendor`, `displayName`, optional `managementCommand`) and `vscode.lm.registerLanguageModelChatProvider(vendor, provider)`. The provider implements `provideLanguageModelChatInformation(options: {silent}, token)` (fields per model: `id`, `name`, `family`, `version`, `maxInputTokens`, `maxOutputTokens`, optional `tooltip`, `detail`, `capabilities: { imageInput?, toolCalling? }`), `provideLanguageModelChatResponse(model, messages, options, progress, token)` and `provideTokenCount(model, text | message, token)`. Message roles are `User` and `Assistant` only. Parts: `LanguageModelTextPart`, `LanguageModelToolCallPart { callId, name, input: object }`, `LanguageModelToolResultPart { callId, content[] }`, `LanguageModelDataPart` (`LanguageModelDataPart.image(bytes, mime)`, fields `mimeType`, `data`). `options.tools` and `options.toolMode` (Auto or Required) are passed in.
- **Bring-your-own-model sessions need no GitHub sign-in and no Copilot plan**, offline included. Limits stated by the docs: inline suggestions (ghost text) and features based on embeddings (semantic search) still need a Copilot plan; for Copilot Business or Enterprise accounts an administrator can disable the "Bring Your Own Language Model Key" policy for models provided through this API.
- **The three agents**: the built-in agents are **Agent**, **Plan** and **Ask**. Provider models are used in the **Local** harness (Session Target = Local); the Plan agent there is started with `/plan` or from the agents dropdown, and `chat.planAgent.defaultModel` chooses its model. Agent and Plan send tool definitions and need tool calling; the docs say a custom-endpoint model without tool calling is not shown in the model picker for agents.
- **Tools**: the editor's own agent tools (read, edit, create, search, run in terminal, tests, problems, fetch, ...) run on the developer's machine with the user's approvals; an extension adds its own with `contributes.languageModelTools` and `vscode.lm.registerTool(name, tool)` (`prepareInvocation` customises the confirmation; `canBeReferencedInPrompt`, `toolReferenceName`, `tags`; `vscode.lm.tools` lists every registered tool). A tool returns `LanguageModelToolResult([parts])`, and parts may be `LanguageModelDataPart` images.
- **Custom agents** are `.agent.md` files (YAML frontmatter: `name`, `description`, `tools`, `model`, `user-invocable`, `handoffs`, ...; Markdown body = instructions) in the workspace folder `.github/agents`; the agents dropdown also lists agents "from extensions". The manifest key `chatAgents` exists in Microsoft's own extension manifest; the dynamic registration API (`chatPromptFiles`) is a **proposed** API, which a sideloaded `.vsix` cannot use in stable VS Code.
- **MCP** servers can be registered by an extension (`registerMcpServerDefinitionProvider`). This programme does **not** use it: the files live on the developer's machine, so file tools must run there.
- A `.vsix` is installed with the Extensions view menu (`...`) then **Install from VSIX...**, or `code --install-extension file.vsix`. No marketplace is involved.

Still unknown, settled by Lot X0 on a real VS Code (do not assume): whether a provider extension's models are offered in Agent and Plan with no sign-in on the owner's version, and which activation event makes them appear; what exactly Agent and Plan hand to `provideLanguageModelChatResponse`; how pasted images and attached files arrive; whether a sideloaded `.vsix` can contribute `chatAgents`; whether a `when` clause hides a contributed tool; the editor's tool names; the effect of `"scope": "machine"` against a workspace settings file; `extensionKind` under remote windows.
