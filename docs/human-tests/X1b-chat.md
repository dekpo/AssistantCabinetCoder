# Human test X1b and X1c: the models in the chat, on the Mac (about 45 minutes)

This test proves what Lot X1b added and what Lot X1c corrected: the server's models appear in the chat model picker, **Ask**, **Agent** and **Plan** answer with them (tool calls included), a pasted image reaches a model with vision, the stop button works, a server that stops mid-answer is reported, a wrong key and a turned-off surface are explained, a chat works over HTTPS, and, with no address typed anywhere, the extension finds **the Mac's own server on `http://127.0.0.1:1975`** (the loopback rule of Lot X1c, decision D-018). It runs against the **stub gateway** (`npm run stub`, a fake server on this Mac) and then against **the Mac's own server** (package 0.1.11).

Follows `docs/HUMAN-TESTS-PROTOCOL.md` and the lessons of `docs/LESSONS.md` (1, 2, 5 and 6). Every command is a Terminal (zsh) command on the Mac. Expectations marked **(not yet seen)** come from the agent's runs against a fake VS Code, the stub and the real server, not from your screen: the point of this test is to replace them with what you see. Where an on-screen label differs from the one written here, write the label you really see in brackets. The names of the chat's buttons were seen in the X0 run on Windows with VS Code 1.143.1 (the mode button reads **Agent**, the model button reads the model's name, **Local** is at the bottom left of the chat box); this Mac has VS Code **1.146.0**, so a label may have moved: where it differs, describe the position instead.

## How this test is built

- **A separate VS Code profile**, as in X0 and X1a: its own data folder and extensions folder, so it starts signed out of GitHub and **cannot change your real settings or extensions**. A hash of your real user settings file is taken before and after. The profile's settings file is written in advance with the stub's address.
- **The `code` command is not on this Mac's PATH.** Every command uses its full path, `"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"` (checked on 18 November 2026: it exists and prints `1.146.0`).
- **Two Terminal windows.** Window 1 runs the stub and stays busy (Ctrl+C to change its mode). Window 2 is for the other commands. The agent may run the commands of window 2 for you; the stub too.
- **The stub chooses its answer from a marker you type at the start of your message**, because the real chat sends no scenario field: `[stub:text]` (a short answer), `[stub:tool-call]` (calls one of the tools the chat offers, then closes), `[stub:tool-call:create_file]` (the same, with the tool that creates a file), `[stub:long]` (about a minute of text), `[stub:cut]` (the connection is dropped mid-answer). Type the marker exactly, with the square brackets, then a space and any words.
- **Your normal VS Code already holds version 0.2.0** of the extension (installed on 6 November 2026 for the icon test). This test does not touch it; the clean-up checks that 0.2.1 never reached it.
- **Left out on purpose, because X1a's run already proved it:** the dialogs of **Test Connection** other than the one of Part 5, the key input box, the certificate dialog's wrong-file refusal, and the status bar states other than the ones named below. Also left out: remote windows and a PDF (a later lot).
- **What this test cannot tell you:** whether a real model's answers are good. The stub's words are fixed. The quality of Agent and Plan depends on the model; the code models of the Mac have a window of 32768 tokens, the minimum Agent and Plan need, so a weak or slow answer is a finding about the model, not about the extension, unless a message names a code.

## Part 0: prepare (about 4 minutes)

**Terminal: Terminal (zsh), window 2.**

**You start with:** every VS Code test window closed (your normal window may stay open), the repository on branch `feat/x1c-server-catch-up`.
**You leave with:** the package built, four test folders, a picture and a note in the test workspace, a hash of your real settings noted.

No VS Code update may be waiting (lesson 1). In your normal VS Code window open the menu **Code > Check for Updates...** and write what it says. If it offers **Restart to Update** (or another label that installs an update), do that first, wait until VS Code is back, then go on.

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --version
```

Expected: three lines (version, commit, architecture). On 18 November 2026: `1.146.0`, then `69047191...`, then `arm64`.

Proof that your real settings are untouched (the "before"). Note the line it prints:

```bash
shasum -a 256 "/Users/ydekpo/Library/Application Support/Code/User/settings.json"
```

Expected: a hash and the file name. On 18 November 2026 it began with `90df2fbc`.

Build the package:

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run package
```

Expected: ends with `DONE  Packaged: ...assistant-cabinet-coder-0.2.1.vsix (19 files, ...)`.

Port 8099 (the stub's) must be free:

```bash
lsof -nP -iTCP:8099 -sTCP:LISTEN
```

Expected: no output.

Create the folders:

```bash
mkdir -p /Users/ydekpo/x1b-test-workspace /Users/ydekpo/x1b-vscode-data/User /Users/ydekpo/x1b-vscode-ext /Users/ydekpo/x1b-ca
```

A small note and a one-pixel picture for the workspace (the picture is written from its base64 text, so nothing is downloaded):

```bash
printf 'line one\nline two\n' > /Users/ydekpo/x1b-test-workspace/notes.txt
```

```bash
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > /Users/ydekpo/x1b-test-workspace/pic.png
```

```bash
wc -c /Users/ydekpo/x1b-test-workspace/pic.png
```

Expected: `70` and the file name.

The test profile's settings, with the stub's address:

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "http://127.0.0.1:8099"\n}\n' > /Users/ydekpo/x1b-vscode-data/User/settings.json
```

**Paste back:** what **Check for Updates...** said, and the outputs of `--version`, `shasum` and `wc -c`.

## Part 1: start the stub, open the test window, install (about 5 minutes)

**Terminal: Terminal (zsh), window 1** for the stub, **window 2** for the test window; the other steps are clicks in the test window.

**You start with:** Part 0 done.
**You leave with:** the stub running, the extension installed in the test window, the status bar reading connected.

Start the stub (window 1; it stays busy):

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --port 8099
```

Expected in window 1: `Stub gateway listening on http://127.0.0.1:8099 (mode: ok).`

Open the test window (window 2; a second VS Code opens, with its own icon in the Dock, and looks like a first start; not yet seen on this Mac):

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --user-data-dir /Users/ydekpo/x1b-vscode-data --extensions-dir /Users/ydekpo/x1b-vscode-ext /Users/ydekpo/x1b-test-workspace
```

In that window, in this order:

1. The welcome dialog offers **Continue without Signing In**: click it (never a sign-in button), then close the welcome page. Refuse any offer to set up Copilot or to turn on settings sync.
2. The folder opens in **Restricted Mode**. Click **Manage** in the grey banner (or the **Restricted Mode** button at the bottom left), then **Trust Workspace**. If macOS asks whether VS Code may access a folder, answer **Allow** and write that it asked.
3. **Make sure this is the test window (lesson 2).** Its title contains `x1b-test-workspace`. Open the Extensions view (Cmd+Shift+X). In the test window the list of installed extensions is **empty**. If you see your own extensions, you are in your normal window: go back to the window that opened from the command above.
4. In the Extensions view click the **...** at the top right (**Views and More Actions...**), then **Install from VSIX...**, pick `/Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder/assistant-cabinet-coder-0.2.1.vsix` (in the file dialog, Cmd+Shift+G lets you type the folder), click **Install**. Write down whether VS Code asks for a reload and what you did.
5. Look at the right side of the status bar. Expected: **Cabinet: connected** within a few seconds (if you see nothing, run **Assistant Cabinet Coder: Test Connection** from the Command Palette, Cmd+Shift+P, once and look again).

**Paste back:** your answers to steps 2, 4 and 5.

## Part 2: the picker, Ask, Agent and Plan with the stub (about 8 minutes)

**Terminal: Terminal (zsh), window 2** for the one check; everything else is clicks and typing in the test window.

**You start with:** Part 1 done, the stub running.
**You leave with:** one observation per mode, and a file created by the Agent step (or the tool's refusal).

1. Open the chat view (the chat with the text field that reads **Build with Agent**, or the label you see). Under the text field, click the model button (the one that shows a model name). **Send me one screenshot of what opens.** Expected (not yet seen): a tab named **Assistant Cabinet Coder** next to a **GitHub Copilot** tab that asks to sign in; under ours, **cabinet-chat** and **cabinet-code**, and **not** `cabinet-plain` (it reports no tool calling, and the X0 run showed that VS Code lists no such model, in any mode). Hover **cabinet-code**: expected the tooltip lines `Context window: 131072 tokens.`, `Output ceiling: 16384 tokens.`, `Tool calling: yes. Image input: yes.` Write down where, if anywhere, you can reach a **Manage** entry for the provider and what it opens (expected: the menu of the extension with five entries; **not yet seen**).
2. Pick **cabinet-code**. Make sure the mode button reads **Ask** (click it and choose **Ask** if not) and that the bottom left of the chat box says **Local**. Type this and send it:

   `[stub:text] hello`

   Expected: the answer **Hello from the stub, cafe.** (in the real answer the last letter of the last word carries an accent) appears in one go, with no error.

3. Switch the mode to **Agent**. Send:

   `[stub:tool-call] read notes.txt`

   Expected (not yet seen): the chat shows a tool step (a file-reading tool called by the stub, which picks the first tool whose name contains `read_file` and gives it the smallest valid arguments, so the file it reads may not exist), then the closing answer **Closing answer from the stub.** If VS Code asks you to allow the tool, allow it and write that it asked. Write the name of the tool shown in the step.

4. Still in **Agent**, send:

   `[stub:tool-call:create_file] make a file`

   Expected (not yet seen): a tool step that creates a file (name shown in the step); VS Code may ask to allow it, allow it; then **Closing answer from the stub.** The stub gives the tool the smallest valid arguments, so the file is called `stub` and holds the word `stub`, **or** the tool refuses the arguments (for example because the path is not absolute) and the chat still ends with the closing answer. Write which one happened. Then (window 2):

   ```bash
   cat /Users/ydekpo/x1b-test-workspace/stub
   ```

   Expected: `stub`, or "No such file or directory" if the tool refused.

5. Switch the mode to **Plan** (the mode menu lists **Agent**, **Ask**, **Plan**; if **Plan** is not there, type `/plan` in the text field instead). Send:

   `[stub:text] outline the change`

   Expected: **Hello from the stub, cafe.** and, under it, a **Proceed from Plan** row (as seen in X0). Write what you see.

**Paste back:** your answers to steps 1 to 5, the tool names of steps 3 and 4, and the output of `cat`.

## Part 3: an image, the stop button, a dropped connection (about 7 minutes)

**Terminal: none**; everything is in the test window.

**You start with:** Part 2 done, the stub running, **cabinet-code** selected.
**You leave with:** what an image does with and without vision, the stop button's effect in the log, and the "answer stopped" message.

1. Start a **new chat** (the **+** at the top of the chat view; if you see another label, write it), mode **Ask**, model **cabinet-code**. In the Explorer select `pic.png`, press Cmd+C, click in the chat box and press Cmd+V (not yet seen on the Mac; if no picture appears, drag `pic.png` from the Explorer into the chat box instead, and write which way worked). Type and send:

   `[stub:text] what is in the picture?`

   Expected (not yet seen): **Hello from the stub, cafe.** with no error. Write whether the picture showed in your message.

2. Start another **new chat**, choose the model **cabinet-chat** (it reports no vision), and add `pic.png` the same way. Write **what happens**, exactly: either VS Code refuses or ignores the picture on its own, or it is attached; then type and send `[stub:text] look`. Expected (not yet seen) if it was attached: the message **This model cannot read images, so the request was not sent...** (ours), and no answer.

3. Start a **new chat**, model **cabinet-code**, mode **Ask**. Send:

   `[stub:long] go`

   Words appear one after the other (`word0 word1 ...`, about four a second). After about five seconds click the **stop button** (it replaces the send button while an answer is coming; if you see another label, write it). Expected: the words stop at once and no error is shown. Write how many seconds it took the words to stop.

4. Send:

   `[stub:cut] go`

   Expected (not yet seen): the word **Partial** appears and then the message **The server's answer stopped before it was complete.**

5. Open the Command Palette (Cmd+Shift+P), run **Assistant Cabinet Coder: Show Output**. Click in the text, Cmd+A, Cmd+C, and paste the lines into the chat with me. Expected: one line per call, like `2026-11-18T... call=chat status=200 ms=12 alias=cabinet-code prompt_tokens=... completion_tokens=... tool_calls=0`; the stopped answer shows `code=cancelled`, the dropped one `code=stream_truncated`, the refused picture (if it was sent) `code=provider_capability_unsupported`. **No sentence of yours, no word of an answer, no file name, no address, no key.** Tell me if any line holds anything else.

**Paste back:** your answers to steps 1 to 4 and the pasted output lines.

## Part 4: a key, the surface turned off, HTTPS (about 8 minutes)

**Terminal: Terminal (zsh), window 1** for the stub, **window 2** for the settings; then clicks.

**You start with:** Part 3 done, window 1 busy with the stub.
**You leave with:** the picker after a missing key, a given key and a wrong key; after the surface is turned off; and a chat over HTTPS.

### 4a. A key is needed, then given, then wrong

Ctrl+C in window 1, then:

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --key letmein-123 --port 8099
```

1. Wait a few seconds. Expected: the status bar reads **Cabinet: key needed** (if it still reads connected, run **Assistant Cabinet Coder: Test Connection** once). Open the model button of the chat again. Expected (not yet seen): no model under **Assistant Cabinet Coder**, and possibly a message offering **Set API Key**. Write what you see.
2. Run **Assistant Cabinet Coder: Set API Key** from the Command Palette, type `letmein-123`, press Enter. Expected: **The API key was saved in the secret store.**, the status bar changes to **Cabinet: connected**, and the models come back in the picker **without a reload**. Write whether they did, and how long it took.
3. In a new chat with **cabinet-code**, send `[stub:text] hi`. Expected: **Hello from the stub, cafe.**
4. Run **Set API Key** again with a wrong key, `wrong-key-999`. Send `[stub:text] hi` in the same chat. Expected (not yet seen): the message beginning **The server needs a valid API key.** in the chat, and the status bar going to **Cabinet: key needed**.

### 4b. The surface is turned off

Ctrl+C in window 1, then:

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode off --port 8099
```

Wait a few seconds. Expected: status bar **Cabinet: off** (or after one **Test Connection**). Open the model button: expected (not yet seen) that no model is listed under **Assistant Cabinet Coder** (it may take the 60 seconds of the cache, or the next change of a setting: write how long it took). Send `[stub:text] hi` in the old chat: expected the message **The server has not turned on the editor surface. Ask the administrator to run: cabinet config set IDE_ENABLED=on, then cabinet restart.**

### 4c. A chat over HTTPS

Ctrl+C in window 1, then:

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --port 8099 --https /Users/ydekpo/x1b-ca
```

Expected in window 1: `Stub gateway listening on https://127.0.0.1:8099 (mode: ok).` and `Authority file written to: /Users/ydekpo/x1b-ca/ca.pem`.

Point the test profile at the HTTPS address (window 2; VS Code reads the change by itself):

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "https://127.0.0.1:8099"\n}\n' > /Users/ydekpo/x1b-vscode-data/User/settings.json
```

1. Expected: status bar **Cabinet: certificate**. Run **Assistant Cabinet Coder: Select CA File**, pick `/Users/ydekpo/x1b-ca/ca.pem` (the dialog lists `.pem`, `.crt` and `.cer` files; Cmd+Shift+G lets you type the folder). Expected: **The authority file was set.** and the status bar **Cabinet: connected**.
2. In a new chat with **cabinet-code**, send `[stub:text] hi over https`. Expected: **Hello from the stub, cafe.**

Ctrl+C in window 1.

**Paste back:** your answers to 4a steps 1 to 4, to 4b, and to 4c steps 1 and 2.

## Part 5: the Mac's own server, found with no address (about 10 minutes)

**Terminal: Terminal (zsh), window 2** for the first two commands; then clicks.

**You start with:** Part 4 done, the stub stopped, and **the editor surface of the Mac's server on** (`IDE_ENABLED=on`, turned on by you with `sudo` before this part; the agent checks it with the command below).
**You leave with:** the proof that the extension found `http://127.0.0.1:1975` by itself, the Mac's models in the picker, one Ask turn and one Agent turn answered by a real model.

**Before you start, about the desktop application:** the server is shared with it. A code model loaded for this part can push out the model the desktop application uses (the Mac keeps at most two models loaded), so its next answer may be slow; and an answer of the desktop application running at the same time as this part makes both slower. Choose a moment when you do not need the desktop application.

The surface is on (the agent runs this):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1975/ide/v1/models
```

Expected: `200`. A `404` means the surface is still off: stop here.

Remove every address from the test profile, so that only discovery can find the server (VS Code reads the change by itself):

```bash
printf '{}\n' > /Users/ydekpo/x1b-vscode-data/User/settings.json
```

1. **The loopback rule.** Run **Assistant Cabinet Coder: Test Connection**. Expected (not yet seen, from the code of the report and the server's real answer of 18 November 2026): a dialog headed **Connected: 21 models available**, whose text begins `Server: http://127.0.0.1:1975` (**not** `192.168.75.1`), then `Health check: the server answered.`, `Editor interface version: 1`, `Features: agents yes, document analysis no, image description no`, `Models (21):` and one line per model, for example `- qwen2.5-coder:14b: window 32768 tokens, output up to 16384 tokens, tools yes, vision no`. No `Note:` line (every model reports tool calling). Write the first line and the headline you see. The status bar reads **Cabinet: connected**.
2. Open the model button. Expected (not yet seen): under **Assistant Cabinet Coder** the Mac's models, among them **qwen2.5-coder:7b** and **qwen2.5-coder:14b** (the picker may list fewer than 21 if VS Code hides some: write how many you see, no screenshot needed). Hover **qwen2.5-coder:14b**: expected `Context window: 32768 tokens.`, `Output ceiling: 16384 tokens.`, `Tool calling: yes. Image input: no.`
3. A new chat, model **qwen2.5-coder:14b** (or the one you prefer, then write which), mode **Ask**. Send `say hello in three words`. Write whether an answer arrived and roughly how many seconds it took (the first answer loads the model and is slower).
4. Same model, mode **Agent**. Send `create a file named hello.txt in this folder that contains the word hello`. Allow the tool when VS Code asks. Write what it did (tool steps, approvals, errors). Then (window 2):

   ```bash
   cat /Users/ydekpo/x1b-test-workspace/hello.txt
   ```

   Expected: `hello` (or "No such file or directory" if the model did not manage it: then it is a finding about the model, unless a message names a code).

5. Look at the status bar: write its label.

**Paste back:** your answers to steps 1 to 5 and the output of `cat`.

## Part 6: uninstall and clean up (about 3 minutes)

**Terminal: Terminal (zsh), window 2** for the commands; steps 1 and 2 are clicks.

**You start with:** Part 5 done.
**You leave with:** nothing left behind, and the proof that your real profile never saw version 0.2.1.

1. In the test window, Extensions view, click **Assistant Cabinet Coder**, then **Uninstall**. Write whether VS Code asks for a reload.
2. **Quit the test VS Code completely**: with the test window in front, menu **Code > Quit Visual Studio Code** (Cmd+Q). This quits only the test instance; your normal window stays open. Wait ten seconds; the second VS Code icon has left the Dock. **Every check below must run after this** (lesson 6), and no check is run after a deletion started.

The key must not be in any file of the test profile (VS Code keeps it in its encrypted secret storage):

```bash
grep -rl "letmein-123" /Users/ydekpo/x1b-vscode-data /Users/ydekpo/x1b-vscode-ext
```

Expected: no output. If it prints a file name, write the name (not the content): that is a finding.

The wrong key must not be there either:

```bash
grep -rl "wrong-key-999" /Users/ydekpo/x1b-vscode-data /Users/ydekpo/x1b-vscode-ext
```

Expected: no output.

Version 0.2.1 never reached your normal profile (lesson 2):

```bash
ls /Users/ydekpo/.vscode/extensions | grep -i cabinet
```

Expected: one line, `assistantcabinet.assistant-cabinet-coder-0.2.0` (installed on 6 November 2026 for the icon test), and no line for `0.2.1`.

The extensions folder of the test profile holds no copy any more:

```bash
ls /Users/ydekpo/x1b-vscode-ext
```

Expected: no `assistantcabinet.assistant-cabinet-coder-...` folder (only VS Code's own bookkeeping file, if any).

The proof that your real settings are untouched (the "after"; the hash must equal the one of Part 0):

```bash
shasum -a 256 "/Users/ydekpo/Library/Application Support/Code/User/settings.json"
```

Only now delete the four test folders (they hold only test data):

```bash
rm -rf /Users/ydekpo/x1b-test-workspace /Users/ydekpo/x1b-vscode-data /Users/ydekpo/x1b-vscode-ext /Users/ydekpo/x1b-ca
```

Expected: no output.

**Paste back:** the outputs of the five checking commands.

## What was walked without VS Code, and what only you can walk

Walked by the agent (Lot X1b, 28 October 2026, on Windows): the compiled extension against a fake `vscode` module and the stub (activation and the provider's registration under the vendor, six concurrent calls for the model list answered with one request, an Ask turn, a tool-call turn with its closing answer, an image turn, the refusal of an image for a model without vision, a cancelled turn that closed the connection, token counts, the change event after a settings change, and the log lines, which held no text); the conversion, the stream reader, the token calibration and every error code are unit tests.

Walked by the agent (Lot X1c, 18 November 2026, on this Mac): the `.vsix` builds (19 files, 46.67 KB); the compiled discovery, run against a copy of the Mac's real `server.env` (`SERVER_BIND_ADDRESS=192.168.75.1`, `SERVER_PORT=1975`, `AUTH_MODE=off`), returns `http://127.0.0.1:1975` with no authority file and reads only `server.env`; on that target `GET /health` answered `200` and `GET /ide/v1/models` answered `200` with `ide_api` 1, 21 models (all with tool calling; `qwen2.5-coder:7b` and `qwen2.5-coder:14b` with a window of 32768 and a ceiling of 16384), and the features agents yes, document analysis no, image description no.

Only you can walk: everything in the VS Code window (the picker and its tabs, the tooltips, the modes, the tool steps and their approvals, the pasted picture, the stop button, the messages in the chat, the status bar after each change, the file dialog, the Test Connection dialog on the Mac's server), the real shape of the editor's own messages on 1.146.0, and the answers of a real model. Not walked by anyone: remote windows, a PDF, Windows with this version.

## Run record

To be appended by the agent after your run (date and VS Code version, what matched, what deviated, what was not shown).
