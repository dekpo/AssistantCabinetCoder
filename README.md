# Assistant Cabinet Coder

A VS Code extension that gives the editor's chat the models of an **Assistant Cabinet server** running on your own network. Nothing is sent anywhere else: no telemetry, no other host, no cloud account.

**Status: version 0.1.0, foundations only.** This version finds the server, talks to it safely and tells you what it offers. The chat provider itself arrives in the next release; until then the extension adds no model to the chat.

## What it does today

- Finds your server: the address you set, or, on the machine where the server is installed, the address in the server's settings file.
- Talks to it over HTTP, or over HTTPS with the authority file (`ca.pem`) the administrator gave you, with an API key when the server asks for one.
- **Test Connection** says in plain words whether the server is reachable, whether it has turned on the editor surface, and which models it offers (context window, output limit, tool calling, vision).
- Shows the connection in the status bar and keeps a log of **codes, durations and counts only**.

## Install

Build the package, then install it from the file (no marketplace is involved):

```bash
npm ci
npm run package
```

In VS Code open the Extensions view, choose the `...` menu, then **Install from VSIX...** and pick `assistant-cabinet-coder-0.1.0.vsix`. The folder you work in must be **trusted**: in Restricted Mode VS Code disables the whole chat and the extension's models (the commands stay usable).

## Commands

All commands are in the Command Palette under the category **Assistant Cabinet Coder**.

| Command id                             | Title           | What it does                                                                                                 |
| -------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `assistantCabinetCoder.manage`         | Manage          | A menu of the five commands below. The status bar item opens it.                                             |
| `assistantCabinetCoder.setKey`         | Set API Key     | Asks for the key (hidden as you type) and keeps it in VS Code's secret storage, one per server address.      |
| `assistantCabinetCoder.clearKey`       | Clear API Key   | Removes the key of the current server from the secret storage.                                               |
| `assistantCabinetCoder.selectCaFile`   | Select CA File  | Picks the public authority file. It refuses a file that is not a certificate or that contains a private key. |
| `assistantCabinetCoder.testConnection` | Test Connection | Calls `GET /health`, then `GET /ide/v1/models`, and shows the result or what to do.                          |
| `assistantCabinetCoder.showOutput`     | Show Output     | Opens the log. Each line holds time, call, status, duration and a machine code. Never text, never a key.     |

## Settings

All settings are **machine-scoped**: a repository's `.vscode/settings.json` cannot point your key at another host.

| Setting                                       | Default | Meaning                                                                                                                                                      |
| --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assistantCabinetCoder.serverUrl`             | empty   | Address of the server, for example `http://192.168.1.83:8090`. Empty: use the server installed on this computer, if any.                                     |
| `assistantCabinetCoder.caFile`                | empty   | The public authority file for HTTPS. Empty: for a server installed on this computer, its own `ca.pem`; otherwise the authorities your system already trusts. |
| `assistantCabinetCoder.autoDiscover`          | `true`  | Read the settings file (`server.env`, which holds no secret) of a server installed on this computer to find its address.                                     |
| `assistantCabinetCoder.requestTimeoutSeconds` | `900`   | How long to wait with no byte received before a request is abandoned. A long prompt delays the first byte, so the default is generous.                       |

## Privacy

- No telemetry. The only network calls go to the server you configured.
- No code, message, file, image, file name, tool argument or tool result is written anywhere, including the log and error messages.
- The API key lives only in VS Code's secret storage and is never printed.
- The extension changes only its own settings and never disables another extension.
- VS Code itself has telemetry settings (`telemetry.telemetryLevel` and four others): review them in VS Code; this extension does not change them.

## Known limits

- **Tool calling is required.** The spike measured that VS Code 1.143.1 does not offer a model that lacks tool calling in the chat picker, in any mode. Test Connection tells you which models are affected.
- **Remote windows are untested.** The extension runs on the machine where VS Code's window is (`extensionKind` is `ui`), so the key and the local network stay there. SSH and WSL windows have not been tried.
- **macOS is untested** until a Mac is available. Discovery uses the folder the server's macOS layout names; on Linux there is no discovery, set `assistantCabinetCoder.serverUrl`.
- The extension is built and tested with VS Code 1.143.1; the declared minimum is 1.140.0.

## Development

```bash
npm ci
npm test          # builds, then runs the tests with Node's built-in runner
npm run lint
npm run format
npm run stub      # a stub gateway for demonstrations, see below
```

The modules, their jobs and the data flow are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The server's contract is [docs/IDE-CONTRACT.md](docs/IDE-CONTRACT.md); it is copied from the server project and never edited here.

`npm run stub -- --mode ok` starts a stub of the server on port 8099. Modes: `ok`, `version-mismatch`, `off`, `key-needed`, `oversize`, `redirect`. Add `--key SECRET` to require a bearer key, `--https FOLDER` to speak HTTPS with a throw-away authority (its public file is written to `FOLDER/ca.pem`), and `--port N` to change the port.
