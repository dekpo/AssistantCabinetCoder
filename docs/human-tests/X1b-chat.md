# Human test X1b: the models in the chat (about 40 minutes)

This test proves what Lot X1b added: the server's models appear in the chat model picker, **Ask**, **Agent** and **Plan** answer with them (tool calls included), a pasted image reaches a model with vision, the stop button works, a server that stops mid-answer is reported, a wrong key and a turned-off surface are explained, and a chat works over HTTPS. It runs against the **stub gateway** (`npm run stub`, a fake server on this computer) and then once against the **tower**.

Follows `docs/HUMAN-TESTS-PROTOCOL.md` and the lessons of `docs/LESSONS.md` (1, 2, 5 and 6). Every command is Git Bash. Expectations marked **(not yet seen)** come from the agent's run against a fake VS Code and from the specification, not from your screen: the point of this test is to replace them with what you see. Where an on-screen label differs from the one written here, write the label you really see in brackets. The names of the chat's buttons are taken from the X0 run on 1.143.1 (the mode button reads **Agent**, the model button reads the model's name, **Local** is at the bottom left of the chat box); where a step needs a label nobody has seen yet, it says so and asks you to describe the position instead.

## How this test is built

- **A separate VS Code profile**, as in X0 and X1a: its own data folder and extensions folder, so it starts signed out of GitHub and **cannot change your real settings or extensions**. A hash of your real user settings file is taken before and after. The profile's settings file is written in advance with the stub's address.
- **Two Git Bash windows.** Window 1 runs the stub and stays busy (Ctrl+C to change its mode). Window 2 is for the other commands. Keep both open for the whole test.
- **The stub chooses its answer from a marker you type at the start of your message**, because the real chat sends no scenario field: `[stub:text]` (a short answer), `[stub:tool-call]` (calls one of the tools the chat offers, then closes), `[stub:tool-call:create_file]` (the same, but with the tool that creates a file), `[stub:long]` (about a minute of text), `[stub:cut]` (the connection is dropped mid-answer). Type the marker exactly, with the square brackets, then a space and any words.
- **Left out on purpose, because X1a's run already proved it:** the install-from-VSIX flow in a fresh profile (it is done again here but not examined), the dialogs of **Test Connection** and their texts, the key input box, the certificate dialog and its wrong-file refusal, the status bar states other than the ones named below, and automatic discovery of a local server. Also left out: remote windows and macOS (untested, see the README) and a PDF (a later lot).
- **What this test cannot tell you:** whether the answers of a real model are good. The stub's words are fixed. The quality of Agent and Plan depends on the model and on a window of 32768 tokens or more; the small models on the tower will not do well at it, and that is expected.

## Part 0: prepare (about 4 minutes)

**Terminal: Git Bash (window 2).**

**You start with:** a closed VS Code test window (your normal window may stay open), the repository on branch `feat/x1b-provider` with the Lot X1b files.
**You leave with:** the package built, four test folders, a picture and a note in the test workspace, a hash of your real settings noted.

No VS Code update may be waiting (lesson 1):

```bash
tasklist | grep -i CodeSetup
```

Expected: no output. If a `CodeSetup...` line appears, close every VS Code window, wait until the command prints nothing, then go on.

```bash
code --version
```

Expected: three lines (version, commit, architecture). On 27 October 2026 the version was `1.143.1`.

Proof that your real settings are untouched (the "before"). Note the line it prints:

```bash
sha256sum "/c/Users/dwyol/AppData/Roaming/Code/User/settings.json"
```

Expected: a hash and the file name. On 27 October 2026 it began with `b5e63f15`. If the file does not exist, write "no settings file" and go on.

Build the package:

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run package
```

Expected: ends with `DONE  Packaged: ...assistant-cabinet-coder-0.2.0.vsix (18 files, ...)`.

Port 8099 (the stub's) must be free:

```bash
netstat -ano | grep ':8099'
```

Expected: no output.

Create the folders:

```bash
mkdir -p /c/Users/dwyol/x1b-test-workspace /c/Users/dwyol/x1b-vscode-data/User /c/Users/dwyol/x1b-vscode-ext /c/Users/dwyol/x1b-ca
```

A small note and a one-pixel picture for the workspace (the picture is written from its base64 text, so nothing is downloaded):

```bash
printf 'line one\nline two\n' > /c/Users/dwyol/x1b-test-workspace/notes.txt
```

```bash
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > /c/Users/dwyol/x1b-test-workspace/pic.png
```

```bash
wc -c /c/Users/dwyol/x1b-test-workspace/pic.png
```

Expected: `70` and the file name.

The test profile's settings, with the stub's address:

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "http://127.0.0.1:8099"\n}\n' > /c/Users/dwyol/x1b-vscode-data/User/settings.json
```

**Paste back:** the output of `code --version`, of `sha256sum` and of `wc -c`.

## Part 1: start the stub, open the test window, install (about 5 minutes)

**Terminal: Git Bash (window 1)** for the stub, **window 2** for the window; the other steps are clicks in the test window.

**You start with:** Part 0 done.
**You leave with:** the stub running, the extension installed in the test window, the status bar reading connected.

Start the stub (window 1; it stays busy):

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --port 8099
```

Expected in window 1: `Stub gateway listening on http://127.0.0.1:8099 (mode: ok).`

Open the test window (window 2; a new VS Code window opens and looks like a first start):

```bash
code --user-data-dir "$(cygpath -w /c/Users/dwyol/x1b-vscode-data)" --extensions-dir "$(cygpath -w /c/Users/dwyol/x1b-vscode-ext)" "$(cygpath -w /c/Users/dwyol/x1b-test-workspace)"
```

In that window, in this order:

1. The welcome dialog offers **Continue without Signing In**: click it (never a sign-in button), then close the welcome page. Refuse any offer to set up Copilot or to turn on settings sync.
2. The folder opens in **Restricted Mode**. Click **Manage** in the grey banner (or the blue **Restricted Mode** button at the bottom left), then **Trust Workspace**.
3. **Make sure this is the test window (lesson 2).** Open the Extensions view (Ctrl+Shift+X). In the test window the list of installed extensions is **empty**. If you see your own extensions, you are in your normal window: go back to the window that opened from the command above.
4. In the Extensions view click the **...** at the top right (**Views and More Actions...**), then **Install from VSIX...**, pick `C:\Users\dwyol\Documents\CURSOR\AssistantCabinetCoder\assistant-cabinet-coder-0.2.0.vsix`, click **Install**. Write down whether VS Code asks for a reload and what you did.
5. Look at the right side of the status bar. Expected: **Cabinet: connected** within a few seconds (if you see nothing, run **Assistant Cabinet Coder: Test Connection** from the Command Palette once and look again).

**Paste back:** your answers to steps 4 and 5.

## Part 2: the picker, Ask, Agent and Plan (about 10 minutes)

**Terminal: Git Bash (window 2)** for the one check; everything else is clicks and typing in the test window.

**You start with:** Part 1 done, the stub running.
**You leave with:** one observation per mode, and a file created by the Agent step (or the tool's refusal).

1. Open the chat view as you did in the X0 test (the chat with the text field that reads **Build with Agent**). Under the text field, click the model button (the one that shows a model name). **Send me a screenshot of what opens, or describe it:** the list of tabs and the model names under each. Expected (not yet seen): a tab named **Assistant Cabinet Coder** next to a **GitHub Copilot** tab that asks to sign in; under ours, **cabinet-chat** and **cabinet-code**, and **not** `cabinet-plain` (it reports no tool calling, and the X0 run showed that VS Code lists no such model, in any mode). Hover **cabinet-code**: expected the tooltip lines `Context window: 131072 tokens.`, `Output ceiling: 16384 tokens.`, `Tool calling: yes. Image input: yes.` Write down where, if anywhere, you can reach a **Manage** entry for the provider and what it opens (expected: the menu of the extension with five entries; **not yet seen**).
2. Pick **cabinet-code**. Make sure the mode button reads **Ask** (click it and choose **Ask** if not) and that the bottom left of the chat box says **Local**. Type this and send it:

   `[stub:text] hello`

   Expected: the answer **Hello from the stub, cafe.** (in the real answer the last letter of the last word carries an accent) appears in one go, with no error.

3. Switch the mode to **Agent**. Send:

   `[stub:tool-call] read notes.txt`

   Expected (not yet seen): the chat shows a tool step (a file-reading tool called by the stub, which picks the first tool whose name contains `read_file` and gives it the smallest valid arguments, so the file it reads may not exist), then the closing answer **Closing answer from the stub.** If VS Code asks you to allow the tool, allow it and write that it asked. Write the name of the tool shown in the step.

4. Still in **Agent**, send:

   `[stub:tool-call:create_file] make a file`

   Expected (not yet seen): a tool step that creates a file (name shown in the step); VS Code may ask to allow it, allow it; then **Closing answer from the stub.** The stub gives the tool the smallest valid arguments, so the file is called `stub` and holds the word `stub`, **or** the tool refuses the arguments (for example because the path is not absolute) and the chat still ends with the closing answer. Write which one happened. If a file was created, check it (window 2):

   ```bash
   cat /c/Users/dwyol/x1b-test-workspace/stub
   ```

   Expected: `stub`, or "No such file" if the tool refused.

5. Switch the mode to **Plan** (the mode menu lists **Agent**, **Ask**, **Plan**; if **Plan** is not there, type `/plan` in the text field instead). Send:

   `[stub:text] outline the change`

   Expected: **Hello from the stub, cafe.** and, under it, a **Proceed from Plan** row (as seen in X0). Write what you see.

**Paste back:** your answers to steps 1 to 5, the tool names of steps 3 and 4, and the output of `cat`.

## Part 3: an image, the stop button, a dropped connection (about 8 minutes)

**Terminal: Git Bash (window 2)** for nothing in this part; everything is in the test window.

**You start with:** Part 2 done, the stub running, **cabinet-code** selected.
**You leave with:** what an image does with and without vision, the stop button's effect in the log, and the "answer stopped" message.

1. Start a **new chat** (the **+** at the top of the chat view; if you see another label, write it), mode **Ask**, model **cabinet-code**. Copy `pic.png` in the editor and paste it into the chat box with Ctrl+V as in the X0 run (a Win+Shift+S screenshot did not work there: use the file). The picture should appear in the chat box. Type and send:

   `[stub:text] what is in the picture?`

   Expected (not yet seen): **Hello from the stub, cafe.** with no error. Write whether the picture showed in your message.

2. Start another **new chat**, choose the model **cabinet-chat** (it reports no vision), and paste `pic.png` the same way. Write **what happens**, exactly: either VS Code refuses or ignores the picture on its own, or it is attached; then type and send `[stub:text] look`. Expected (not yet seen) if it was attached: the message **This model cannot read images, so the request was not sent...** (ours), and no answer.

3. Start a **new chat**, model **cabinet-code**, mode **Ask**. Send:

   `[stub:long] go`

   Words appear one after the other (`word0 word1 ...`, about four a second). After about five seconds click the **stop button** (it replaces the send button while an answer is coming; if you see another label, write it). Expected: the words stop at once and no error is shown. Write how many seconds it took the words to stop.

4. Send:

   `[stub:cut] go`

   Expected (not yet seen): the word **Partial** appears and then the message **The server's answer stopped before it was complete.**

5. Open the Command Palette (Ctrl+Shift+P), run **Assistant Cabinet Coder: Show Output**. Select all the lines (click in the text, Ctrl+A, Ctrl+C) and paste them into the chat with me. Expected: one line per call, like `2026-10-28T... call=chat status=200 ms=12 alias=cabinet-code prompt_tokens=... completion_tokens=... tool_calls=0`; the stopped answer shows `code=cancelled`, the dropped one `code=stream_truncated`, the refused picture (if it was sent) `code=provider_capability_unsupported`. **No sentence of yours, no word of an answer, no file name, no key.** Tell me if any line holds anything else.

**Paste back:** your answers to steps 1 to 4 and the pasted output lines.

## Part 4: a key, the surface turned off, HTTPS (about 8 minutes)

**Terminal: Git Bash (window 1)** for the stub, **window 2** for the settings; then clicks.

**You start with:** Part 3 done, window 1 busy with the stub.
**You leave with:** the picker after a missing key, a given key and a wrong key; after the surface is turned off; and a chat over HTTPS.

### 4a. A key is needed, then given, then wrong

Ctrl+C in window 1, then:

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --key letmein-123 --port 8099
```

1. Wait a few seconds. Expected: the status bar reads **Cabinet: key needed**. Open the model button of the chat again. Expected (not yet seen): no model under **Assistant Cabinet Coder**, and possibly a message offering **Set API Key**. Write what you see.
2. Run **Assistant Cabinet Coder: Set API Key** from the Command Palette, type `letmein-123`, press Enter. Expected: **The API key was saved in the secret store.**, the status bar changes to **Cabinet: connected**, and the models come back in the picker **without a reload**. Write whether they did, and how long it took.
3. In a new chat with **cabinet-code**, send `[stub:text] hi`. Expected: **Hello from the stub, cafe.**
4. Run **Set API Key** again with a wrong key, `wrong-key-999`. Send `[stub:text] hi` in the same chat. Expected (not yet seen): the message beginning **The server needs a valid API key.** in the chat, and the status bar going to **Cabinet: key needed**.

### 4b. The surface is turned off

Ctrl+C in window 1, then:

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode off --port 8099
```

Wait a few seconds. Expected: status bar **Cabinet: off**. Open the model button: expected (not yet seen) that no model is listed under **Assistant Cabinet Coder** (it may take the 60 seconds of the cache, or the next change of a setting: write how long it took). Send `[stub:text] hi` in the old chat: expected the message **The server has not turned on the editor surface. Ask the administrator to run: cabinet-server config set IDE_ENABLED=on, then cabinet-server restart.**

### 4c. A chat over HTTPS

Ctrl+C in window 1, then:

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --port 8099 --https "$(cygpath -w /c/Users/dwyol/x1b-ca)"
```

Expected in window 1: `Stub gateway listening on https://127.0.0.1:8099 (mode: ok).` and `Authority file written to: ...x1b-ca\ca.pem`.

Point the test profile at the HTTPS address (window 2; VS Code reads the change by itself):

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "https://127.0.0.1:8099"\n}\n' > /c/Users/dwyol/x1b-vscode-data/User/settings.json
```

1. Expected: status bar **Cabinet: certificate**. Run **Assistant Cabinet Coder: Select CA File**, pick `C:\Users\dwyol\x1b-ca\ca.pem` (the dialog lists `.pem`, `.crt` and `.cer` files). Expected: **The authority file was set.** and the status bar **Cabinet: connected**.
2. In a new chat with **cabinet-code**, send `[stub:text] hi over https`. Expected: **Hello from the stub, cafe.**

Ctrl+C in window 1.

**Paste back:** your answers to 4a steps 1 to 4, to 4b, and to 4c steps 1 and 2.

## Part 5: the tower (about 3 minutes)

**Terminal: Git Bash (window 2)** for the first command; then clicks.

**You start with:** Part 4 done, the stub stopped.
**You leave with:** what the real server shows today.

Point the test profile at the tower:

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "http://192.168.1.83:8090"\n}\n' > /c/Users/dwyol/x1b-vscode-data/User/settings.json
```

Until the server's Lot 15b is installed and `IDE_ENABLED=on`, the expected result is the **surface off** situation of 4b: status bar **Cabinet: off**, no model under **Assistant Cabinet Coder**, and the administrator sentence when you try. Write what you see.

If the tower's editor surface **is** already on: the models appear. Pick the smallest one that reports tools, mode **Ask**, and send `say hello in three words`. Write the model names, whether the answer arrived, and how long it took. Then, in **Agent**, ask it `read notes.txt and tell me how many lines it has` and write what it did. **Say plainly that the small models on the tower will not do well at Agent and Plan:** a failure here is a finding about the model, not about the extension, unless the message names a code.

**Paste back:** what you saw.

## Part 6: uninstall and clean up (about 3 minutes)

**Terminal: Git Bash (window 2)** for the commands; step 1 is a click.

**You start with:** Part 5 done.
**You leave with:** nothing left behind, and the proof that your real profile never saw the extension.

1. In the test window, Extensions view, click **Assistant Cabinet Coder**, then **Uninstall**. Write whether VS Code asks for a reload.
2. **Close the test window completely**, the one whose title contains `x1b-test-workspace`; keep your normal window. Wait ten seconds. **Every check below must run after this** (lesson 6): while the window is open the profile's files are locked, and a "Device or resource busy" message from `grep` or `rm` means the window is still open: close it and run that command again. No check below is run after a deletion started.

The key must not be in any file of the test profile (VS Code keeps it in its encrypted secret storage):

```bash
grep -rl "letmein-123" /c/Users/dwyol/x1b-vscode-data /c/Users/dwyol/x1b-vscode-ext
```

Expected: no output. If it prints a file name, write the name (not the content): that is a finding.

The wrong key must not be there either:

```bash
grep -rl "wrong-key-999" /c/Users/dwyol/x1b-vscode-data /c/Users/dwyol/x1b-vscode-ext
```

Expected: no output.

Nothing was installed in your normal profile (lesson 2):

```bash
ls /c/Users/dwyol/.vscode/extensions | grep -i cabinet
```

Expected: no line for `assistant-cabinet-coder`. (A line for the old probe may remain until your normal window next starts: it was marked obsolete in Lot X0; ignore it.)

The extensions folder of the test profile holds no copy any more:

```bash
ls /c/Users/dwyol/x1b-vscode-ext
```

Expected: no `assistantcabinet.assistant-cabinet-coder-...` folder (only VS Code's own bookkeeping file, if any).

The proof that your real settings are untouched (the "after"; the hash must equal the one of Part 0):

```bash
sha256sum "/c/Users/dwyol/AppData/Roaming/Code/User/settings.json"
```

Only now delete the four test folders (they hold only test data):

```bash
rm -rf /c/Users/dwyol/x1b-test-workspace /c/Users/dwyol/x1b-vscode-data /c/Users/dwyol/x1b-vscode-ext /c/Users/dwyol/x1b-ca
```

Expected: no output.

**Paste back:** the outputs of the five checking commands.

## What was walked without VS Code, and what only you can walk

Walked by the agent: the `.vsix` builds (18 files, 38 kilobytes: the compiled sources, the licence, the README and the manifest); the compiled extension was run against a fake `vscode` module and the stub (activation and the provider's registration under the vendor, six concurrent calls for the model list answered with one request, an Ask turn, a tool-call turn with its closing answer, an image turn, the refusal of an image for a model without vision, a cancelled turn that closed the connection, token counts, the change event after a settings change, and the log lines, which held no text); the conversion, the stream reader, the token calibration and every error code are unit tests, with golden request files for an Ask turn, an Agent turn with parallel calls, a Plan turn, a System-User-User turn, an image turn and a tool-result image; the manifest, language, no-leak (connection path and provider path), no-network, no-risk, drift and removed-probe guards are tests.

Only you can walk: everything in the VS Code window (the picker and its tabs, the tooltips, the modes, the tool steps and their approvals, the pasted picture, the stop button, the messages in the chat, the status bar after each change, the file dialog), the real shape of the editor's own messages, and the answer of the tower. Not walked by anyone: a real model's answers, macOS, remote windows, a PDF.

## Run record

To be appended by the agent after your run (date and VS Code version, what matched, what deviated, what was not shown).
