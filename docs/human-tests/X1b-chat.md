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

No VS Code update may be waiting (lesson 1). On this Mac a waiting update shows as a blue **Update** button at the top right of the title bar (seen on 18 November 2026 with 1.146.0). If you see it, click it, let VS Code restart, and go on once it is back; otherwise open the menu **Code > Check for Updates...** and write what it says.

**Do not install the package in your normal VS Code window:** Part 1 installs it in the test window only.

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

1. Open the chat view (the chat with the text field that reads **Build with Agent**, or the label you see). Under the text field, click the model button (the one that shows a model name). **Send me one screenshot of what opens.** Seen on 1.147.0 (18 November 2026): a list headed **Assistant Cabinet Coder** with a **+** beside it and no GitHub Copilot tab; **cabinet-chat** `33K`, **cabinet-code** and **cabinet-plain** (unlike X0 on 1.143.1, where a model without tool calling was not listed); a **>** at the right of each model. Hovering showed no tooltip. Click the **>** beside **cabinet-code** and write what opens. Seen on 1.147.0: a panel headed **cabinet-code** with the note "Changing these options mid-session resets the prompt cache and may increase cost." and one row, **Max context** `131K`; the tooltip lines of the extension (`Context window: ...`, `Tool calling: ...`) appear nowhere, so 1.147.0 does not show them. A **Manage** entry for the provider was not looked for in this run.
2. Pick **cabinet-code**. Make sure the mode button reads **Ask** (click it and choose **Ask** if not) (on 1.147.0 there is no **Local** label: the row under the chat box reads **Copilot**, then **Interactive** and **Manual permissions**). Type this and send it:

   `[stub:text] hello`

   Expected: the answer **Hello from the stub, cafe.** (in the real answer the last letter of the last word carries an accent) appears in one go, with no error.

3. Switch the mode to **Agent**. Send:

   `[stub:tool-call] read notes.txt`

   The stub calls the first tool whose name contains `read_file`, otherwise the first tool of the request, with the smallest valid arguments. Seen on 1.147.0: no tool named like `read_file` was offered, so the stub called a terminal tool with the command `stub`; VS Code showed **Run in terminal: stub** with **Allow Once**, **Skip** and **Explain**; after **Allow Once** the step read `/bin/bash: stub: command not found` (harmless), then **Closing answer from the stub.**

4. Still in **Agent**, send:

   `[stub:tool-call:create_file] make a file`

   Seen on 1.147.0: no tool named `create_file` was offered either, so the stub fell back to the same terminal tool (**Run in terminal: stub**, **Allow Once**, `command not found`), then **Closing answer from the stub.**, with `Assistant Cabinet Coder/cabinet-code` under the answer. The real tool names of 1.147.0 are not measured by this test. Then (window 2):

   ```bash
   cat /Users/ydekpo/x1b-test-workspace/stub
   ```

   Expected on 1.147.0: "No such file or directory" (no file tool was called).

5. Choose **Plan**. On 1.147.0 it is not in the mode button: it replaces **Interactive** in the row under the chat box (that row read **Plan** after the owner chose it). Send:

   `[stub:text] outline the change`

   Expected: **Hello from the stub, cafe.** Seen on 1.147.0: that answer, and no **Proceed from Plan** row (the X0 run on 1.143.1 showed one).

6. Pick **cabinet-plain** (the stub model without tool calling), leave the mode on **Agent**, and send:

   `[stub:text] hi`

   Seen on 1.147.0: the picker showed `8K` beside the name and the answer **Hello from the stub, cafe.** came with no error, so 1.147.0 lets a model without tool calling run in Agent mode.

**Paste back:** your answers to steps 1 to 6, the tool names of steps 3 and 4, and the output of `cat`.

## Part 3: an image, the stop button, a dropped connection (about 7 minutes)

**Terminal: none**; everything is in the test window.

**You start with:** Part 2 done, the stub running, **cabinet-code** selected.
**You leave with:** what an image does with and without vision, the stop button's effect in the log, and the "answer stopped" message.

1. Start a **new chat** (the **+** at the top of the chat view; if you see another label, write it), mode **Ask**, model **cabinet-code**. In the Explorer select `pic.png`, press Cmd+C, click in the chat box and press Cmd+V (not yet seen on the Mac; if no picture appears, drag `pic.png` from the Explorer into the chat box instead, and write which way worked). Type and send:

   `[stub:text] what is in the picture?`

   Expected (not yet seen): **Hello from the stub, cafe.** with no error. Write whether the picture showed in your message.

   Seen on 1.147.0 (19 November 2026): Cmd+C on `pic.png` in the Explorer then Cmd+V put the text `pic.png` in the chat box, not a picture; dragging did the same; the **+** button answered **Could not attach pic.png.** The turn was sent with the path as text and answered **Hello from the stub, cafe.**, so no picture reached the provider. Repeated with a picture in the clipboard (a screen capture with Cmd+Ctrl+Shift+4 of a small harmless area, then Cmd+V): nothing happened in the chat box, although the extension reports image input for **cabinet-code** (the stub says vision yes). So on 1.147.0, signed out, no way of putting a picture in the chat was found, and the image path of the extension is not shown on this version (it stays covered by the unit tests and by the X0 run on 1.143.1).

2. Start another **new chat**, choose the model **cabinet-chat** (it reports no vision), and add `pic.png` the same way. Write **what happens**, exactly: either VS Code refuses or ignores the picture on its own, or it is attached; then type and send `[stub:text] look`. Expected (not yet seen) if it was attached: the message **This model cannot read images, so the request was not sent...** (ours), and no answer. Seen on 1.147.0: the same as step 1 (the path as text, no picture), answered **Hello from the stub, cafe.**; the refusal was not reached.

3. Start a **new chat**, model **cabinet-code**, mode **Ask**. Send:

   `[stub:long] go`

   Words appear one after the other (`word0 word1 ...`, about four a second). After about five seconds click the **stop button** (it replaces the send button while an answer is coming; if you see another label, write it). Expected: the words stop at once and no error is shown. Write how many seconds it took the words to stop.

   Seen on 1.147.0: the words stopped on screen at `word212` with no error, but the log line read `call=chat status=200 ms=60256 alias=cabinet-code tool_calls=0`: the full sixty seconds of the stub (240 words at 250 ms), with no `code=cancelled`, so the request was not cancelled on the extension's side. Repeated with the stop button clicked at `word20`: the screen stopped at `word21`, and the log line read `ms=60254` with no `code=cancelled` again. So on 1.147.0 the stop button stops the display only: the editor does not cancel the request it gave the extension, and the server goes on producing the whole answer. The extension's own side (the editor's cancellation closes the connection and logs `code=cancelled`) was walked by the agent in Lot X1b with a stand-in editor. Look at the duration in the log, not at the screen.

4. Send:

   `[stub:cut] go`

   Expected (not yet seen): the word **Partial** appears and then the message **The server's answer stopped before it was complete.**

   Seen on 1.147.0: **Partial**, then the editor's own sentence in italics, **Response interrupted: the model stopped before finishing. Try again.**, in place of ours; the log line read `code=stream_truncated`, so the extension reported the right code and the editor chose its own wording.

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

   Seen on 1.147.0 (19 November 2026), the stub started by the agent: **Test Connection** opened the dialog **The server is reachable but not ready** (Server: `http://127.0.0.1:8099`; Health check: the server answered; The server needs a valid API key...) with **Cancel** and **Set API Key**; the status bar read **Cabinet: key needed**; the log read `call=models status=401 code=key_needed`. The picker still listed the three models under **Pinned** (the editor kept the earlier list).

2. Run **Assistant Cabinet Coder: Set API Key** from the Command Palette, type `letmein-123`, press Enter. Expected: **The API key was saved in the secret store.**, the status bar changes to **Cabinet: connected**, and the models come back in the picker **without a reload**. Write whether they did, and how long it took.

   Seen on 1.147.0: the **Set API Key** button of that dialog opened the same masked input ("API key for this server"); after Enter, **The API key was saved in the secret store.**, the status bar **Cabinet: connected**, and the models were in the picker at once, with no reload (log: two `call=models status=200`).

3. In a new chat with **cabinet-code**, send `[stub:text] hi`. Expected: **Hello from the stub, cafe.**
4. Run **Set API Key** again with a wrong key, `wrong-key-999`. Send `[stub:text] hi` in the same chat. Expected (not yet seen): the message beginning **The server needs a valid API key.** in the chat, and the status bar going to **Cabinet: key needed**.

   Seen on 1.147.0: after the wrong key was saved, the status bar went to **Cabinet: key needed** and the cabinet models left the picker at once (the model button read **Models**, under the editor's box **Choose how you want to use Copilot.** with **Add Models** and **Sign In**). Sending the message then opened the editor's **Sign in to use GitHub Copilot** window (closed with its **X**, no sign-in). No chat request reached the extension, so our sentence was not shown: the status bar and the **Test Connection** dialog are the only places that name the key.

### 4b. The surface is turned off

Ctrl+C in window 1, then:

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode off --port 8099
```

Wait a few seconds. Expected: status bar **Cabinet: off** (or after one **Test Connection**). Open the model button: expected (not yet seen) that no model is listed under **Assistant Cabinet Coder** (it may take the 60 seconds of the cache, or the next change of a setting: write how long it took). Send `[stub:text] hi` in the old chat: expected the message **The server has not turned on the editor surface. Ask the administrator to run: cabinet config set IDE_ENABLED=on, then cabinet restart.**

Seen on 1.147.0 (19 November 2026), the stub started by the agent: **Test Connection** opened **The server is reachable but not ready** with `Server: http://127.0.0.1:8099`, `Health check: the server answered.` and the sentence above word for word (the new `cabinet` wording of Lot X1c), with **OK**; the status bar read **Cabinet: off**; the picker held no cabinet model (only the **GitHub Copilot** tab with **Sign in to see available models.**), so nothing was sent (lesson 14). The chat still showed the editor's line **Authentication is required to start a session. Please sign in and try again.** under the message of Part 4a step 4.

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

Seen on 1.147.0 (19 November 2026), the stub and the settings file set by the agent: the status bar read **Cabinet: certificate**; **Test Connection** opened **Cannot reach the server** (`Server: https://127.0.0.1:8099`, `Health check: failed.`, the sentence about the untrusted certificate, `Technical detail: UNABLE_TO_VERIFY_LEAF_SIGNATURE`) with **Cancel** and **Select CA File**; that button opened the macOS file dialog, `ca.pem` was picked with **Use This File**; **The authority file was set.** and **Cabinet: connected**; the three models came back in the picker, and the HTTPS turn answered **Hello from the stub, cafe.** (The wrong key of 4a was still stored; this stub asks for no key.)

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
2. Open the model button. Expected (not yet seen): under **Assistant Cabinet Coder** the Mac's models, among them **qwen2.5-coder:7b** and **qwen2.5-coder:14b** (the picker may list fewer than 21 if VS Code hides some: write how many you see, no screenshot needed). Click the **>** beside **qwen2.5-coder:14b** (1.147.0 shows no tooltip, Part 2 step 1): expected **Max context** `33K`.
3. A new chat, model **qwen2.5-coder:14b** (or the one you prefer, then write which), mode **Ask**. Send `say hello in three words`. Write whether an answer arrived and roughly how many seconds it took (the first answer loads the model and is slower).
4. Same model, mode **Agent**. Send `create a file named hello.txt in this folder that contains the word hello`. When VS Code asks, allow only a tool that creates or edits a file (**Allow Once**); if it proposes **Run in terminal**, click **Skip** (lesson 11). Write what it did (tool steps, approvals, errors). Then (window 2):

   ```bash
   cat /Users/ydekpo/x1b-test-workspace/hello.txt
   ```

   Expected: `hello` (or "No such file or directory" if the model did not manage it: then it is a finding about the model, unless a message names a code).

5. Look at the status bar: write its label.

Seen on 1.147.0 (19 November 2026), the curl check and the empty settings file done by the agent (curl answered `200`):

- Step 1 matched: **Connected: 21 models available**, first line `Server: http://127.0.0.1:1975` (not the network address), `Health check: the server answered.`, `Editor interface version: 1`, `Features: agents yes, document analysis no, image description no`, `Models (21):` with one line per model, among them `qwen2.5-coder:14b: window 32768 tokens, output up to 16384 tokens, tools yes, vision no`; no `Note:` line. Status bar **Cabinet: connected**. The loopback rule of Lot X1c is shown on the real server.
- Step 2 matched: the 21 models listed under **Assistant Cabinet Coder**, from `gemma4:12b` to `qwen3:1.7b`; **qwen2.5-coder:14b** `33K`.
- Step 3: an answer came in about fifteen seconds (the model was loaded first), but it was a tool call written as plain text (a block of JSON naming a tool `ask_user` with its arguments), not a reply and not a real tool call. A finding about the model or the server's handling of its tool calls, not about the extension: no message named a code.
- Step 4 deviated: at once, with no request sent, the editor's own message **Error: (query) No response was returned because static system messages and tool definitions exceed this model's context budget.** with **Try Again**. The extension reports an input budget of window minus output ceiling, 32768 - 16384 = 16384 tokens, and its token estimate errs high on purpose (3 characters per token before calibration); on 1.147.0 the Agent prompt and its tool definitions do not fit in that budget. Every model of this server has a window of at most 32768, so **Agent mode cannot start with any of them on 1.147.0** (it did with the stub's 131072-token **cabinet-code**). `cat` answered "No such file or directory". Lesson 15.
- Step 5: **Cabinet: connected**.

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

Expected: one line, `assistantcabinet.assistant-cabinet-coder-0.2.0` (installed on 6 November 2026 for the icon test), and no line for `0.2.1`. Seen in this run: the owner had installed 0.2.1 in the normal profile before Part 0 (lesson 10) and chose to keep it, so the line read `assistantcabinet.assistant-cabinet-coder-0.2.1` (the 0.2.0 folder was gone by 19 November 2026); the normal profile is not part of this test's evidence.

The extensions folder of the test profile holds no copy any more:

```bash
ls /Users/ydekpo/x1b-vscode-ext
```

Expected: no `assistantcabinet.assistant-cabinet-coder-...` folder (only VS Code's own bookkeeping file, if any). Seen on 1.147.0 (19 November 2026): the folder `assistantcabinet.assistant-cabinet-coder-0.2.1` was still there, beside `extensions.json` (an empty list) and `.obsolete` (which names that folder): VS Code removes an uninstalled extension's folder only at its next start, so the uninstall is proved by those two files, not by the folder being gone (lesson 16). Step 1: **Uninstall** asked for no reload; after Cmd+Q the Dock still showed a VS Code icon, but no process of the test instance was left (checked by the agent).

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

Only you can walk: everything in the VS Code window (the picker and its tabs, the tooltips, the modes, the tool steps and their approvals, the pasted picture, the stop button, the messages in the chat, the status bar after each change, the file dialog, the Test Connection dialog on the Mac's server), the real shape of the editor's own messages on 1.147.0, and the answers of a real model. Not walked by anyone: remote windows, a PDF, Windows with this version.

## Run record

- Date and VS Code version: 18 and 19 November 2026, VS Code 1.147.0 (updated from 1.146.0 before Part 1), macOS on the owner's Mac, signed out of GitHub, package `assistant-cabinet-coder-0.2.1.vsix` in a throw-away profile; the Mac's server package 0.1.11 with `IDE_ENABLED=on`. The agent started and restarted the stub and wrote the test profile's settings file itself; the owner played every editor step. This run covers Lot X1b (first run on a real editor) and Lot X1c.
- Matched:
  - Parts 0 and 1: the test profile, the install from the `.vsix`, **Cabinet: connected** on the stub.
  - Part 2: **Ask** with **cabinet-code** (one answer, no error); **Agent** turns ending with the stub's closing answer; **Plan**, chosen in the row under the chat box, answering.
  - Part 3: the dropped connection logged `code=stream_truncated`, and the log held codes, durations and counts only, never a sentence, a word of an answer, a file name or a key.
  - Part 4a: **Test Connection** naming the missing key with a **Set API Key** button; the key saved in the secret store; the models back with no reload; a turn answered.
  - Part 4b: the turned-off surface explained word for word with the new `cabinet config set IDE_ENABLED=on, then cabinet restart` sentence; **Cabinet: off**; no model listed.
  - Part 4c: the untrusted certificate explained with a **Select CA File** button; `ca.pem` picked in the macOS dialog; **Cabinet: connected**; a turn over HTTPS answered.
  - Part 5 steps 1, 2 and 5: with an empty settings file the extension found the Mac's server by itself on `http://127.0.0.1:1975`, not on `192.168.75.1` (the loopback rule of Lot X1c, decision D-018); **Connected: 21 models available** with the right features and limits; the 21 models in the picker; **Cabinet: connected**.
  - Part 6: no key in any file of the test profile; the real settings file's hash unchanged (`90df2fbc...6143` before and after).
- Deviated:
  - Part 0: 0.2.1 had been installed in the normal profile and a VS Code update was pending (lesson 10); the owner updated VS Code and kept 0.2.1 in the normal profile.
  - Part 2 step 1: a model without tool calling (**cabinet-plain**) is listed, unlike 1.143.1; the editor shows no tooltip of the extension, and the **>** beside a model opens only **Max context**; no **Local** label. The test was corrected.
  - Part 2 steps 3 and 4: no tool named like `read_file` or `create_file` was offered on 1.147.0, so the stub fell back to a terminal tool and VS Code asked to run the command `stub` (allowed once, harmless: "command not found"); no file was created. The test now says to **Skip** a terminal tool (lesson 11).
  - Part 2 step 5: no **Proceed from Plan** row.
  - Part 2 step 6 (added): **cabinet-plain** answered in Agent mode with no error.
  - Part 3 steps 1 and 2: no picture could be put in the chat (copying the file pasted its name, dragging did the same, the **+** button said "Could not attach pic.png.", a pasted screen capture did nothing), so the image path and the refusal for a model without vision were not reached (lesson 12).
  - Part 3 step 3: the stop button stopped the screen only; the log showed the full sixty seconds twice (`ms=60256`, `ms=60254`) with no `code=cancelled`: VS Code 1.147.0 did not cancel the request it gave the extension (lesson 13).
  - Part 3 step 4: the editor showed its own sentence, **Response interrupted: the model stopped before finishing. Try again.**, in place of ours (our code was logged).
  - Part 4a step 1: the picker still listed the models after the key was refused.
  - Part 4a step 4: after a wrong key the models left the picker, the message reached no model, and the editor opened its own GitHub sign-in (closed); our key sentence was not shown in the chat (lesson 14).
  - Part 5 step 3: **qwen2.5-coder:14b** answered in about fifteen seconds with a tool call written as plain JSON text: a finding about the model or the server, no code named.
  - Part 5 step 4: Agent mode refused at once with the editor's message "static system messages and tool definitions exceed this model's context budget"; the extension reports 16384 input tokens for a 32768-token model and the Agent prompt of 1.147.0 does not fit; no file was created (lesson 15).
  - Part 6: the uninstalled extension's folder stayed on disk, marked in `.obsolete`; the Dock kept an icon although the test instance had quit (lesson 16).
- Not shown: an image reaching a model, and the refusal of an image for a model without vision (no way of attaching a picture on 1.147.0 signed out); the extension's handling of a real cancellation (the editor never cancelled); our wording for a dropped stream and for a wrong key inside the chat; a **Manage** entry for the provider (not looked for); an Agent turn with a real model (refused by the editor, see above); a real tool call by a real model; remote windows, a PDF, Windows with this version.
