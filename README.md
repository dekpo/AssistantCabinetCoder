# Assistant Cabinet Coder

A VS Code extension that gives the editor's chat the models of an **Assistant Cabinet server** running on your own network. Nothing is sent anywhere else: no telemetry, no other host, no cloud account.

**Status: version 0.2.0, the models are in the chat.** The server's models appear in the chat's model picker, under the provider **Assistant Cabinet Coder**, and work in **Ask**, **Agent** and **Plan** (Session Target **Local**), with tool calls and pasted images. The tools of the next releases (`cabinet_view_image`, `cabinet_read_document`) and the synced agent files are not in this version.

## What it needs

- VS Code 1.140.0 or newer (built and tested with 1.143.1), with the folder **trusted**: in Restricted Mode VS Code disables the whole chat and the extension's models (the commands stay usable).
- No GitHub sign-in and no Copilot plan: a model brought by an extension works signed out (measured).
- An Assistant Cabinet server whose administrator has run `cabinet-server config set IDE_ENABLED=on` and `cabinet-server restart` (server Lot 15b or newer). Without it the extension says so and offers no model.
- A key, when the server asks for one (the **Set API Key** command).
- Models that report **tool calling**: every chat mode sends tools, and VS Code does not list a model without it. **Test Connection** and the model's tooltip say which models are affected. For Agent and Plan, a context window of **32768 tokens or more** is needed (the request alone starts with 15000 to 19000 characters of instructions).

## What it does

- Finds your server: the address you set, or, on the machine where the server is installed, the address in the server's settings file.
- Talks to it over HTTP, or over HTTPS with the authority file (`ca.pem`) the administrator gave you, with an API key when the server asks for one.
- Lists the server's models in the chat picker (the tooltip gives the window, the output ceiling, tool calling and vision), refreshes the list when the address, the key or the authority changes, and keeps the last good list when the server does not answer.
- Sends each chat request to the server and streams the answer back, including tool calls: the editor runs the tool (reading, editing, searching, the terminal) with your approvals and sends the result on.
- **Test Connection** says in plain words whether the server is reachable, whether it has turned on the editor surface, and which models it offers.
- Shows the connection in the status bar and keeps a log of **codes, durations and counts only**.

## The three agents

| Agent | What it does with the server's model                                                                                                | What it needs                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Ask   | Answers questions about your code. VS Code still offers it some read-only tools, so tool calling is required here too.              | A model that reports tool calling.                                                                                     |
| Agent | Works on your files: reads, searches, edits, runs commands and tests, asking for your approval as VS Code does.                     | Tool calling, and a window of 32768 tokens or more. Quality depends on the model: small models do not do well at this. |
| Plan  | Starts with `/plan` or from the agents menu, researches and writes a plan, then offers to hand it to Agent (**Proceed from Plan**). | The same as Agent.                                                                                                     |

Images: paste or attach a picture only with a model that reports **vision**; the extension refuses it before sending otherwise. Text files, selections and PDFs reach the model as the editor's own text; the content of a PDF is not sent (a later release adds a tool for documents).

## Install

Build the package, then install it from the file (no marketplace is involved):

```bash
npm ci
npm run package
```

In VS Code open the Extensions view, choose the `...` menu, then **Install from VSIX...** and pick `assistant-cabinet-coder-0.2.0.vsix`. Then open the chat, click the model name, pick the tab **Assistant Cabinet Coder** and choose a model.

On the computer that runs the server nothing needs to be typed except the key, when the server demands one. From another computer, set `assistantCabinetCoder.serverUrl`.

## Commands

All commands are in the Command Palette under the category **Assistant Cabinet Coder**.

| Command id                             | Title           | What it does                                                                                                   |
| -------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| `assistantCabinetCoder.manage`         | Manage          | A menu of the five commands below. The status bar item opens it; it is also the provider's management command. |
| `assistantCabinetCoder.setKey`         | Set API Key     | Asks for the key (hidden as you type) and keeps it in VS Code's secret storage, one per server address.        |
| `assistantCabinetCoder.clearKey`       | Clear API Key   | Removes the key of the current server from the secret storage.                                                 |
| `assistantCabinetCoder.selectCaFile`   | Select CA File  | Picks the public authority file. It refuses a file that is not a certificate or that contains a private key.   |
| `assistantCabinetCoder.testConnection` | Test Connection | Calls `GET /health`, then `GET /ide/v1/models`, and shows the result or what to do.                            |
| `assistantCabinetCoder.showOutput`     | Show Output     | Opens the log. Each line holds time, call, status, duration and a machine code. Never text, never a key.       |

## Settings

All settings are **machine-scoped**: a repository's `.vscode/settings.json` cannot point your key at another host.

| Setting                                       | Default | Meaning                                                                                                                                                      |
| --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assistantCabinetCoder.serverUrl`             | empty   | Address of the server, for example `http://192.168.1.83:8090`. Empty: use the server installed on this computer, if any.                                     |
| `assistantCabinetCoder.caFile`                | empty   | The public authority file for HTTPS. Empty: for a server installed on this computer, its own `ca.pem`; otherwise the authorities your system already trusts. |
| `assistantCabinetCoder.autoDiscover`          | `true`  | Read the settings file (`server.env`, which holds no secret) of a server installed on this computer to find its address.                                     |
| `assistantCabinetCoder.requestTimeoutSeconds` | `900`   | How long to wait with no byte received before a request is abandoned. A long prompt delays the first byte, so the default is generous.                       |

## Privacy and security

- No telemetry. The only network calls go to the server you configured.
- No code, message, file, image, file name, tool argument or tool result is written anywhere, including the log and error messages.
- The API key lives only in VS Code's secret storage and is never printed.
- The extension changes only its own settings and never disables another extension.
- VS Code itself has telemetry settings (`telemetry.telemetryLevel` and four others): review them in VS Code; this extension does not change them.
- **Plain HTTP.** An Assistant Cabinet server speaks plain HTTP unless its administrator turned HTTPS on, and the tower runs with no authentication. Once the editor surface is on, anyone who can reach the server's port can use it, and your source code crosses the network in clear text. On any shared network, ask the administrator for HTTPS (then use **Select CA File** with the `ca.pem` file) and for a key.

## Known limits

- **No inline completion** (the grey suggestions while you type), and **no semantic search**: VS Code needs a Copilot plan for both.
- **Tool calling is required.** A model that does not report it is not offered in the chat, in any mode. Test Connection tells you which models are affected.
- **The quality of Agent and Plan depends on the model**, and on a window of 32768 tokens or more. A small model may loop, call tools badly or lose the thread.
- **`tool_choice` is not enforced.** VS Code can ask a model to call a tool; the server accepts the request and ignores it, because the model engine cannot force a call.
- **Images are replayed in every request.** The editor sends the whole history each time, pictures included, and the server limits the number and size of images per request (default 8 images, 8 MiB each). When it refuses, the message says the request is too large: start a new chat.
- **Remote windows are untested.** The extension runs on the machine where VS Code's window is (`extensionKind` is `ui`), so the key and the local network stay there. SSH and WSL windows have not been tried.
- **macOS is untested** until a Mac is available. Discovery uses the folder the server's macOS layout names; on Linux there is no discovery, set `assistantCabinetCoder.serverUrl`.
- The extension is built and tested with VS Code 1.143.1; the declared minimum is 1.140.0.
- For Copilot Business or Enterprise accounts, the GitHub administrator can disable models brought by extensions.

## Development

```bash
npm ci
npm test          # builds, then runs the tests with Node's built-in runner
npm run lint
npm run format
npm run stub      # a stub gateway for demonstrations, see below
```

The modules, their jobs, the data flow of one chat request and where to add a feature are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The server's contract is [docs/IDE-CONTRACT.md](docs/IDE-CONTRACT.md); it is copied from the server project and never edited here.

`npm run stub -- --mode ok` starts a stub of the server on port 8099. Modes: `ok`, `version-mismatch`, `off`, `key-needed`, `oversize`, `redirect`. Add `--key SECRET` to require a bearer key, `--https FOLDER` to speak HTTPS with a throw-away authority (its public file is written to `FOLDER/ca.pem`), and `--port N` to change the port.

In the chat, start a message with a marker to choose what the stub answers: `[stub:text]` (the default), `[stub:tool-call]` (calls one of the tools the chat offers, then closes; `[stub:tool-call:create_file]` names the tool), `[stub:long]` (about a minute of text, to try the stop button), `[stub:cut]` (the server drops the connection mid-answer), `[stub:error]`, `[stub:error-http]`, `[stub:empty]`, `[stub:slow]`, `[stub:split]`. The stub's models are `cabinet-chat` (tools), `cabinet-code` (tools and vision) and `cabinet-plain` (neither).
