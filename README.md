# Assistant Cabinet Coder

A VS Code extension that brings the models of an **Assistant Cabinet server** running on your own network into VS Code: in a chat panel of its own, and in the editor's chat. Nothing is sent anywhere else: no telemetry, no other host, no cloud account.

**Status: version 0.3.0, the extension's own chat panel.** The panel **Assistant Cabinet Coder** (in the right side bar) is a plain chat with the server's models: a request is sent once, **Stop** closes it at once, and conversations are saved on this computer and come back after a reload. It does not read or change your files yet; that comes with the next release (see **The chat panel**). The server's models are still offered in the editor's chat as in 0.2.3, under the provider **Assistant Cabinet Coder**, in **Ask**, **Agent** and **Plan**; that part is no longer developed (see **Known limits** for its limits on VS Code 1.147.0).

## What it needs

- VS Code 1.140.0 or newer (built and tested with 1.143.1), with the folder **trusted**: in Restricted Mode VS Code disables the whole chat and the extension's models (the commands stay usable).
- No GitHub sign-in and no Copilot plan: a model brought by an extension works signed out (measured).
- An Assistant Cabinet server whose administrator has run `cabinet config set IDE_ENABLED=on` and `cabinet restart` (on macOS both are run with `sudo`). Without it the extension says so and offers no model.
- On the computer that runs the server, a server that always listens on `127.0.0.1` (server Lot 27 or newer: the macOS package 0.1.11 and the Windows installer 0.1.28 or newer have it). An older server listens only on its network address, which discovery no longer uses: set `assistantCabinetCoder.serverUrl` for it.
- A key, when the server asks for one (the **Set API Key** command).
- Models that report **tool calling**: every chat mode sends tools. VS Code 1.143.1 does not list a model without it; 1.147.0 lists it. **Test Connection** says which models are affected. For Agent and Plan, VS Code 1.143.1 needs a context window of **32768 tokens or more** (the request alone starts with 15000 to 19000 characters of instructions); on VS Code 1.147.0 the request starts with about 100000 characters of instructions and tool definitions (59 tools in Agent, 61 in Plan), so a 32768-token model just fits and 65536 tokens or more is comfortable (see **Known limits**).

## What it does

- Finds your server: the address you set, or, on the machine where the server is installed, the address in the server's settings file.
- Talks to it over HTTP, or over HTTPS with the authority file (`ca.pem`) the administrator gave you, with an API key when the server asks for one.
- Lists the server's models in the chat picker (VS Code 1.143.1 shows a tooltip with the window, the output ceiling, tool calling and vision; 1.147.0 shows only the context size), refreshes the list when the address, the key or the authority changes, and keeps the last good list when the server does not answer.
- Sends each chat request to the server and streams the answer back, including tool calls: the editor runs the tool (reading, editing, searching, the terminal) with your approvals and sends the result on.
- **Test Connection** says in plain words whether the server is reachable, whether it has turned on the editor surface, and which models it offers.
- Shows the connection in the status bar and keeps a log of **codes, durations and counts only**.

## The chat panel

**Open it** with the icon **Assistant Cabinet Coder** (a speech bubble with angle brackets). The extension places it in VS Code's **secondary side bar**, on the right of the window; show that side bar with **View > Appearance > Secondary Side Bar** if it is hidden. If your VS Code shows the icon in the left activity bar instead, drag it to the right side bar; VS Code remembers where you put it.

What it does:

- **A plain chat** with one of the server's models, chosen in the list at the top (the list is read again when the address, the key or the authority changes; the last choice is remembered for the workspace). **Enter** sends, **Shift+Enter** starts a new line.
- **One request at a time, sent once.** While a request is open the panel says **Reading the request** (no word has arrived: the server waits for a free place or the model reads the conversation) or **Answering**, with the seconds since the message was sent. A failure is shown once under the answer, with the same sentences as **Test Connection**; nothing is ever sent again behind your back.
- **Stop closes the request at once.** The words already received stay, marked **Stopped.** A stop before the first word says that an older server may finish reading the request before it takes the next one, so the next message may wait a moment (servers with the stop of every stage, decision D-100 of the server project, free their place at once).
- **Conversations are saved** on this computer, in the private storage VS Code gives the extension for the workspace (outside your project folder, so they cannot end up in git). They come back after **Developer: Reload Window** or a restart of VS Code. **New** starts another one; **History** lists them, newest first, to open one again or **Delete** it (after a confirmation; a deleted conversation cannot be restored). An answer cut off by a closed window is shown as interrupted. A saved file that cannot be read is left untouched and the panel says so.
- The model's text is shown with its headings, lists, code blocks with their language, inline code, bold and italic. Anything that looks like HTML is shown as text, and links are plain text.

What it does not do yet: it reads no file and changes nothing in the workspace, has no tools and no system prompt, takes no pictures, and has no copy button on code blocks (select the text instead). The next release adds a few workspace tools, with your approval before any change.

## The three agents

| Agent | What it does with the server's model                                                                                                                                   | What it needs                                                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ask   | Answers questions about your code. VS Code still offers it some read-only tools, so tool calling is required here too.                                                 | A model that reports tool calling.                                                                                                                                       |
| Agent | Works on your files: reads, searches, edits, runs commands and tests, asking for your approval as VS Code does.                                                        | Tool calling, and a window of 32768 tokens or more (65536 or more is comfortable on VS Code 1.147.0). Quality depends on the model: small models do not do well at this. |
| Plan  | Starts with `/plan` or from the agents menu, researches and writes a plan, then offers to hand it to Agent (**Proceed from Plan**; VS Code 1.147.0 shows no such row). | The same as Agent.                                                                                                                                                       |

Images: paste or attach a picture only with a model that reports **vision**; the extension refuses it before sending otherwise. Text files, selections and PDFs reach the model as the editor's own text; the content of a PDF is not sent (a later release adds a tool for documents).

## Install

Build the package, then install it from the file (no marketplace is involved):

```bash
npm ci
npm run package
```

In VS Code open the Extensions view, choose the `...` menu, then **Install from VSIX...** and pick `assistant-cabinet-coder-0.3.0.vsix`. Then open the panel **Assistant Cabinet Coder** in the right side bar (see **The chat panel**); in the editor's chat, click the model name, pick the tab **Assistant Cabinet Coder** and choose a model.

On the computer that runs the server nothing needs to be typed except the key, when the server demands one: the extension reads the server's settings file and uses `http://127.0.0.1:<port>`, which the server always opens in plain HTTP, even when HTTPS is on for the network and even when the network address changes or the cable is unplugged. Only a server set to listen on all addresses (`0.0.0.0`) with HTTPS on is reached over HTTPS, on the first name of its certificate, with its own `ca.pem`. From another computer, set `assistantCabinetCoder.serverUrl`.

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

| Setting                                       | Default | Meaning                                                                                                                                                                                                   |
| --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assistantCabinetCoder.serverUrl`             | empty   | Address of the server, for example `http://192.168.1.83:8090`. Empty: use the server installed on this computer, if any.                                                                                  |
| `assistantCabinetCoder.caFile`                | empty   | The public authority file, used for an HTTPS address only. Empty: for a server installed on this computer and reached over HTTPS, its own `ca.pem`; otherwise the authorities your system already trusts. |
| `assistantCabinetCoder.autoDiscover`          | `true`  | Read the settings file (`server.env`, which holds no secret) of a server installed on this computer to find its address.                                                                                  |
| `assistantCabinetCoder.requestTimeoutSeconds` | `900`   | How long to wait with no byte received before a request is abandoned. A long prompt delays the first byte, so the default is generous.                                                                    |

## Privacy and security

- No telemetry. The only network calls go to the server you configured.
- **The chat panel saves its conversations** (your messages and the model's answers) on this computer, in VS Code's private storage for the workspace, readable by your user account only, so that they survive a reload. That is the only thing the extension writes. Delete a conversation with **History > Delete**.
- Nothing else is written anywhere: no code, message, file, image, file name, tool argument or tool result reaches the log or an error message. The log holds codes, durations and counts only.
- The API key lives only in VS Code's secret storage and is never printed.
- The extension changes only its own settings and never disables another extension.
- VS Code itself has telemetry settings (`telemetry.telemetryLevel` and four others): review them in VS Code; this extension does not change them.
- **Plain HTTP.** An Assistant Cabinet server speaks plain HTTP unless its administrator turned HTTPS on, and the tower runs with no authentication. Once the editor surface is on, anyone who can reach the server's port can use it, and your source code crosses the network in clear text. On any shared network, ask the administrator for HTTPS (then use **Select CA File** with the `ca.pem` file) and for a key.

## Known limits

- **No inline completion** (the grey suggestions while you type), and **no semantic search**: VS Code needs a Copilot plan for both.
- **Tool calling is required.** Every mode sends tools. VS Code 1.143.1 does not offer a model without tool calling; 1.147.0 lists it. Test Connection tells you which models are affected.
- **The quality of Agent and Plan depends on the model**, and on a window of 32768 tokens or more. A small model may loop, call tools badly or lose the thread.
- **On VS Code 1.147.0 a 32768-token model just fits Agent and Plan.** The editor refuses a turn at once ("static system messages and tool definitions exceed this model's context budget") when the input budget the extension reports is below its own count of the instructions and tool definitions; it counts them itself and does not ask the extension. Measured with the stub: 24576 input tokens refused, 28672 accepted. The extension keeps an eighth of the window for the answer (at least 2048 tokens, never more than the output ceiling), so a 32768-token model gets 28672 input tokens. Two consequences: the model has only a few thousand tokens left for its answer, and more tools (an MCP server, another extension) can bring the refusal back; untick the tools you do not need in the chat's tool settings (**Configure Tools** on VS Code 1.143.1). For real coding work give the code models a window of 65536 tokens or more on the server (`cabinet models context`), which needs a model whose own maximum is that large.
- **The chat panel's placement is measured on VS Code 1.147.0 only**; older versions may not know the right side bar for extensions and are untested.
- **In the editor's chat, the stop button does not cancel the request on VS Code 1.147.0** (measured in Ask, Agent and Plan, on the first and the second message of a chat; the chat panel's **Stop** does close the request). The answer stops on screen, but the editor does not tell the extension, so the server keeps producing the whole answer and keeps its editor slot busy (one at a time by default). **After a stop, wait for the answer to end before you send again on a shared server**: a long answer of a large model can take minutes.
- **VS Code 1.147.0 retries every failed request five times** (about 15 seconds), whatever the extension reports, and shows "Failed to get response from the AI model; retried 5 times ... Last error: 502" before the extension's sentence. When the server refuses a request for a reason that sending it again cannot fix (the conversation is too long, the request is too large, a wrong key, a model the server does not offer or allow, a capability the model lacks, a malformed request, a timeout), the extension remembers that refusal for 30 seconds, in memory only, and answers the identical retries itself: the server receives the request once. A busy or unreachable server and a rate limit are still retried. When the conversation is too long, the sentence gives the server's estimate and the model's window; the estimate is the server's rough count (about two characters per token), not the model's real count.
- **No picture can be attached on VS Code 1.147.0** without a GitHub sign-in: the chat pastes the file's name, and the **+** button says it could not attach it.
- **Some messages are the editor's own on VS Code 1.147.0.** A dropped answer shows "Response interrupted: the model stopped before finishing"; after a wrong key the server's models leave the picker and the editor offers its own sign-in. The status bar and **Test Connection** say what is wrong.
- **`tool_choice` is not enforced.** VS Code can ask a model to call a tool; the server accepts the request and ignores it, because the model engine cannot force a call.
- **Images are replayed in every request.** The editor sends the whole history each time, pictures included, and the server limits the number and size of images per request (default 8 images, 8 MiB each). When it refuses, the message says the request is too large: start a new chat.
- **Remote windows are untested.** The extension runs on the machine where VS Code's window is (`extensionKind` is `ui`), so the key and the local network stay there. SSH and WSL windows have not been tried.
- **macOS: one run so far** (VS Code 1.147.0, 19 November 2026): discovery, the chat, a key, HTTPS and the turned-off surface work; pictures, cancellation and an Agent turn with a real model are untested on macOS. Discovery uses the folder the server's macOS layout names; on Linux there is no discovery, set `assistantCabinetCoder.serverUrl`.
- The extension is built and tested with VS Code 1.143.1 and has been run on 1.147.0; the declared minimum is 1.140.0.
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

`npm run stub -- --mode ok` starts a stub of the server on port 8099. Modes: `ok`, `version-mismatch`, `off`, `key-needed`, `oversize`, `redirect`, `small-model` (like `ok`, plus the model `cabinet-small`). Add `--key SECRET` to require a bearer key, `--https FOLDER` to speak HTTPS with a throw-away authority (its public file is written to `FOLDER/ca.pem`), and `--port N` to change the port.

In the chat, start a message with a marker to choose what the stub answers: `[stub:text]` (the default), `[stub:tool-call]` (calls one of the tools the chat offers, then closes; `[stub:tool-call:create_file]` names the tool), `[stub:long]` (about a minute of text, to try the stop button), `[stub:markup]` (headings, lists, code blocks and hostile markup that must show as text), `[stub:cut]` (the server drops the connection mid-answer), `[stub:error]`, `[stub:error-http]`, `[stub:empty]`, `[stub:slow]`, `[stub:split]`, and `[stub:refuse:CODE]` (the server's refusal of that error code with its status, for example `[stub:refuse:server_busy]`; `context_too_large` carries the guard's numbers). `npm run stub` prints one line per chat request and per answer's end (a number, the scenario, the model, the count of tools, the duration), never a message. The stub's models are `cabinet-chat` (tools), `cabinet-code` (tools and vision) and `cabinet-plain` (neither); mode `small-model` adds `cabinet-small` (window 32768, output ceiling 16384, tools, no vision), the shape of a server's 32768-token code models.
