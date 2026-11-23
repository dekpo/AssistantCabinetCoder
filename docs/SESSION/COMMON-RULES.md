# Common rules of the extension programme (Lots X0 to X4)

Every lot file of this folder says "read `docs/SESSION/COMMON-RULES.md` first". This file replaces the block of rules and VS Code facts that used to be copied at the end of each lot, so that a rule is changed in one place. Since 30 October 2026 the folder `docs/SESSION/` is tracked by git (handover between machines; Lot X1c asks the owner whether it stays tracked). The general practices of the programme are in the tracked file `docs/VIBE-CODING-PRACTICES.md`; this file adds what is specific to the extension and to the lots.

## 1. The project

- **Name: AssistantCabinetCoder.** A VS Code extension that gives the editor's chat the models of the server `AssistantCabinetServer`. **Since 23 November 2026 (D-026) the extension is moving to a chat panel of its own** (Lots P0a and P0b); the provider in the editor's chat is frozen at 0.2.3. Folder: `/Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder` on the owner's Mac (the owner's machine since 6 November 2026); `C:\Users\dwyol\Documents\CURSOR\AssistantCabinetCoder` on the Windows PC. Remote: `https://github.com/dekpo/AssistantCabinetCoder.git`. (The older session files and the shared contract say `AssistantCabinetVSCode`: same project, the owner decided on 27 October 2026 that the name is `AssistantCabinetCoder`. The contract copy keeps the old name on purpose, see section 2.)
- The server project is next to this one (`../AssistantCabinetServer`, branch `develop`). You may **read** it when a lot says so (read-only: never write there, not even `git fetch`). You never change it, nor `AssistantCabinetDesktop` or `AssistantCabinetAI`. Its session files for the editor surface are in its `docs/IDE-VSCODE-SESSION/`; what it wants the extension to know is in its `docs/handoffs/CODER-EXTENSION.md`.
- **The server side of `/ide/v1` is complete** (server Lots 15a, 15b, 15c, 16, 17a, 17b, 18; only Lot 19, editor-only keys, is optional and not built). The tower `http://192.168.1.83:8090` no longer exists.
- **The servers you test against** (state of 21 November 2026, read-only `GET /health` and `GET /ide/v1/models` on the Mac): the owner's Mac runs the server whose `/health` reports version **0.1.13** (the server project's handoff of the same day says package 0.1.11, then 0.1.12 from its Lot 39; the owner asked the server project which is right: read `/health` again rather than trusting either), gateway on `http://127.0.0.1:1975` (always) and `http://192.168.75.1:1975`, plain HTTP, `AUTH_MODE=off`, 128 GiB of memory, `IDE_ENABLED=on` (D-020), `IDE_ONLY_ALIASES` unset (so the desktop application sees every alias too), features `agents` true, `document_analysis` and `image_description` false. 23 chat aliases, among them `devstral-2` (window 65 536, ceiling 16 384, tools, no vision; kept on that machine only for the owner's comparison, off the server's recommended list, server D-092 and D-095 (4)), `gpt-oss:120b` (131 072, 16 384, tools, no vision), `gpt-oss:20b`, `qwen2.5-coder:14b` and `qwen2.5-coder:7b` (32 768, 16 384, tools, no vision). The server's guard refuses Agent and Plan below about 51 000 tokens of window until its Lot 41 makes the guard's ratio a setting (server D-095). The Windows PC runs MSI 0.1.28 or newer on `127.0.0.1:1975` and `192.168.75.2:1975`. The editor surface is **off** by default (`IDE_ENABLED`); turning it on is the owner's action (section 7).
- The administrator's command is **`cabinet`** (server D-067), run with `sudo` on macOS. The old name `cabinet-server` survives only in frozen records.

### Identifiers (one table, used by every lot; a lot never invents another spelling)

| Thing | Value |
| --- | --- |
| npm `name` | `assistant-cabinet-coder` |
| `displayName` | `Assistant Cabinet Coder` |
| `publisher` | `assistantcabinet` (D-004) |
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

`docs/IDE-CONTRACT.md` (tracked, committed in the first commit) is the vendored copy of the server's contract, byte-identical to the server's (last refreshed on 6 November 2026, commit `2149ec6`; checked identical again on 18 November 2026). A guard test compares the two when the server repository is next to this one; a red guard is lesson 7. **Never edit it here**: a change is made in the server project and copied over. It still names the old project name and the "Lots X0 to X4"; that is accepted, and the server project decides when to update it. If the contract is not enough for a lot, write the gap in the report; never guess the server's internals.

## 3. Read first, in every chat

`docs/VIBE-CODING-PRACTICES.md`; this file; the lot file; then, when they exist, `AGENTS.md`, `docs/DECISIONS.md`, `docs/LESSONS.md` (all of it), `docs/ARCHITECTURE.md`, `docs/HUMAN-TESTS-PROTOCOL.md`, `docs/SPIKE-FINDINGS.md` (**the facts measured by Lot X0 override every assumption in section 8 below**), and the files named in the lot's "Read first". Read each file once.

## 4. Binding rules

- **One lot per chat.** Do only the lot you were started from. If the repository is not the one at the path above, or the branch the lot starts from does not exist, stop and say so.
- **Git is owner-only.** Never commit, stage, push or tag. `git status`, `git log`, `git diff` (read-only) are allowed and are used to write the final commands. At the end give: the branch name, one or two single-line Conventional Commit subjects (one sentence, no body), and the **full copy-paste Git Bash commands for the local repository and the remote** (`git checkout <previous branch>`, `git checkout -b <branch>`, `git add <the files>`, `git commit -m "..."`, `git push -u origin <branch>`), written after reading `git status` and `git log` so they match the real state. One branch per lot, created from the previous lot's branch, never from `main`; nothing is ever proposed for `main` and no pull request (owner rule of 25 October 2026). **No AI attribution anywhere git-facing**: no Claude or model name, no co-author trailer, no generated-by link, in a commit, a branch name or a PR, whatever the tooling's default says. Nothing is published to any marketplace.
- **Language.** Every file (code, comments, tests, documents, commit subjects, machine codes, the prompts written for another chat) is English, with no French anywhere. The extension's user-facing messages are English and live in one file, `src/messages.ts`. Any command-line script of the repository speaks English only. **Reply to the owner in French, in plain words, without jargon, in short sentences.**
- **Terminal.** Everything written for the owner (human-test scripts included) uses POSIX shell commands. **On the Mac** (the owner's machine since 6 November 2026): Terminal (zsh), `/Users/ydekpo/...` paths, `shasum -a 256`, and the `code` command is not on the PATH (use `"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"` or have the owner install the shell command). **On Windows**: Git Bash and `/c/Users/...` paths; no PowerShell, no `cmd`, except a step specific to Windows that Git Bash cannot do (say so in one line). Name the terminal at the top of every part. Editor steps name every click by its exact label. Run yourself every command that needs no click in VS Code and no `sudo` (owner's request of 30 October 2026); give one human-test part per message.
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

Branch chain (each created from the previous one once the owner has accepted it): `docs/setup` (first commit: `.gitignore`, the practices, the contract) -> `feat/x0-spike` -> `feat/x1a-foundations` -> `feat/x1b-provider` -> `feat/logo-icon` (the icon, 6 November 2026) -> `feat/x1c-server-catch-up` (loopback, `cabinet`, and the X1b human test) -> `feat/x1d-agent-budget` (the input budget, D-023) -> `feat/x1e-refusals-and-stops` (the memory of refusals and the overflow numbers, D-025; closed without its human test by D-026) -> `feat/p0a-panel` (the extension's own chat panel, D-026) -> `feat/p0b-panel-agent`. Lots X2a, X2b, X3 and X4 (`feat/x2a-view-image`, `feat/x2b-read-document`, `feat/x3-agents`, `feat/x4-release`) are paused by D-026 and planned again on the panel after the owner's verdict on P0b. A skipped lot is named by the owner; the next branch then starts from the newest one.

Versions: each lot that produces an installed build raises the version (practice 9): 0.2.0 (X1b, icon), 0.2.1 (X1c), 0.2.2 (X1d), 0.2.3 (X1e, never installed outside a throw-away profile), then 0.3.0 (P0a) and 0.4.0 (P0b); the numbers of the lots after P0b are set when they are planned again; the release number of X4 is the owner's choice (proposed 1.0.0). The manifest tests pin the version, so each lot names their version assertions as its only named exceptions.

## 6. The final report (in French)

Short sections: what was built; what was walked (with the test counts, baseline then final); what was **not** walked and what is "expected, not yet seen"; decisions taken (with their numbers); gaps found in the contract; the proof that the untouchable paths are unchanged (the empty `git diff --stat`); what the owner has to do and how long it takes; the git commands (section 4); the next lot.

## 7. Pairing with the server's lots

Every server lot the extension needs is built and installed (18 November 2026). What each extension lot needs is a **setting** on the server, turned on by the owner:

| Extension lot | Server lot | Server settings the real test needs (owner, with `sudo` on the Mac) |
| --- | --- | --- |
| X0, X1a | none | none |
| X1b, X1c | 15b, 15c, 27 (loopback) | `IDE_ENABLED=on` |
| X2a | none for `view` mode | `IDE_ENABLED=on`, a model that reports `vision` |
| X2b | 17a, 17b | `IDE_DOCUMENT_ANALYSIS=on`, `IDE_VISION_ALIAS=<a vision alias>` |
| X3 | 16 | an `ide-agents.json` in the server's `config` folder (the server ships none: the administrator writes it) |
| X4 | all, plus 18 (large machines) and 19 (editor-only keys, optional, not built), which appear in the compatibility table | HTTPS and a key for the security parts, only if the owner agrees |

Every extension lot still runs against the stub first and tolerates a server that lacks the feature (`features`, `ide_api`, a `404` means "editor surface off").

**The server is shared with the desktop application, which is still in development and testing.** Binding:

- **Never change the server's code, its files or its settings yourself.** Every server-side step is given to the owner as commands, with what it changes and how to undo it.
- **Before any server-side step, warn the owner in plain words** when it can disturb the desktop application: a restart of the gateway (a desktop request in progress fails; prefer `cabinet restart gateway`, which keeps Ollama and its loaded models), a big model loaded for the editor (the Mac keeps at most two models loaded, `OLLAMA_MAX_LOADED_MODELS=2`, so a code model can push out the model the desktop uses and make its next answer slow), an editor generation running at the same time as a desktop one (separate gates, but the same runtime and the same GPU: both are slower), a setting that the desktop's guide does not expect. Let the owner choose the moment.
- **Undo at the end of a test** what the test turned on, unless the owner says to keep it, and record the answer in the run record.
- If a server defect is found, write it in the report for the server project (the owner carries it there); never work around it in the server.

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

## 9. Aligning the next lot's prompt (rolling plan)

The lot files of this folder were written ahead of time; each is a plan, not a fact. At the end of every lot, **before** the owner opens the next chat, the agent of the finished lot (or the planning chat) aligns the next lot file with what really happened, and says what it changed:

- the branch it starts from and the base of its `git diff --stat` (the real previous branch);
- the baseline test count (the previous lot's final count);
- module names, interfaces, stub markers and test files that really exist (read the code, not this plan);
- the version number and the named exceptions (the version assertions) it needs;
- facts from the run records (`docs/human-tests/*.md`), new decisions and lessons, and any change found in the server project's `docs/handoffs/CODER-EXTENSION.md` or `docs/IDE-CONTRACT.md`;
- the server settings its real test needs and the warnings of section 7.

A lot file that turns out wrong during its own lot is not silently followed: stop and ask the owner (section 4).
