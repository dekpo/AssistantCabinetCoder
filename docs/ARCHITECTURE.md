# Architecture (completed lot by lot)

Status after Lot X1a: the connection layer exists and is tested; the chat provider (`convert`, `provider`), the tools and the agents come in the next lots. The throw-away probe in `spike/` is still in the tree and is deleted at the end of Lot X1b.

All sources are in `src/`, one job per module, zero runtime dependencies (only `node:` built-ins and the `vscode` types). Machine codes cross module boundaries; sentences exist only in `messages.ts`.

## Modules

| Module      | Job                                                                                                                                                                                                                                                                             | Pure?                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `codes`     | The closed list of machine codes (the contract's envelope codes plus the extension's own), `CabinetError` (its `message` is the code, never text) and the envelope-to-code mapping.                                                                                             | yes                                 |
| `platform`  | **The only module that names operating-system folders**: where `server.env` and `ca.pem` live on Windows and macOS. Platform and environment are arguments. A new platform is an added branch here.                                                                             | yes                                 |
| `discovery` | Turns the settings (and, if allowed, the text of the local `server.env`) into a target: URL, authority file, source. Parses `KEY=VALUE` tolerantly. Reads only `server.env`. `readTextFile` is the one function that touches the disk (read only, size capped).                 | yes, except `readTextFile`          |
| `transport` | `node:http` / `node:https`. One keep-alive agent per server address (bounded to 8), no redirect followed, JSON bodies capped, streams not, no byte for N seconds is a timeout, cancellation through an `AbortSignal`, the authority file re-read and validated at each request. | no (network, authority file read)   |
| `sse`       | Incremental parser of the event stream: split lines, comments, `[DONE]`, error events and invalid JSON as typed errors that never hold the payload.                                                                                                                             | yes                                 |
| `client`    | Typed calls `GET /health` and `GET /ide/v1/models`, the status-to-code mapping (`failureFromResponse`), `ide_api` check, `checkConnection` for Test Connection, `stateFromCode` for the status bar. The chat call is Lot X1b's.                                                 | no (uses `transport`)               |
| `log`       | One content-free line per call from a closed list of fields; a value of the wrong shape is dropped.                                                                                                                                                                             | yes                                 |
| `keys`      | The API key in the editor's secret store, one per server address. `SecretStore` has the shape of `vscode.SecretStorage`.                                                                                                                                                        | yes (the store is an argument)      |
| `messages`  | Every sentence the user can read, one per machine code, plus the Test Connection report text.                                                                                                                                                                                   | yes                                 |
| `extension` | The thin VS Code adapter: registers the six commands, the status bar item and the output channel, reads the settings, wires the modules. No logic of its own.                                                                                                                   | no (needs VS Code; walked by owner) |

Planned for the next lots: `convert`, `provider` (X1b), `tools` (X2a, X2b), `agents` (X3).

## Data flow of one connection check (Test Connection, or the status bar at start-up)

1. `extension` reads the four machine-scoped settings and calls `discoverServer` (`discovery`, which asks `platform` for the folder when nothing is configured). The outcome is a target (`url`, `caFile`) or a reason why none was found (`messages` turns the reason into a sentence).
2. `keys.readKey` fetches the key for that URL from the secret store.
3. `client.checkConnection` calls `transport.open` for `GET /health`, then for `GET /ide/v1/models`. `transport` builds the headers (`Authorization` only when a key is set), loads and validates the authority file for HTTPS, applies the timeout and the cancellation signal, and returns the reply or throws a `CabinetError` (`unreachable`, `certificate_untrusted`, `timeout`, `cancelled`, a CA-file code).
4. A non-2xx reply goes through `failureFromResponse` (404 on `/ide/` is `ide_surface_off`, 401 is `key_needed`, otherwise the envelope's code, then the status). A 2xx body of the model list goes through `parseModels` (`ide_api` must be 1, unknown fields are ignored, a missing `features` is fine).
5. Each call reports `{call, status, durationMs, code}` to `log`, which writes the line to the output channel.
6. `messages.formatReport` builds the dialog text; `client.stateFromCode` picks the status-bar label.

## The stub gateway

`test/stub-gateway/stub.ts` is a plain `node:http(s)` server that speaks `/health` and `/ide/v1` with scripted answers: three models (tools and vision; tools only; neither), a text stream, a tool call (whole call in one chunk), an in-stream error event, an HTTP error, a slow first byte, a split stream (three bytes at a time, so a multi-byte character is cut), and modes `version-mismatch` (`ide_api: 2`), `off` (404), `key-needed` (401), `oversize` (a body above the cap) and `redirect`. A chat request picks its script with the body field `stub_scenario` (the contract says unknown fields are ignored). `npm run stub` starts it for demonstrations (`--mode`, `--port`, `--key`, `--https FOLDER`). `test/support/pki.ts` builds a throw-away certificate authority with `node:crypto` only, for the HTTPS tests and the demo.

## Tests

Run on the compiled output with Node's built-in runner (`npm test`); none needs VS Code or the outside network. Besides the unit tests of every module there are guard tests in `test/guards.test.ts` and `test/manifest.test.ts`: language (no French diacritics outside one named fixture), no-leak (a unique secret in the key, a message, a tool argument, a tool result, an image payload and a file name never appears in an error, a log line or a report), no-network and no-risk (imports limited to an allow-list, no URL literal outside documentation links, no process spawning, no `eval`, no file writing, no `console`, no disabled certificate check), drift (the README names every command and setting), contract (`docs/IDE-CONTRACT.md` equals the server's copy when it is next to this repository) and the manifest (identifiers, machine scope of every setting, no `*` activation, no runtime dependency, exact dev versions).

## Where to add a feature

- **A new server call:** a function in `client` using `transport.open`; map its failures with `failureFromResponse`; add its sentences to `messages` (a new code goes in `codes` first, and the type system then demands a sentence); extend the stub additively; add `CallName` to `log` if it is a new kind of call.
- **A new platform:** a branch in `platform.ts` and its tests; nothing else names a folder.
- **A new setting or command:** `package.json`, then the README (the drift test fails until both agree), then the adapter.
- **Anything that shows text to the user:** `messages.ts` only.
- **Anything that writes to the log:** add the field to `CallRecord` and to `formatCallLine`, with a shape check.

The data flow of one chat request is written by Lot X1b.
