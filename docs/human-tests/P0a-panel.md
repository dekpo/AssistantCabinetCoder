# Human test P0a: the extension's own chat panel on the Mac (about 35 minutes)

This test proves what Lot P0a built (decisions D-026, D-027, D-028): a chat panel of the extension's own, in the editor's right side bar, whose request is **sent once**, whose **Stop closes the request**, whose first request is **small**, and whose conversations **come back after a reload**. It runs against the **stub gateway** first, then against **the Mac's own server** with `qwen2.5-coder:14b`.

Follows `docs/HUMAN-TESTS-PROTOCOL.md` and lessons 1, 2, 6, 10, 13, 16, 20 and 22 of `docs/LESSONS.md`. Every command is a Terminal (zsh) command on the Mac; **the agent runs every command that needs no click** and reads the outputs itself (the stub's console, the extension's log file and the saved conversation files of the test profile, by name and size only, never their content). You play the clicks.

## How this test is built

- **A separate VS Code profile**: its own data folder (`/Users/ydekpo/p0a-vscode-data`) and extensions folder (`/Users/ydekpo/p0a-vscode-ext`), and a scratch workspace (`/Users/ydekpo/p0a-test-workspace`). It starts signed out and cannot change your real settings or extensions; a hash of your real settings file is taken before and after. The package is installed **in the test profile only**, by the agent; your normal VS Code window is not touched (lesson 10).
- **What is measured where:** a stop is judged on the stub's console (`complete=false`) and on the extension's log line (`code=cancelled` and its `ms`), never on the screen (lesson 13). The time to the first word is the log's `first_ms`; the time to the end is its `ms`; the size of the request is its `prompt_tokens`.
- **The Mac's server** answered on 23 November 2026 with version **0.1.13**, `qwen2.5-coder:14b` with a window of 32768 and an output ceiling of 16384, and a limit of 200 000 characters per request. The server's change that frees its slot when a request is stopped **before the first word** (server decision D-100, contract section 3 "Stop") reaches the Mac with the server's **next** package: Part 5 shows what 0.1.13 does.
- **Left out on purpose**, because earlier runs proved them and nothing changed there: keys, HTTPS, discovery's details, the provider in the editor's chat (unchanged, frozen at 0.2.3), and Windows.

## Part 0: prepare (agent, about 2 minutes)

**Terminal: Terminal (zsh)**, run by the agent.

**You start with:** every VS Code test window quit (from the test instance's own Dock icon, lesson 16); your normal window open, with no blue **Update** button in its title bar (lesson 1; if you see one, say so first).
**You leave with:** the package 0.3.0 built, a fresh test profile pointed at the stub, the package installed in it, a long text ready for Part 5, the stub running, the test window open.

The agent runs, in this order, and reads each output:

```bash
pgrep -f "p0a-vscode-data" | wc -l
```

Expected: `0`.

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --version
```

Expected: `1.147.0` on the first line.

```bash
shasum -a 256 "/Users/ydekpo/Library/Application Support/Code/User/settings.json"
```

Expected: a hash (the "before"). On 21 November 2026 it began with `90df2fbc`.

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run package
```

Expected: ends with `DONE  Packaged: ...assistant-cabinet-coder-0.3.0.vsix (31 files, ...)`.

```bash
rm -rf /Users/ydekpo/p0a-test-workspace /Users/ydekpo/p0a-vscode-data /Users/ydekpo/p0a-vscode-ext
```

```bash
mkdir -p /Users/ydekpo/p0a-test-workspace /Users/ydekpo/p0a-vscode-data/User /Users/ydekpo/p0a-vscode-ext
```

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "http://127.0.0.1:8099"\n}\n' > /Users/ydekpo/p0a-vscode-data/User/settings.json
```

The long text of Part 5 (about 60 000 characters of numbered plain sentences, nothing personal: the server's guard estimates 2 characters per token, so it stays under the window of 32768):

```bash
node -e 'const fs = require("node:fs"); let s = ""; for (let i = 1; s.length < 60000; i++) { s += "Line " + i + ": the quick brown fox jumps over the lazy dog while the build compiles module " + i + ".\n"; } fs.writeFileSync("/Users/ydekpo/p0a-test-workspace/long-text.txt", s);'
```

```bash
wc -c /Users/ydekpo/p0a-test-workspace/long-text.txt
```

Expected: a little over `60000`.

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --user-data-dir /Users/ydekpo/p0a-vscode-data --extensions-dir /Users/ydekpo/p0a-vscode-ext --install-extension /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder/assistant-cabinet-coder-0.3.0.vsix
```

Expected: the extension's folder `assistantcabinet.assistant-cabinet-coder-0.3.0` in `/Users/ydekpo/p0a-vscode-ext`.

```bash
lsof -nP -iTCP:8099 -sTCP:LISTEN
```

Expected: no output. Then the stub, which stays running (its console is read by the agent):

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --port 8099
```

Expected: `Stub gateway listening on http://127.0.0.1:8099 (mode: ok).` Then the test window:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --user-data-dir /Users/ydekpo/p0a-vscode-data --extensions-dir /Users/ydekpo/p0a-vscode-ext --new-window /Users/ydekpo/p0a-test-workspace
```

## Part 1: where the panel is, a plain chat, and a reload (you, about 8 minutes)

**Terminal:** none for you.

**You start with:** Part 0 done, the test window open.
**You leave with:** the panel found, two answers of the stub on screen, the window reloaded with the conversation still there.

1. **Make sure this is the test window (lesson 2):** its title contains `p0a-test-workspace`, and the Extensions view lists only **Assistant Cabinet Coder** (version **0.3.0**). Click **Continue without Signing In** if asked and trust the folder if asked (**Yes, I trust the authors**). The status bar reads **Cabinet: connected**.
2. **Find the panel.** Expected (read in VS Code's code, not yet seen): an icon (a speech bubble with angle brackets) in the **right** side bar. If the right side bar is hidden, use **View > Appearance > Secondary Side Bar**. If the icon is in the **left** activity bar instead, say so and drag it onto the right side bar. **Answer:** where it was, and a screenshot of the window with the panel open.
3. The panel shows a model list at the top (`cabinet-chat`, `cabinet-code`, `cabinet-plain`), the buttons **New** and **History**, a short sentence saying it is a plain chat, an input and **Send**. No sign-in window opens because of it. Choose **cabinet-code**. Type, then press **Enter**:

```text
hello
```

Expected: **Answering** flashes, then the answer **Hello from the stub, cafe** with an accent on the e, and a full stop.

4. Send:

```text
[stub:markup]
```

Expected: a heading **Stub heading**; a sentence with **bold**, _italic_ and `inline code`; a bulleted list with one nested item; a numbered list (1, 2); a code block labelled `ts`; then three lines shown **as plain text**, exactly as written: one starting with `<script>`, one starting with `<img src="x"`, and `[a link](javascript:void(0))`; then a code block labelled `html` holding `<b>not bold</b>`. Nothing is bold in that last block, no picture or broken picture appears, the window title does not change.

5. Open the command palette (**Cmd+Shift+P**) and run **Developer: Reload Window**. Open the panel again if it is closed.

Expected: the same conversation is back, both questions and both answers. **History** lists one conversation named `hello`; click **Back**.

**What the agent must read before calling this part done (lesson 22):** in the stub's console, two lines `start scenario=text` / `start scenario=markup`, each with its `end ... complete=true`; in the extension's log, two `call=chat status=200` lines with `alias=cabinet-code` and a `first_ms`; in the test profile's storage, one folder `conversations` holding one `<id>.json` and `index.json`, each `-rw-------` (read by name, size and permissions only):

```bash
find /Users/ydekpo/p0a-vscode-data/User/workspaceStorage -path "*assistantcabinet.assistant-cabinet-coder/conversations*" -type f -exec ls -l {} \;
```

**Answer:** what steps 2 to 5 showed, in a few words, and the screenshot of step 2.

## Part 2: the stub, a stop, a refusal and a deletion (you, about 6 minutes)

**Terminal:** none for you.

**You start with:** Part 1 done.
**You leave with:** one stopped answer, one refusal shown once, one conversation deleted.

1. Click **New**. Send:

```text
[stub:long]
```

When a few words (`word0 word1 ...`) are on screen, click **Stop** (the **Send** button turns into **Stop** while a request is open).

Expected: the words stop at once and stay, with **Stopped.** under them; the button reads **Send** again.

2. Send:

```text
[stub:refuse:server_busy]
```

Expected, after less than a second: **The server is busy with other requests. Try again in a moment.** once, under an empty answer. Nothing else arrives.

3. Click **History**. Two conversations are listed: `[stub:long]` (newest) and `hello`. Click **Delete** beside `hello`. A confirmation asks whether to delete the conversation "hello", which cannot be restored; click **Delete**.

Expected: only `[stub:long]` is left in the list. Click **Back**.

**What the agent must read before calling this part done (lesson 22):** in the stub's console, **one** `start scenario=long` line whose `end` line says `complete=false` with `ms` well under 60000 (a second or two after your click); then **exactly one** `start scenario=refuse code=server_busy` line (never two: nothing was sent again); in the extension's log, `code=cancelled` on the `[stub:long]` line and `status=503 ... code=server_busy` on the next; in the storage folder, one `<id>.json` fewer than the conversations created (the `hello` file is gone):

```bash
find /Users/ydekpo/p0a-vscode-data/User/workspaceStorage -path "*assistantcabinet.assistant-cabinet-coder/conversations*" -type f -exec ls -l {} \;
```

**Answer:** what steps 1 to 3 showed, in a few words.

## Part 3: the Mac's own server, a first message (you, about 5 minutes)

**Before you start, about the desktop application:** the server is shared with it. Parts 3 to 5 **load `qwen2.5-coder:14b`** (about 9 GB) on the Mac. The Mac keeps at most two models loaded, so this can push out the model the desktop application uses and make its next answer slow; an editor answer at the same time as a desktop one slows both. Nothing is changed on the server: no setting, no restart. **Choose the moment**, and say "go".

**Terminal: Terminal (zsh)**, run by the agent; then clicks.

**You start with:** Part 2 done.
**You leave with:** one answer of `qwen2.5-coder:14b` and its measures.

The agent stops the stub (Ctrl+C in its terminal), checks that the editor surface is on and the model's window, and empties the test profile's settings so that discovery finds the Mac's server (VS Code reads the change by itself):

```bash
curl -s http://127.0.0.1:1975/health | grep -o '"version": *"[^"]*"'
```

Expected: `"version":"0.1.13"` (another version: the agent says so before going on, because Part 5's expectation depends on it).

```bash
curl -s http://127.0.0.1:1975/ide/v1/models | grep -o '"id": *"qwen2.5-coder:14b"[^}]*"context_window": *[0-9]*'
```

Expected: one line ending with `"context_window":32768` (the agent may read the list another way if the fields come in another order). A `404` or nothing at all: stop here.

```bash
printf '{}\n' > /Users/ydekpo/p0a-vscode-data/User/settings.json
```

1. The status bar reads **Cabinet: connected** within a few seconds (if not, run **Assistant Cabinet Coder: Test Connection** once). The panel's model list now shows the server's models.
2. Click **New**. Choose **qwen2.5-coder:14b**. Send:

```text
hello
```

Expected: **Reading the request** with a growing number of seconds (the model may be loading), then **Answering** and a short greeting; the button reads **Send** again at the end.

**What the agent must read before calling this part done:** in the extension's log, one line `call=chat status=200 ... alias=qwen2.5-coder:14b prompt_tokens=<a few dozen> ... first_ms=... ` with no code. Expected: `prompt_tokens` of a few dozen, against 21 597 for the editor's Agent request (D-024). The agent records `first_ms` (time to the first word) and `ms` (time to the end).

**Answer:** what the panel showed, in a few words.

## Part 4: the Mac's own server, stop while answering (you, about 4 minutes)

**Terminal:** none for you.

**You start with:** Part 3 done, `qwen2.5-coder:14b` loaded.
**You leave with:** one stopped answer and a second request that started right after it.

1. Send:

```text
Explain in about 1500 words how a hash map works, with three code examples in Python.
```

2. When words are streaming (the panel says **Answering**), click **Stop**. Expected: the words stop at once, with **Stopped.** under them.
3. **At once**, send:

```text
hello
```

Expected (the server's answer of 23 November 2026, measured against a scripted runtime, not yet seen with the real one): the second request starts at once (**Reading the request** for a second or two at most), then a short greeting; no **server is busy** sentence.

**What the agent must read before calling this part done (lesson 22):** in the extension's log, two `call=chat` lines: the first with `code=cancelled`, the second `status=200` with a small `first_ms`, and the time between the two lines (each line's time minus its `ms` gives its start). No `code=server_busy`.

**Answer:** what the panel showed at steps 2 and 3, in a few words.

## Part 5: the Mac's own server, stop while reading (you, about 5 minutes)

**Terminal: Terminal (zsh)**, run by the agent first.

**You start with:** Part 4 done.
**You leave with:** one request stopped before its first word, and a second one whose wait is measured.

The agent puts the long text of Part 0 in the clipboard:

```bash
pbcopy < /Users/ydekpo/p0a-test-workspace/long-text.txt
```

1. Click **New**. Click in the input, press **Cmd+V** (the long text appears), then press **Enter**.
2. While the panel says **Reading the request** (no word yet; with this length it should last a while), click **Stop**. Expected: under the empty answer, the sentence **Stopped before the first word arrived. An older server finishes reading the request before it takes the next one, so your next message may wait a moment.**
3. **At once**, send:

```text
hello
```

Expected with the server 0.1.13 (before D-100; not yet seen): the second request stays on **Reading the request** until the server has finished reading the long text (it does not see the stop before its first token), then answers; or it is refused once with **The server is busy with other requests. Try again in a moment.** Either way it is shown once and never sent again by the extension. With a server that has D-100 it would start at once.

**What the agent must read before calling this part done (lesson 22):** in the extension's log, the long request's line with `code=cancelled` and no `first_ms`, then the `hello` line (its `first_ms`, or `status=503 code=server_busy`); the agent records the time between the stop and the start of the second request, and how long the second one waited for its first word.

**Answer:** what the panel showed at steps 2 and 3, in a few words.

## Part 6: clean up (you, then the agent, about 3 minutes)

**Terminal: Terminal (zsh)**, run by the agent after your click.

**You start with:** Part 5 done.
**You leave with:** the test instance quit, the test folders deleted (the test conversations with them), your normal profile and settings unchanged.

1. **Quit the test instance from its own Dock icon** (right-click its VS Code icon, **Quit**; lesson 16): closing its window is not enough on macOS. Your normal VS Code stays open. Say "quit".

Then the agent runs, in this order:

```bash
pgrep -f "p0a-vscode-data" | wc -l
```

Expected: `0`. Anything else: the agent stops and asks you to quit the test instance again; nothing below runs before `0` (lesson 6).

```bash
shasum -a 256 "/Users/ydekpo/Library/Application Support/Code/User/settings.json"
```

Expected: the same hash as in Part 0.

```bash
ls /Users/ydekpo/.vscode/extensions | grep -i cabinet
```

Expected: `assistantcabinet.assistant-cabinet-coder-0.2.1` only (your normal profile, untouched by this test).

```bash
rm -rf /Users/ydekpo/p0a-test-workspace /Users/ydekpo/p0a-vscode-data /Users/ydekpo/p0a-vscode-ext
```

Nothing was turned on on the server by this test, so nothing is undone there. `qwen2.5-coder:14b` stays loaded until the model engine unloads it by itself after a few idle minutes.

## Walked by the agent before the run (23 November 2026)

- The package `assistant-cabinet-coder-0.3.0.vsix` was built with `npm run package` (31 files: the 22 compiled modules, `media/panel.js`, `media/panel.css`, `images/panel.svg`, the icon, the licence, the README and the manifest).
- The whole panel ran without the editor: `test/session.test.ts` (the panel's logic against the stub and a real temporary folder: send, stop while answering and while reading, refusal sent once, history, deletion, an answer cut by a closed window, persistence across a new session), `test/chat.test.ts` (the stub's `complete=false` a few hundred milliseconds after a stop), `test/webview.test.ts` (`media/panel.js` in a fake document: what it draws and posts; no element is made from the model's text) and the guards of `test/panel-guards.test.ts`.
- Read-only on the Mac's server: `/health` version 0.1.13; `qwen2.5-coder:14b` window 32768, ceiling 16384; limit 200 000 characters.
- **Not walked**, the owner's part: where VS Code 1.147.0 really puts the panel, how it looks in the editor's theme, the reload, and everything against the real server.
