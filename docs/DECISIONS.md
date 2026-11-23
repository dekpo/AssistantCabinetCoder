# Decisions

One entry per decision, dated, with the reason and who decided. Never reopened without the owner. New decisions take the next free number.

## D-001 The project and extension are named AssistantCabinetCoder

27 October 2026, decided by the owner. The folder, the remote and the npm name (`assistant-cabinet-coder`) follow it. The older session files and the vendored contract still say `AssistantCabinetVSCode`: same project; the contract copy keeps the old name on purpose until the server project updates it.

## D-002 No merge into `main` until the owner declares the product perfect

25 October 2026, decided by the owner. Work stays on lot branches, each new branch starts from the previous lot branch. No merge into `main` and no pull request is proposed.

## D-003 The practices of `docs/VIBE-CODING-PRACTICES.md` apply

27 October 2026, decided by the owner. The file is copied from the server project and kept current here: a practice that proves wrong is corrected in it the moment it is found.

## D-004 Publisher is `assistantcabinet`

27 October 2026, answer of the owner at the start of Lot X0 (recommended default accepted).

## D-005 Licence is MIT

27 October 2026, answer of the owner at the start of Lot X0 (recommended default accepted). `LICENSE` names Dekpo-Wyna Yologaza (the git user of the repository) as copyright holder; the owner may change the name.

## D-006 Tests use Node's built-in runner

27 October 2026, set by the Lot X0 specification and accepted by the owner. Tests are compiled by `tsc` and run with `node --test "out/test/**/*.test.js"`; no test framework is added, so no dev dependency for it.

## D-007 Dev dependencies and their exact versions

27 October 2026, go-ahead of the owner; versions checked with `npm view` the same day. All pinned exactly in `package.json`, lockfile committed, `.npmrc` sets `ignore-scripts=true` (the only install script in the tree, in `@vscode/vsce-sign`, is therefore never run; `vsce package` does not need it).

| Package           | Version | Licence    |
| ----------------- | ------- | ---------- |
| typescript        | 6.0.3   | Apache-2.0 |
| @types/vscode     | 1.140.0 | MIT        |
| @types/node       | 24.19.2 | MIT        |
| @vscode/vsce      | 4.0.0   | MIT        |
| eslint            | 10.13.0 | MIT        |
| @eslint/js        | 10.0.1  | MIT        |
| typescript-eslint | 8.72.1  | MIT        |
| prettier          | 3.9.10  | MIT        |

Two choices differ from the first proposal made to the owner:

- **TypeScript 6.0.3, not 7.0.2.** `typescript-eslint` 8.72.1 declares the peer range `typescript >=4.8.4 <6.1.0`, so TypeScript 7 cannot be used with the linter. Same licence.
- **`@types/node` 24.19.2, not 26.x.** The owner's Node is 24 (the latest 24 release of the types is used); `engines.node` is `>=22`.

`@types/vscode` is pinned to the same minimum as `engines.vscode` (`^1.140.0`), because `vsce` refuses a `@types/vscode` newer than the engine. The owner's VS Code at the time of Lot X0 is 1.142.0. Lot X0's findings may raise this minimum.

Known and accepted: `npm audit` reports two high-severity advisories in `@azure/msal-node` (through `@azure/identity`, a dependency of `@vscode/vsce` used only to publish to the marketplace). Nothing is published by this programme and the package is a development tool that never ships in the `.vsix`, so no fix is applied; `npm audit fix` would change pinned versions and is not run without the owner.

## D-008 The spike test runs in a separate VS Code profile

27 October 2026, decided by the agent for Lot X0 and reported to the owner. `docs/human-tests/X0-spike.md` opens VS Code with its own `--user-data-dir` and `--extensions-dir`. Reasons: the window starts signed out of GitHub with no Copilot, which is the situation of the intended users; the owner's real settings and extensions cannot change (a hash of the real user settings file before and after is the proof). The remote-window question (h) forces the extension side with the `remote.extensionKind` override instead of building a second package, which approximates a manifest value; the run record says so.

## D-009 Lot X0 verdict: Go with changes

27 October 2026, decided by the owner after the run recorded in `docs/SPIKE-FINDINGS.md` (VS Code 1.143.1 stable, signed out, no Copilot plan, folder trusted). Evidence: the provider's model, the editor's own file tools, an image in a tool result, an attached or pasted image, the shipped agent and the `when` clause all worked without any sign-in. Changes to the plan: a System role is handled by the conversion; a model without tool calling is never shown in the chat; a PDF is text only, so Lot X2b stays necessary; the `model:` string of agent files is tested first in Lot X3; remote windows are retested before the release. Lot X1a starts from `feat/x0-spike`.

## D-010 The extension activates on `onStartupFinished`

27 October 2026, decided by the agent in Lot X1a and reported to the owner, who may reverse it. The Lot X1a text says "activation only when needed (never `*`; commands activate it)". But the status bar item (`Cabinet: connected | off | key needed | unreachable`) must exist before any command is run, so the extension also activates once VS Code has finished starting. It never uses `*`. At that moment it makes one request to the configured (or locally discovered) server and to no other host; with no server configured and none found, it makes no request and the status bar item stays hidden. The manifest test accepts only that one event. The provider's own event is added by Lot X1b.

## D-011 Small additions to the lot's lists

27 October 2026, decided by the agent in Lot X1a and reported to the owner. (1) `src/codes.ts` is a module of its own (machine codes and `CabinetError`), because `transport`, `sse`, `client`, `log` and `messages` all need the codes and none may import another's internals. (2) Three more status-bar states than the four named in the lot, `Cabinet: certificate`, `Cabinet: version` and `Cabinet: error`, because showing a wrong certificate or an interface mismatch as "unreachable" would point the user at the wrong fix. (3) A discovered `server.env` that lacks `SERVER_BIND_ADDRESS` or `SERVER_PORT` uses the server's own defaults (`127.0.0.1`, `8080`, from the server's `docs/CONFIGURATION.md`); a file with none of the five keys is "no settings". (4) The package contents are chosen with the `files` list of `package.json` (compiled sources, `LICENSE`, `README.md`) instead of a `.vscodeignore`, to stay inside the lot's file list. (5) The `.vsix` is built by `npm run package`; `npm run stub` builds first, then starts the stub.

## D-012 The test authority is built with `node:crypto` alone

27 October 2026, decided by the agent in Lot X1a. Node cannot issue certificates and the HTTPS tests must pass on any machine, so `test/support/pki.ts` writes the few X.509 structures it needs (ECDSA P-256, basic constraints, key usage, subject alternative names) by hand and signs them with `crypto.sign`. No OpenSSL, no new dependency; the authority is created in memory at run time and never stored (`*.pem` is ignored by git). The demo (`npm run stub -- --https FOLDER`) writes only the public authority file.

## D-013 The vendored contract is refreshed from the server's copy

28 October 2026, decided by the owner at the start of Lot X1b. The server's Lot 17b (committed on 27 October 2026, late evening) changed `docs/IDE-CONTRACT.md`: `features.image_description` is `true` only when `document_analysis` is also `true`, and a "Clarifications (Lot 17b, D-055)" section details `POST /ide/v1/files/analyze`. The contract guard (`test/guards.test.ts`) compares the two copies when the server repository is next to this one, so it failed in the baseline run (121 passed, 1 failed). The owner asked the agent to copy the server's file over; the copy is byte-identical (`cmp`). Nothing in the chat surface (`/ide/v1/models`, `/ide/v1/chat/completions`) changed, so Lot X1b's code is not affected. This copy changes a file that the lot lists as untouchable, so it goes in a commit of its own.

## D-014 How an editor message becomes a server message

28 October 2026, decided by the agent in Lot X1b, from `docs/IDE-CONTRACT.md` section 3 and the facts of `docs/SPIKE-FINDINGS.md` (b) to (e), which the real run showed to match the lot's description: no difference was found.

- **Roles go by name.** The adapter turns each role number into its name with `LanguageModelChatMessageRole[role]` (`User`, `Assistant`, `System`) and `convert` never sees a number. Any other name is refused before sending. A `System` message becomes a `system` message (its text parts joined with a line break).
- **User messages:** one text part and nothing else is a string; several parts, or an image among them, are a list of parts in the editor's order. A message with no content is skipped. Tool results come first (one `tool` message each), then the text. An `Assistant` message's text parts are joined with nothing between them (they are consecutive pieces of one answer), and its tool calls become `tool_calls` with `JSON.stringify(input)`.
- **Tool results:** the text parts are joined with a line break. An image part (`image/png`, `image/jpeg`, `image/webp`, `image/gif`) cannot ride in a `tool` message, so one `user` message follows all the tool messages, holding for each result a short note naming the tool (only a name with a valid shape, otherwise "a tool") and its images; the `tool` message then says the image is in the next message. A part of another kind (a prompt-tsx part, a data part that is not a supported image) is replaced by a note, never dropped silently.
- **Anything else is refused:** a data part of another mime type or with no bytes, a part of an unknown kind, a tool call in a user message, an image in an assistant or system message. Refusing is safer than dropping: the user is told, and the server sees only what the user sent.
- **Images and vision:** an image (in a message or in a tool result) for a model whose `capabilities.vision` is false is refused before sending. The history is replayed by the editor in every request, so an old image keeps being sent; the server's own refusals (`payload_too_large`, `provider_capability_unsupported`) are shown by their sentences.
- **Request:** `stream: true`, `stream_options.include_usage: true`, `model` = the alias, no `max_tokens`. `temperature`, `top_p` and `stop` only when the editor sent that key with a well-formed value (the real `modelOptions` hold only private `_...` keys). `tools` and `tool_choice` are sent only when at least one tool has a name the server accepts (`^[A-Za-z0-9_.:/-]{1,128}$`); a tool with another name is left out and counted. `Required` becomes `"required"`, which the server accepts and ignores (the README states the limit).
- **Answer:** text deltas at once; tool calls accumulated by `index` and reported when the answer says it is finished or the stream ends; arguments are parsed as a JSON object (empty means `{}`); an unusable call is an error that names the tool only when it is in the request's own list and has a valid shape, and never shows the arguments.

## D-015 The refusals made before sending are `ConvertError`s, not new machine codes

28 October 2026, decided by the agent in Lot X1b. `src/codes.ts` is untouchable in this lot, so the new failures (an unknown role, content that cannot be carried, an image for a model without vision, a tool call without a name, arguments that are not valid) are a `ConvertError` of `convert.ts` with a closed `ConvertReason` (its `message` is the reason, never text). `messages.ts` holds one sentence per reason (`CONVERSION_MESSAGES`, a type that demands one). In the log each reason is written under the nearest existing machine code: `invalid_request` (role, part), `provider_capability_unsupported` (image without vision), `bad_response` (the model's tool call). If a later lot may touch `codes.ts`, these can become extension codes.

## D-016 The provider: cache, coalescing, messages, token estimate

28 October 2026, decided by the agent in Lot X1b, from the facts of `docs/SPIKE-FINDINGS.md` (the list is requested six times in a second, `silent` true).

- **The list:** a cache of 60 seconds with one entry per server address and at most 8 addresses (the oldest is forgotten); concurrent requests for the same address share one request in flight; a failed refresh keeps the last good list; the cache is cleared, and `onDidChangeLanguageModelChatInformation` fired, in `extension.refreshStatus` only (the one place that reacts to the three commands and to the settings); an answer started before such a change is not cached. Surface off, key needed and a version mismatch return no model (and drop the cached list); the administrator sentence is shown once per address and session, and only when the call is not silent.
- **Model information:** `id`, `name` and `family` are the alias, `version` is `"1"`, `detail` is `Assistant Cabinet Coder`, `maxOutputTokens` is the ceiling, `maxInputTokens` is the window minus the ceiling (at least 1; amended by D-023). A server that does not report a window or a ceiling gets 8192 and 2048 tokens, and the tooltip says "assumed". Every model the server lists is listed, even without tool calling (the tooltip says VS Code will not offer it), in the server's order.
- **A stream that stops:** a connection that drops after the answer started is `stream_truncated`, not `unreachable`.
- **Token estimate:** `ceil(characters / ratio)` over text, tool-call names and arguments and tool-result text, plus 1024 per image; the ratio starts at 3.0 (so the estimate errs high), is corrected per model from `usage.prompt_tokens` with a moving average of weight 0.3, clamped to 2.0 and 6.0, in a table of at most 32 models. It never uses the network.
- **Host:** the provider is written against a `Host` interface (resolve the connection, show a message, log, fire the change event) and reports plain parts; `extension.ts` supplies the `Host` and builds the editor's classes, so everything but the adapter is tested without VS Code.

## D-017 Small changes to existing files, forced by the lot's own rules

28 October 2026, decided by the agent in Lot X1b and reported to the owner. (1) `src/messages.ts` is "additions only", but its Test Connection note said "(measured by the spike)" and the lot requires that no file outside the frozen records mentions the removed probe: the words became "(measured on that version)"; the test of that note matches the sentence before the brackets and still passes. (2) In `test/manifest.test.ts`, besides the two named edits (the version, the assertion that the provider contribution is absent), the title of that test said "no provider contribution yet" and was changed to "no tool or agent contribution yet", because the title would be false. (3) The new test helpers are in new files (`test/support/editor.ts`, `fake-host.ts`, `fake-server.ts`); the existing support files are unchanged.

## D-018 Discovery targets the loopback in plain HTTP unless the server listens on a wildcard with HTTPS

18 November 2026, decided by the agent in Lot X1c from the lot file, the server's decision D-074 (its Lot 27) and its handoff note `docs/handoffs/CODER-EXTENSION.md` section 2; the owner agreed to the lot on 18 November 2026. Since D-074 the gateway always listens on `http://127.0.0.1:<SERVER_PORT>` and adds `SERVER_BIND_ADDRESS` only while that address exists on the machine; HTTPS applies to the network address only, except for `0.0.0.0`, where one listener speaks HTTPS everywhere; 127.0.0.1 is not among the certificate names. The address can also change while the server runs (D-081, `cabinet config address`). The older rule used the network address with the configured scheme, which fails as soon as that address disappears (on the owner's Mac: `http://192.168.75.1:1975`).

- **A specific bind address** (IPv4, IPv6 or a host name): the target is `http://127.0.0.1:<port>`, whatever `TLS_MODE` says.
- **A wildcard** (`0.0.0.0`, `::`): unchanged, plain HTTP on `127.0.0.1`, or with TLS on HTTPS on the first certificate name (no target when there is none).
- **The authority file** is attached to an HTTPS target only (the `caFile` setting, else the installation's `ca.pem`); a plain-HTTP loopback target gets none. `transport` already reads it for HTTPS only, so this changes no connection, only what `Target.caFile` says.
- A configured `assistantCabinetCoder.serverUrl` still wins over discovery.
- `server.env` is read again at every discovery: `extension.resolve` calls `discoverServer` at start, at each status refresh, at each command and for each model list or chat request, with no cache (checked in `src/extension.ts`, lines 68 to 77; a test in `test/discovery-loopback.test.ts` proves the re-read).

Existing tests changed, as named exceptions of the lot: in `test/discovery.test.ts` the specific-address expectations (the title "uses a specific bind address as it is" became "uses the loopback for a specific bind address", because it would be false), the port-80 case and the Windows installation outcome. Two more, outside the lot's list, approved by the owner on 18 November 2026 when asked: "brackets an IPv6 address" (`::1` now gives the loopback; title changed to "uses the loopback for an IPv6 bind address"; the brackets stay tested with an IPv6 certificate name under a wildcard in the new file), and "lets the caFile setting win over the default" (its input became a wildcard with HTTPS, where the authority file applies).

## D-019 The owner works on a Mac: commands for the owner are POSIX shell commands, zsh on macOS

18 November 2026, owner's agreement to Lot X1c. The owner's machine is a Mac since 6 November 2026. `AGENTS.md` ("Terminal") and `docs/HUMAN-TESTS-PROTOCOL.md` (the rule that was "Git Bash only") now say: commands written for the owner are POSIX shell commands; on macOS they run in Terminal (zsh) with `/Users/...` paths; on Windows they stay Git Bash with `/c/Users/...` paths; no PowerShell or `cmd` except a Windows-only step that Git Bash cannot do. Frozen records keep the commands they were played with.

## D-020 The editor surface of the owner's Mac server stays on

19 November 2026, owner's decision at the end of the X1b and X1c human test. `IDE_ENABLED=on` stays set on the Mac's server (package 0.1.11, `AUTH_MODE=off`), so the next lots' real tests can use it without a server step. The owner was told that while it is on, anyone who reaches port 1975 on the network can use the editor surface without a key. Turning it off is the owner's step (`sudo cabinet config set IDE_ENABLED=off`, then `sudo cabinet restart`).

## D-021 The session prompts stay tracked

19 November 2026, owner's decision, ending the temporary arrangement of 30 October 2026. `docs/SESSION/` (the lot prompts, `COMMON-RULES.md`, `PLAN-EXTENSION.md`) stays tracked by git, so the plan travels with the branch. `.gitignore` no longer carries the TEMPORARY comment; it keeps ignoring loose `docs/SESSION-*.md` files at the top of `docs/`. `docs/HANDOVER.md` was deleted: the work has resumed and the X1b run record is written. The line of `AGENTS.md` that listed session prompts among local-only files now says they are tracked.

## D-022 A short Lot X1d comes before Lot X2a: the input budget for Agent mode

19 November 2026, owner's decision after Part 5 of the human test. On VS Code 1.147.0 Agent mode refused the Mac's `qwen2.5-coder:14b` before sending anything ("static system messages and tool definitions exceed this model's context budget"). Every model of that server has a window of at most 32768 tokens, and the extension reports `maxInputTokens` as the window minus the ceiling (16384 for those models, decision D-016), with an estimate that errs high (3 characters per token before calibration). Lot X1d measures what the editor counts and needs, and adjusts how the input budget and the estimate are reported, with a real Agent turn on the Mac's server as its proof. Lot X2a then starts from the X1d branch.

## D-023 The input budget keeps an eighth of the window for the answer (amends D-016)

19 November 2026, owner's choice of option (a-prime) after Part A of Lot X1d. `maxInputTokens` is the window minus a reserve for the answer: an eighth of the window, at least 2048 tokens, never more than the output ceiling, and the result at least 1 (`toModelEntry` in `src/provider.ts`). `maxOutputTokens` stays the ceiling and the token estimate is unchanged (ratio 3.0 at the start, same calibration). A 32768-token model with a 16384 ceiling goes from 16384 to 28672 input tokens; 131072 with 16384 and the fallback 8192 with 2048 keep their old values (114688 and 6144).

Evidence, measured on VS Code 1.147.0 (macOS, signed out) with the stub's new mode `small-model` and a count-only local build that was never committed:

- The editor **never called `provideTokenCount`** in five turns (Agent and Plan, refused and accepted alike). Its new agent harness (the "new Copilot experience" banner; the refusal text is in the native runtime of the bundled Copilot SDK, which counts tokens itself) compares its own count of the system message and tool definitions with `maxInputTokens`. So a higher ratio (option b) has no effect on the refusal.
- An Agent turn sends a system message of 23647 characters and 59 tools whose JSON is 76601 characters (Plan: 61 tools, 78875 characters).
- With probe models of the same 32768 shape: 16384 and 24576 input tokens were refused and 28672 started, in Agent; 28672 also started in Plan. The threshold lies between 24576 and 28672, so option (a) of the lot file (a quarter of the window) was not enough.

Accepted costs, told to the owner: the model has only a few thousand tokens left for its answer inside a 32768 window; more tools (an MCP server, another extension, the tools of Lots X2a and X2b) can bring the refusal back, because the margin above the threshold is unknown and small. Rejected: (a) a quarter, refused; (b) and (c), no effect; a sixteenth (30720), more margin, but the editor would let a conversation grow to the edge of the window, where the server's runtime silently drops the oldest messages. Option (d) is the long-term answer: D-024.

The stub's new model is served in a new mode, not in the default list, because nine existing tests count exactly three models (agent's choice within the lot, reported to the owner).

## D-024 Real coding use means a dedicated server with large windows and large code models

19 November 2026, decided by the owner when choosing D-023. The developers who will code with this solution do not use the desktop application at the same time, so the extension's real tests are to be judged in real conditions of use, not in the shared configuration of the owner's Mac. A 32768-token window is a floor that Agent mode just fits on VS Code 1.147.0 (D-023), not the target: the comfortable answer is option (d), larger windows on the server (`cabinet models context`, 65536 tokens or more), with much larger code models, for example `devstral-2` (123B, licence given by the owner as a modified MIT licence, `https://ollama.com/library/devstral-2`). This is a particular use case of the solution: a server dedicated to coding.

Consequences for the next lots:

- The extension needs no change for larger windows: the rule of D-023 gives 57344 input tokens for 65536 and 114688 for 131072.
- When the owner's server offers a code model with a window of 65536 tokens or more, a lot's real test uses it for Agent and Plan, besides a 32768-token model, which stays the minimum case.
- Choosing, pulling and sizing such a model (its own maximum window, its memory, its licence terms) is done in the server project by the owner; nothing is changed from here (COMMON-RULES section 7). While the test server is the owner's shared Mac, the warnings about the desktop application still apply.

Measured on 20 November 2026 (human test X1d, Part 2b, VS Code 1.147.0, the owner's Mac, `devstral-2` served by the owner with a window of 65536 and a ceiling of 16384, extension 0.2.2): the picker showed 74K (57344 + 16384); an Agent turn created `hello.txt` (one tool call, then a final answer) and a Plan turn answered, with no refusal from the editor or the server. The real tokenizer counted 21597 prompt tokens for the Agent request (about 4.7 characters per token for the editor's roughly 101000 characters) and 23747 for Plan. The first request of each chat took 219 s (Agent) and 201 s (Plan); the second Agent request, with the same prompt start, took 6 s. So with this model on this machine the first turn of a chat costs three to four minutes, and later turns of the same chat are quick. The owner found it slow and is trying `gpt-oss:120b` next; the extension needs no change for either.

## D-025 The provider remembers a refusal that retrying cannot fix; the overflow sentence shows the server's numbers

21 November 2026, owner's choices in Lot X1e: the lot as proposed (Part A measures first), the numbers in the overflow sentence (which changes `src/client.ts` and `src/codes.ts`), and, after Part A, option A (the memory of refusals). Asked for by the server project's prompt `docs/handoffs/CODER-PROMPT-X1e-refusals-and-stops.md` (server decision D-095).

Evidence, measured on VS Code 1.147.0 (macOS, signed out) with the stub's new scenario `refuse` and a count-only build that rethrew each refusal as one of eight kinds and was never committed (the stub's console counted the requests):

- **Every kind was retried five times**, 6 identical requests each, in Agent (59 tools): a plain `Error`, `vscode.LanguageModelError.NoPermissions`, `.Blocked` and `.NotFound`, an `Error` carrying a `code`, a `cause`, or a `status` of 400, and `vscode.CancellationError` (which also replaced the extension's sentence with "Canceled"). The plain `Error` gave 6 requests in Ask (7 tools) and in Plan (8 tools when `/plan` was typed in an Ask chat) as well. The retries came after about 0.5, 0.8, 1.6, 3.3 and 8 seconds, about 15 seconds in all, always framed "Failed to get response from the AI model; retried 5 times ... Last error: 502". Read in the installed bundle, not measured: the retry text lives in the native runtime of the bundled Copilot SDK. So no error kind stops the retries, and no HTTP status of the server would either: the editor sees only what the extension throws.
- **The stop button never cancelled the request**: the stub's `long` answer (60 s) ran to its end in Agent (59 tools) and in Plan (61 tools), on the first and on the second turn of a chat (`ms` about 60260, no `code=cancelled`), although the words stopped on screen. Lesson 13 had seen it in Ask only.

What was built:

- **The memory** (`ChatProvider` in `src/provider.ts`): when the server refuses a request for a reason that sending it again cannot fix (`isFinalRefusal`: `context_too_large`, `payload_too_large`, `key_needed`, `model_alias_not_allowed`, `model_not_permitted`, `provider_capability_unsupported`, `invalid_request`, the extension's own `timeout`, and `provider_error` with status 504, the runtime's timeout), the provider keeps a SHA-256 digest of the server address and the request body (`requestFingerprint` in `src/client.ts`), the code, the status and the overflow numbers, for 30 seconds, at most 16 entries, the oldest forgotten first, in memory only. An identical request within that time is refused again at once without a call; its log line has the code and no status. `invalidate` (a changed address, key or authority) clears it. `server_busy`, `provider_unreachable`, `rate_limited`, `empty_answer` and `provider_error` 502 are not remembered: they may succeed a few seconds later, so the editor's retries still reach the server. The editor still shows its "retried 5 times" frame; the server receives the request once instead of six times, which matters for a timeout (one wait of up to `IDE_REQUEST_TIMEOUT_SECONDS` instead of six) on the editor door's single slot.
- **The failure stays a plain `Error`**: no other kind changes the retries, and `CancellationError` loses the sentence.
- **The overflow sentence** (`describeOverflow` in `src/messages.ts`): with `estimated_tokens` and `context_window`, "the server estimates about N tokens for a window of M tokens", the advice of the old sentence, and the administrator's command `cabinet models context <model> <tokens>` (with sudo on macOS); with `chars` and `limit`, the characters against the limit and `IDE_MAX_CONTEXT_CHARS`. Only positive integers are kept (`overflowFrom` in `src/client.ts`, carried by `CabinetError.overflow`); without them the old sentence is used. The estimate is the server's (2 characters per token, about 2.3 times the real count of the editor's Agent request), so the sentence says "estimates", never a count.
- **The stub** learned the scenario `refuse` (`[stub:refuse:<code>]`, statuses in `REFUSAL_STATUS`) and an `onChat` option, used by `npm run stub` to print one line per request and per answer's end (counts and the stub's own names only).

Two choices of the agent within the lot: (1) `requestFingerprint` lives in `client`, not in `provider`, because the guard of `test/provider-guards.test.ts` keeps `provider` free of `node:` imports, and that test is not edited; (2) 30 seconds, not the "about a minute" of the lot file: twice the measured 15 seconds of retries, while a **Try Again** clicked after an administrator's change is not answered from memory for long.

Nothing changes on the server side: the contract needs no new code or status (a message for the server project's chat was given to the owner the same day; the owner carries it).

## D-026 The extension gets its own chat panel; the editor's chat is no longer built on

23 November 2026, decided by the owner, who asked whether living inside the editor's chat was the right approach, given that extensions built for local models (Cline, Roo Code, Continue) and Claude Code each have their own panel.

Reason: every serious problem met since Lot X1b comes from the editor's chat harness (the bundled Copilot agent), and none can be fixed from the extension:

- **The prompt is the editor's.** Agent mode sends 59 tools, about 101 000 characters, before the user's first word: 21 597 real prompt tokens on `devstral-2` (D-024). That is two thirds of a 32768-token window, the reason the server's guard refuses Agent below about 51 000 tokens of window, and most of the three to four minutes of a first turn.
- **The retries are the editor's.** Every failure is retried five times whatever the extension throws (D-025). The memory of refusals hides the extra requests from the server; it does not remove the retries or the frame.
- **The stop button never reaches the extension** (D-025), so a stopped answer keeps the server's single editor slot until it ends.
- **The surface moves with every release** (tool names changed between 1.143 and 1.147; no image can be attached while signed out, lesson 12), and the editor keeps offering a sign-in.

What the owner chose (option B of the report of that day):

- **Lot X1e is closed without its human test.** Its code (the memory of refusals, the overflow numbers, the stub's `refuse` scenario) is kept on its branch as built and unit-tested (285 tests), with the measures of D-025, which are the evidence for this decision. `docs/human-tests/X1e-refusals-and-stops.md` was not played; its run record says so. Package 0.2.3 is not installed anywhere outside the throw-away profile, which was deleted.
- **The provider in the editor's chat is frozen** at 0.2.3: no new lot builds on it. Whether it stays in the package is decided at the end of the panel's first lots.
- **Lots X2a, X2b, X3 and X4 are paused.** Their goals (images, documents, the server's agent catalogue, the release) are planned again on the panel once its first lots have run.
- **The next lots are P0a and P0b**: a panel of the extension's own (a webview view, placed in the editor's right side bar when the manifest allows it), its own agent loop against the same `POST /ide/v1/chat/completions`, a small set of workspace tools chosen for local models, a real stop that closes the request, no hidden retry. P0a builds the panel and a plain chat and measures placement, stop and first-turn time; P0b adds the tools, the agent loop and approved edits and measures what local models do with them. The owner gives a verdict (_Go_, _Go with changes_, _Stop_) after P0b.
- What is kept as is: every module that speaks to the server (`codes`, `platform`, `discovery`, `transport`, `sse`, `client`, `keys`, `log`, `messages`) and its tests.

Facts read, not measured, on 23 November 2026: the installed VS Code 1.147.0 registers view containers contributed under `contributes.viewsContainers.secondarySidebar` (beside `activitybar` and `panel`) in its manifest schema, with no proposed-API gate seen around it. The contract (`docs/IDE-CONTRACT.md` section 3) already carries everything an agent loop needs (`tools`, `tool_calls`, streamed tool calls, `usage`); it does not say whether the server stops the runtime's generation when the client closes a streamed request. That question was given to the owner for the server project's chat the same day.

## D-027 The chat panel: right side bar, the provider kept, conversations saved on disk

23 November 2026, the owner's answers to the three questions of Lot P0a, and to the questions they raised.

1. **Placement**: the editor's right side bar (`contributes.viewsContainers.secondarySidebar`, container `assistantCabinetCoder`, view `assistantCabinetCoder.chat` named **Chat**, monochrome icon `images/panel.svg`). Read, not measured: the schema of the installed VS Code 1.147.0 bundle lists `secondarySidebar` beside `activitybar` and `panel` for view containers. If it does not show there, the human test says how to drag it.
2. **The provider in the editor's chat stays registered, unchanged**, in 0.3.0, until the owner's verdict after P0b.
3. **Conversations are saved on disk**, against the lot file's recommendation (memory only). The owner's reason, in substance: this extension is a professional tool for developers who vibe-code with a local model and must be as reliable as Claude's own extension; conversations are precious and losing them at every reload is not acceptable; its users accept that code and model exchanges are kept on their machine. The desktop application (documents, spreadsheets) is a different product with a different approach to local AI, and its privacy defaults must not be carried over here. Then, asked how:
   - **Where**: in the private storage VS Code gives the extension for the workspace (`ExtensionContext.storageUri`, outside the project folder, so nothing can reach git by mistake), sub-folder `conversations`; a window with no folder uses `globalStorageUri/no-folder/conversations`. The chosen model is remembered in the workspace state (`assistantCabinetCoder.panelModel`).
   - **How much in P0a**: everything: the last conversation comes back after a reload, **New**, the **History** list to reopen one, and **Delete** after a confirmation.
   - **The rules change**: `AGENTS.md` and `docs/SESSION/COMMON-RULES.md` now say that the panel's conversations are the one thing the extension writes, on the user's machine, and that the log and error messages still hold no content. No telemetry, the key only in the secret store, nothing sent to another host: unchanged.
   - **The guard**: `test/guards.test.ts` forbade any file-writing call in `src/`. With the owner's permission it has one named exception, `src/store.ts`, and `test/panel-guards.test.ts` and `test/store.test.ts` prove that this module is the only writer and writes only inside the folder it is given (a checked id, never a path from outside).

Also decided that day: the vendored `docs/IDE-CONTRACT.md` was copied again from the server's `develop` (commit `c6b5f51`, server decision D-100: a client that closes the request ends it at every stage, the slot freed at once), because the baseline of P0a was red on the contract guard (284 of 285, lesson 7); after the copy the baseline was 285 of 285. And the panel's sentence after a stop **before the first word** is neutral (the owner's choice): it says that an older server may finish reading the request before it takes the next one, because whether the Mac's installed server already has D-100 is for the human test to show.

## D-028 Choices of the agent within Lot P0a

23 November 2026.

- **Modules.** Besides the five the lot named (`protocol`, `render`, `conversation`, `chat`, `panel`), the saved conversations and the testable page needed four more, one job each: `history` (the file format, pure, strict when reading back), `store` (the only writer: atomic writes, an index that is only a cache), `session` (the panel's logic against an injected host, tested without the editor) and `page` (the HTML and its Content Security Policy, pure apart from the nonce, so the policy is tested).
- **Files on disk.** One JSON file per conversation, `<id>.json` (id: the time in base 36 and eight random hexadecimal digits), and `index.json` (titles and dates). A write goes to a temporary file, is flushed to the disk, then renamed over the old file; writes to one file are queued in the order they were asked for. The index is rebuilt from the files whenever it disagrees with them. Folder `0700`, files `0600`. A file that cannot be read is never rewritten or removed; it is listed without a title. A format number (1) lets a later version change the format; a newer file is reported unreadable, not damaged.
- **When it saves.** When a message is sent (the answer to come is saved as open), every 2 seconds while words arrive, and when the answer ends. An answer still open when the file is read again was cut off by a closed window and is shown as interrupted. Opening or deleting a conversation first waits for the saves already on their way (found by the tests, lesson 24).
- **The webview holds nothing.** It has no sentence of its own (every label comes from `messages.ts`), keeps no state (no `setState`, no storage), and is redrawn from the extension when it is shown again. The text being typed is kept by the extension in memory only and put back in the input when the view is redrawn; it is never saved.
- **While a request is open** the model, **New**, **History** entries and **Delete** are disabled; the input stays usable for the next message.
- **The log** gained `first_ms` (the time to the first event of the answer, for the human test's time to the first word), `call=webview dropped=1` (a message from the webview that was not valid) and `call=store detail=<Node error code>` (a failed disk operation): numbers and codes only.
- **The stub** gained the scenario `markup` (headings, lists, code blocks and hostile markup, sent in pieces of seven characters that cut through the markers).
- **The model list** is read when the panel is first shown and whenever the status bar refreshes (a changed address, key or authority): one line in `extension.ts`'s `refreshStatus` besides the registration.

## D-029 The panel's look follows the usual coding-assistant panels

23 November 2026, after Part 1 of the human test of Lot P0a, at the owner's request ("as close as possible to the Claude Code extension", with VS Code's own focus colours). The behaviour measured by the run is unchanged; only the layout and the words on screen changed.

- **Header:** the open conversation's title on the left; on the right two icons, a plus (new conversation) and a clock (saved conversations, which becomes an arrow back while the list is shown). The owner validated keeping these at the top.
- **Composer:** one rounded frame whose border takes the focus colour; inside it the input, which starts on **one line** and grows with its text up to 40 % of the panel's height; a thin line; then the **model list** on the left and the send button on the right, an **arrow up**, a **square** while a request is open.
- **Icons rather than words** on every button (fewer texts to translate, a sober panel). Each icon keeps its label as tooltip and `aria-label`, for the mouse and for screen readers. The six icons are drawn for this extension as plain SVG paths in `page.ts`, inside a hidden element the script copies: no icon font or package (no new dependency), no file, no address, and the stylesheet still has no `url(`.
- **The phase** (**Reading the request** or **Answering**, with its seconds) is drawn inside the answer that is coming, with a pulsing dot, where the eyes are; the owner had not noticed it on the line above the input during Part 3.
- **Fewer sentences:** the explanation shown in an empty conversation and the one above the saved conversations are gone (the README says where conversations are kept); the labels **You** and the model's name above each turn are gone too: the user's messages sit in a framed box, the answers are plain text, and the model's name is the answer's tooltip. The input's placeholder is **Ask the model**.
- **The model list at start:** when the webview opens while the panel's own refresh is on its way, it waits for that one instead of starting another. The visual check showed that this was not the cause of the three `call=models` lines at the same moment seen in the run: they are the status bar's check, the panel's list and the editor-chat provider's list, three readers asking at start. That stays as it is in 0.3.0 (a few milliseconds on the loopback, and the provider is frozen by D-026); sharing one answer between the status bar and the panel is left to Lot P0b.

## D-030 Choices of the agent within Lot P0b

23 November 2026, the design of the lot file applied as written; what it left open, and where the code or the existing guards decided, is recorded here.

- **Modules.** `agent` (the loop, types only imported, so `messages` can name `MAX_STEPS` = 12 without a cycle), `tools` (the system prompt, the four definitions, every text the model reads, the argument check and the runners) and `workspace` (the safety rules and the read-only file system). All three are pure apart from `workspace.nodeWorkspaceFs`.
- **Reading the streamed calls in `chat`, not with `convert.ResponseReader`.** The lot asked to reuse the provider's reader. Two facts prevented it: the existing guard of `test/panel-guards.test.ts` forbids `chat.ts` to import `./convert` (the provider is frozen), and `ResponseReader` throws on malformed arguments, which the lot wants returned to the model as a result. So `chat` joins the pieces by index itself (`ToolCallCollector`, about thirty lines), and `tools` reuses `convert.parseArguments` to parse them.
- **The editor side of the tools lives in `extension.ts`** (`editorWorkspace`: trust, folders, the read-only file system, the diff view through a `TextDocumentContentProvider`, `WorkspaceEdit`). The existing guard forbids `panel.ts` to name the workspace folders or `workspace.fs` (it protects the store's folder), and only `extension.ts` and `panel.ts` may import the editor; `extension` builds the object and `panel` passes it to `session`.
- **Accept** applies the change only when the document has no unsaved change and its text is still the one the proposal was computed from (otherwise the model reads why and nothing is touched); `WorkspaceEdit` replaces the passage (or `createFile` creates a missing file), the document is saved, so that the next read sees it, and shown, so that **Undo** is one key away. The diff view (`vscode.diff`, the file on the left, a read-only virtual document on the right) opens by itself when a change is proposed and closes after the decision. **Stop** while a change waits rejects it (nothing applied); a click on Accept already applying finishes first.
- **The tools are offered** only when the window is trusted, a folder on the disk is open and the chosen model reports tool calling (`capabilities.tools`); otherwise the request is exactly P0a's plain chat (no system prompt, no tools) and a line above the input says why. Relative paths are resolved against the first workspace folder; an absolute path inside any folder is accepted.
- **Limits.** `read_file` 400 lines and 40 000 characters per call, a file over 1 000 000 bytes or with a NUL byte or invalid UTF-8 refused; `list_files` 200 entries, `.git` and `node_modules` skipped; `search_text` 50 lines, 2000 files, case ignored unless the query holds a capital letter, symbolic links not followed. A missing path outside the folders gets the same refusal as an existing one.
- **The saved format 2** adds `steps` (the text before each step's calls, the calls with their arguments, result, status and note) and `stepLimit` to an answer; format 1 is still read; the index keeps its own format 1 (`INDEX_FORMAT`), because an existing test pins that the index refuses format 2. The steps of earlier answers are sent again with the next message, so the model knows what it already read.
- **The log.** Each chat line of the loop carries `step=` and, when the answer held calls, `tool_calls=` and `tools=` (the four names, `other` for any other); each tool call gets one line `call=tool` with `tool=`, `outcome=` (`done`, `failed`, `accepted`, `rejected`, `stopped`) and `reason=` (a closed list). Arguments, paths, results and names a model invents never reach it.
- **Icons.** The eight new icons (read, list, search, edit, tool, accept, reject, diff) are drawn in a second hidden element, `#tool-icons` (`page.TOOL_ICONS`), not added to `page.ICONS`: the existing test pins the six icons of `#icons`.
- **The model list is shared** between the status bar and the panel: `refreshStatus` sends one request and hands the same promise to `session.refreshModels`. The frozen provider still asks for its own list.
- **The stub** gained `agent-steps`, `agent-edit`, `agent-loop` (option `loopStepMs`) and `agent-bad-args`, whose markers may name a path with slashes.

## D-031 The owner's verdict after Lot P0b, and the choice of the code models

23 November 2026, after the human test of Lot P0b (run record of `docs/human-tests/P0b-panel-agent.md`). The measures: a task's first request is 585 to 679 prompt tokens (against 21 597 for the editor's Agent request); `gpt-oss:20b` did the three tasks right with every tool call valid, in 1.8 to 12.3 seconds of model time; `qwen2.5-coder:14b` wrote every tool call as plain text and never called a tool.

1. **The panel: Go with changes.** The next lot (P1) finishes it: the defects seen in the run (Markdown tables not drawn, the target `.` of **List** mistaken for the separator, an answer in another language than the message), the copy button on code blocks, and what the server's D-101 makes possible (see D-032).
2. **The provider in the editor's chat is removed** in Lot P1, with its modules, tests, manifest contribution and documentation (decision D-026 had frozen it until this verdict).
3. **The plain-text tool calls** (`qwen2.5-coder`) are first seen with the server: its Lot 46 studies them with the P0b measures; the extension does not parse a call written as text before that answer. Meanwhile `gpt-oss` is the model advised for the agent.
4. **The order of the next lots:** P1 (finishing the panel), then documents and images, then the server's agent catalogue, then the release.
5. **The code models are chosen, not all offered** (the owner's principle): the product proposes a short range of code models that were tested and tuned through the panel, from small to medium to very large, so that a developer picks one that fits their machine; it does not expose the whole catalogue of the server. A model enters the range only after it passed the panel's three tasks (read, search, edit with approval) with valid tool calls; `qwen2.5-coder:14b` does not pass today. The measures of the range are done with the server project (its Lot 46 and after) and recorded on both sides.

## D-032 The server's D-101 is recorded, and the two projects coordinate through handoff files

23 November 2026. The server built what the extension asked the same day (server D-101, Lot 45, `develop` at `969d047`): the guard's ratio `IDE_OVERFLOW_CHARS_PER_TOKEN` (default 2, the tools' JSON counted, now written in the contract), `features.stop_at_every_stage` (always `true`) and `data[].max_context_window` in `GET /ide/v1/models`; `ide_api` stays 1 and no error code is added. They reach a machine only with the server's packages of its Lot 46 (Mac 0.1.14, Windows MSI 0.1.36), which also carry D-100. Until then the extension treats a missing flag as "not known" and a missing field as `null`.

- The vendored `docs/IDE-CONTRACT.md` was copied from the server's `develop` (checked identical with `cmp`; the contract guard passes, 474 tests), in a commit of its own (lesson 7).
- **Coordination (the owner's wish: few server packages, each with as much as possible, and the owner kept informed):** each project writes what the other needs in a tracked handoff file of its own and reads the other's read-only: the server in its `docs/handoffs/CODER-EXTENSION.md`, the extension in `docs/handoffs/SERVER.md` (new). Every extension lot that needs something from the server says so there before the server plans its next package, so that one package per platform carries everything; the owner carries a one-line message between the two chats.
