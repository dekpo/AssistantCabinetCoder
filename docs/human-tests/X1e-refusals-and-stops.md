# Human test X1e: a final refusal reaches the server once, with its numbers, on the Mac (about 20 minutes)

This test proves what Lot X1e changed (decision D-025): VS Code 1.147.0 still retries a failed request five times, but when the server refuses a request for a reason that retrying cannot fix, the extension answers the identical retries itself, so the server receives the request **once**; and the window-overflow sentence shows the server's estimate and the model's window. A refusal that may succeed later (`server_busy`) is still retried. It runs against the **stub gateway**, then against **the Mac's own server** with `qwen2.5-coder:14b`, whose window of 32768 the server's guard refuses for an Agent request in under 10 ms, before any model is loaded.

Follows `docs/HUMAN-TESTS-PROTOCOL.md` and lessons 1, 2, 6, 10, 13, 16, 19 and 22 of `docs/LESSONS.md`. Every command is a Terminal (zsh) command on the Mac; **the agent runs every command that needs no click** and reads the outputs itself (the stub's console and the extension's log file in the test profile). You play the clicks.

## How this test is built

- **A separate VS Code profile**, as in X1d: its own data folder (`/Users/ydekpo/x1e-vscode-data`) and extensions folder (`/Users/ydekpo/x1e-vscode-ext`), and a scratch workspace (`/Users/ydekpo/x1e-test-workspace`). It starts signed out and cannot change your real settings or extensions; a hash of your real settings file is taken before and after. The package is installed **in the test profile only**, by the agent; your normal VS Code window is not touched (lesson 10).
- **What Part A of this lot measured on VS Code 1.147.0 (21 November 2026)**, with a count-only build that was never committed: every error kind the extension can throw is retried five times (6 requests, about 15 seconds, framed "Failed to get response from the AI model; retried 5 times ... Last error: 502"), in Ask, Agent and Plan; the stop button never cancels the request.
- **What this test counts:** the stub's console prints one line per chat request (`chat#N start scenario=refuse code=...`), so "one request" and "six requests" are read there, not on the screen. In the extension's log a remembered refusal has a code and **no** `status=`.
- **Left out on purpose**, because Part A of this lot or earlier runs proved it: the other error kinds, the stop button (unchanged, and it never reaches the extension), Ask and Plan (the provider does not know the mode), keys, HTTPS, discovery.

## Part 0: prepare (agent, about 2 minutes)

**Terminal: Terminal (zsh)**, run by the agent.

**You start with:** every VS Code test window quit (from the test instance's own Dock icon, lesson 16); your normal window open, with no blue **Update** button in its title bar (lesson 1; if you see one, say so first).
**You leave with:** the package 0.2.3 built, a fresh test profile with the stub's address, the package installed in it, the stub running, the test window open.

The agent runs, in this order, and reads each output:

```bash
pgrep -f "x1e-vscode-data" | wc -l
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

Expected: ends with `DONE  Packaged: ...assistant-cabinet-coder-0.2.3.vsix (19 files, ...)`.

```bash
rm -rf /Users/ydekpo/x1e-test-workspace /Users/ydekpo/x1e-vscode-data /Users/ydekpo/x1e-vscode-ext
```

```bash
mkdir -p /Users/ydekpo/x1e-test-workspace /Users/ydekpo/x1e-vscode-data/User /Users/ydekpo/x1e-vscode-ext
```

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "http://127.0.0.1:8099"\n}\n' > /Users/ydekpo/x1e-vscode-data/User/settings.json
```

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --user-data-dir /Users/ydekpo/x1e-vscode-data --extensions-dir /Users/ydekpo/x1e-vscode-ext --install-extension /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder/assistant-cabinet-coder-0.2.3.vsix
```

Expected: the extension's folder `assistantcabinet.assistant-cabinet-coder-0.2.3` in `/Users/ydekpo/x1e-vscode-ext`.

```bash
lsof -nP -iTCP:8099 -sTCP:LISTEN
```

Expected: no output. Then the stub, which stays running (its console is read by the agent):

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --port 8099
```

Expected: `Stub gateway listening on http://127.0.0.1:8099 (mode: ok).` Then the test window:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --user-data-dir /Users/ydekpo/x1e-vscode-data --extensions-dir /Users/ydekpo/x1e-vscode-ext --new-window /Users/ydekpo/x1e-test-workspace
```

## Part 1: the stub, a final refusal and a busy server (you, about 6 minutes)

**Terminal:** none for you.

**You start with:** Part 0 done, the test window open.
**You leave with:** two messages sent in Agent mode, and their counts read by the agent.

1. **Make sure this is the test window (lesson 2):** its title contains `x1e-test-workspace`, and the Extensions view lists only **Assistant Cabinet Coder** (version **0.2.3**). Click **Continue without Signing In** and trust the folder if asked (**Yes, I trust the authors**). The status bar reads **Cabinet: connected**.
2. Open the chat. Model button: under **Assistant Cabinet Coder** choose **cabinet-code**. Mode **Agent**. Send:

```text
a [stub:refuse:context_too_large]
```

Wait until the chat shows the error (about 15 seconds). Expected: the editor's frame "Sorry, your request failed... retried 5 times ... Last error: 502", then **The conversation is too long for this model: the server estimates about 50500 tokens for a window of 32768 tokens. Start a new chat or attach less.** followed by the sentence about `cabinet models context`.

3. In the same chat, send:

```text
b [stub:refuse:server_busy]
```

Wait until the chat shows the error. Expected: the same frame, then **The server is busy with other requests. Try again in a moment.**

**What the agent must read before calling this part done (lesson 22):** in the stub's console, exactly **one** line `start scenario=refuse code=context_too_large` and **six** lines `start scenario=refuse code=server_busy`; in the extension's log, one `status=413 ... code=context_too_large` line followed by five `code=context_too_large` lines with no `status=`, and six `status=503 ... code=server_busy` lines.

**Answer:** what the chat showed at steps 2 and 3, in a few words. A screenshot only if the words differ.

## Part 2: the Mac's own server with qwen2.5-coder:14b (you, about 5 minutes)

**Before you start, about the desktop application:** the server is shared with it. This part sends one Agent request that the server refuses in under 10 ms, **before loading any model** (seen in X1d): the desktop application is not slowed and no model is pushed out. Nothing is changed on the server: no setting, no restart. Choose the moment anyway.

**Terminal: Terminal (zsh)**, run by the agent; then clicks.

**You start with:** Part 1 done.
**You leave with:** one Agent message refused by the server, shown with its numbers, and its log lines.

The agent stops the stub (Ctrl+C in its terminal), checks that the editor surface is on and that the model's window is still 32768, and empties the test profile's settings so that discovery finds the Mac's server (VS Code reads the change by itself):

```bash
curl -s http://127.0.0.1:1975/ide/v1/models | grep -o '"id": *"qwen2.5-coder:14b"[^}]*"context_window": *[0-9]*'
```

Expected: one line ending with `"context_window": 32768` (the agent may read the list another way if the server orders the fields differently). A `404` or nothing at all: stop here.

```bash
printf '{}\n' > /Users/ydekpo/x1e-vscode-data/User/settings.json
```

1. The status bar reads **Cabinet: connected** within a few seconds (if not, run **Assistant Cabinet Coder: Test Connection** once).
2. Click the **+** at the top of the chat (a new chat). Model **qwen2.5-coder:14b**, mode **Agent**. Send:

```text
hello
```

Expected (not yet seen with a real server): after about 15 seconds, the editor's frame, then **The conversation is too long for this model: the server estimates about** a number near 50 000 **tokens for a window of 32768 tokens.** and the rest of the sentence. No file is created and no tool runs.

**What the agent must read before calling this part done:** in the extension's log, **one** line `status=413 ... alias=qwen2.5-coder:14b code=context_too_large` (under 10 ms), followed by five `code=context_too_large` lines with no `status=`. If there are six `status=413` lines, the editor's retries were not identical requests on the real server: a deviation to report, not to hide.

**Answer:** what the chat showed, in a few words.

## Part 3: clean up (you, then the agent, about 3 minutes)

**Terminal: Terminal (zsh)**, run by the agent after your click.

**You start with:** Part 2 done.
**You leave with:** the test instance quit, the test folders deleted, your normal profile and settings unchanged.

1. **Quit the test instance from its own Dock icon** (right-click its VS Code icon, **Quit**; lesson 16): closing its window is not enough on macOS. Your normal VS Code stays open. Say "quit".

Then the agent runs, in this order:

```bash
pgrep -f "x1e-vscode-data" | wc -l
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
rm -rf /Users/ydekpo/x1e-test-workspace /Users/ydekpo/x1e-vscode-data /Users/ydekpo/x1e-vscode-ext
```

Nothing was turned on on the server by this test, so nothing is undone there.

## Run record

- **Not played.** On 23 November 2026, before Part 0, the owner closed Lot X1e and chose the extension's own chat panel (decision D-026). Nothing of this script was run against the 0.2.3 package.
- What the agent did instead: checked that the measuring instance of Part A was quit (`pgrep -f "x1e-vscode-data"` gave `0`), that the owner's settings file still had the hash `90df2fbc...`, and that the normal profile still had `assistantcabinet.assistant-cabinet-coder-0.2.1` only; then deleted `/Users/ydekpo/x1e-test-workspace`, `/Users/ydekpo/x1e-vscode-data` and `/Users/ydekpo/x1e-vscode-ext`.
- Expected, never seen: that the editor's retries are byte-identical requests (one request in the stub's console instead of six), and the overflow sentence with the real server's numbers.
