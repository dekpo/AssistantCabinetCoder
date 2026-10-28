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
- **Model information:** `id`, `name` and `family` are the alias, `version` is `"1"`, `detail` is `Assistant Cabinet Coder`, `maxOutputTokens` is the ceiling, `maxInputTokens` is the window minus the ceiling (at least 1). A server that does not report a window or a ceiling gets 8192 and 2048 tokens, and the tooltip says "assumed". Every model the server lists is listed, even without tool calling (the tooltip says VS Code will not offer it), in the server's order.
- **A stream that stops:** a connection that drops after the answer started is `stream_truncated`, not `unreachable`.
- **Token estimate:** `ceil(characters / ratio)` over text, tool-call names and arguments and tool-result text, plus 1024 per image; the ratio starts at 3.0 (so the estimate errs high), is corrected per model from `usage.prompt_tokens` with a moving average of weight 0.3, clamped to 2.0 and 6.0, in a table of at most 32 models. It never uses the network.
- **Host:** the provider is written against a `Host` interface (resolve the connection, show a message, log, fire the change event) and reports plain parts; `extension.ts` supplies the `Host` and builds the editor's classes, so everything but the adapter is tested without VS Code.

## D-017 Small changes to existing files, forced by the lot's own rules

28 October 2026, decided by the agent in Lot X1b and reported to the owner. (1) `src/messages.ts` is "additions only", but its Test Connection note said "(measured by the spike)" and the lot requires that no file outside the frozen records mentions the removed probe: the words became "(measured on that version)"; the test of that note matches the sentence before the brackets and still passes. (2) In `test/manifest.test.ts`, besides the two named edits (the version, the assertion that the provider contribution is absent), the title of that test said "no provider contribution yet" and was changed to "no tool or agent contribution yet", because the title would be false. (3) The new test helpers are in new files (`test/support/editor.ts`, `fake-host.ts`, `fake-server.ts`); the existing support files are unchanged.
