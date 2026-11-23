# Human test X1d: Agent mode starts with a 32768-token model, on the Mac (about 20 minutes)

This test proves what Lot X1d changed (decision D-023): the extension now reports an input budget of 28672 tokens for a 32768-token model (it was 16384), so VS Code 1.147.0 no longer refuses Agent and Plan at once with "static system messages and tool definitions exceed this model's context budget". It runs against the **stub gateway** in its mode `small-model` (the model `cabinet-small`, window 32768, ceiling 16384), then against **the Mac's own server** (package 0.1.11, `IDE_ENABLED=on`, decision D-020) with `qwen2.5-coder:14b`.

Follows `docs/HUMAN-TESTS-PROTOCOL.md` and lessons 1, 2, 6, 10, 11, 13, 15 and 16 of `docs/LESSONS.md`. Every command is a Terminal (zsh) command on the Mac; **the agent runs every command that needs no click** and reads the outputs itself (the stub's console and the extension's log file in the test profile). You play the clicks.

## How this test is built

- **A separate VS Code profile**, as in X1b: its own data folder (`/Users/ydekpo/x1d-vscode-data`) and extensions folder (`/Users/ydekpo/x1d-vscode-ext`), and a scratch workspace (`/Users/ydekpo/x1d-test-workspace`). It starts signed out and cannot change your real settings or extensions; a hash of your real settings file is taken before and after. The package is installed **in the test profile only**, by the agent, with the `code` command (seen working in Part A of this lot); your normal VS Code window is not touched (lesson 10).
- **What Part A of this lot measured on VS Code 1.147.0 (19 November 2026)**, with a count-only build that was never committed: the editor never calls the extension's token estimate; an Agent turn sends a system message of 23647 characters and 59 tools (76601 characters of JSON), Plan 61 tools; probe models showed 24576 input tokens refused and 28672 accepted.
- **What the Mac's server will do (expected, not yet seen).** The server refuses a request whose characters divided by 2 exceed the model's window, and it counts the tool definitions in those characters (read in the server's `api/ide_openai.py` and `api/ide.py`, read-only). An Agent request of 1.147.0 holds about 101000 characters, about 50000 "estimated tokens", above 32768. So with `qwen2.5-coder:14b` **VS Code is expected to send the request, and the server to refuse it** with `context_too_large`; the extension shows its own sentence for that code and logs `code=context_too_large`. That refusal is a finding for the server project (decision D-024), not a failure of this lot. The owner chose this test on 19 November 2026 (option A).
- **Left out on purpose**, because X1b's run already proved it: Test Connection's dialogs, keys, HTTPS, the stop button, pictures, discovery (Part 5 of X1b proved `http://127.0.0.1:1975`); the stub's tool-call scenario (on 1.147.0 its fallback picks a terminal tool, lesson 11).
- **What this test cannot tell you:** whether a 32768-token model codes well in Agent mode. The stub's words are fixed, and the real model is expected to be refused by the server.

## Part 0: prepare (agent, about 2 minutes)

**Terminal: Terminal (zsh)**, run by the agent.

**You start with:** every VS Code test window closed (Cmd+Q in the test window of Part A; your normal window stays open), no blue **Update** button in the title bar of your normal window (lesson 1; if you see one, say so first).
**You leave with:** the package built, a fresh test profile with the stub's address, the package installed in it, the stub running.

The agent runs, in this order, and reads each output:

```bash
pgrep -f "x1d-vscode-data" | wc -l
```

Expected: `0` (the test instance of Part A has quit; lesson 16: processes, not the Dock).

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --version
```

Expected: `1.147.0` on the first line.

```bash
shasum -a 256 "/Users/ydekpo/Library/Application Support/Code/User/settings.json"
```

Expected: a hash (the "before"). On 19 November 2026 it began with `90df2fbc`.

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run package
```

Expected: ends with `DONE  Packaged: ...assistant-cabinet-coder-0.2.2.vsix (19 files, ...)`.

```bash
rm -rf /Users/ydekpo/x1d-test-workspace /Users/ydekpo/x1d-vscode-data /Users/ydekpo/x1d-vscode-ext
```

```bash
mkdir -p /Users/ydekpo/x1d-test-workspace /Users/ydekpo/x1d-vscode-data/User /Users/ydekpo/x1d-vscode-ext
```

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "http://127.0.0.1:8099"\n}\n' > /Users/ydekpo/x1d-vscode-data/User/settings.json
```

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --user-data-dir /Users/ydekpo/x1d-vscode-data --extensions-dir /Users/ydekpo/x1d-vscode-ext --install-extension /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder/assistant-cabinet-coder-0.2.2.vsix
```

Expected: the extension's folder `assistantcabinet.assistant-cabinet-coder-0.2.2` in `/Users/ydekpo/x1d-vscode-ext`.

```bash
lsof -nP -iTCP:8099 -sTCP:LISTEN
```

Expected: no output. Then the stub, which stays running:

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode small-model --port 8099
```

Expected: `Stub gateway listening on http://127.0.0.1:8099 (mode: small-model).`

## Part 1: the stub's cabinet-small starts Agent and Plan (you, about 5 minutes)

**Terminal:** none for you; the agent opens the test window with:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --user-data-dir /Users/ydekpo/x1d-vscode-data --extensions-dir /Users/ydekpo/x1d-vscode-ext --new-window /Users/ydekpo/x1d-test-workspace
```

**You start with:** Part 0 done, the test window open.
**You leave with:** one Agent turn and one Plan turn answered by `cabinet-small`.

1. **Make sure this is the test window (lesson 2):** its title contains `x1d-test-workspace`, and the Extensions view lists only **Assistant Cabinet Coder** (version **0.2.2**). Click **Continue without Signing In** and trust the folder if asked (Part A of this lot: **Yes, I trust the authors**). The status bar reads **Cabinet: connected**.
2. Open the chat. Model button: under **Assistant Cabinet Coder** choose **cabinet-small** (the picker shows `45K` beside it: the editor adds the input budget and the ceiling, 28672 + 16384; Part A showed `33K` with the old budget). Mode **Agent**. Send `hello`. Expected: **Hello from the stub, caf&eacute;.** (with an accented e), and **not** the message "static system messages and tool definitions exceed this model's context budget". No tool runs.
3. Same chat, same model. Type `/plan hello` and send it (Part A: Plan is chosen by typing `/plan`). Expected: the same answer from the stub.

The agent then reads the stub's console and the log file of the test profile. Expected: two log lines `call=chat status=200 ... alias=cabinet-small`.

**Answer:** what you saw at steps 2 and 3 ("answered" or the message you saw). A screenshot only if something else appears.

## Part 2: the Mac's own server with qwen2.5-coder:14b (you, about 8 minutes)

**Before you start, about the desktop application:** the server is shared with it. Loading `qwen2.5-coder:14b` can push out the model the desktop application uses (the Mac keeps at most two models loaded), and an answer of the desktop application at the same time makes both slower. With the expected refusal, the model may not even be loaded. Choose the moment. Nothing is changed on the server: no setting, no restart.

**Terminal: Terminal (zsh)**, run by the agent; then clicks.

**You start with:** Part 1 done.
**You leave with:** one Agent turn and one Plan turn sent to `qwen2.5-coder:14b`, and their log lines.

The agent stops the stub (Ctrl+C in its terminal), checks that the editor surface is on, and empties the test profile's settings so that discovery finds the Mac's server (VS Code reads the change by itself):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1975/ide/v1/models
```

Expected: `200`. A `404` means the surface is off: stop here.

```bash
printf '{}\n' > /Users/ydekpo/x1d-vscode-data/User/settings.json
```

1. The status bar reads **Cabinet: connected** within a few seconds (if not, run **Assistant Cabinet Coder: Test Connection** once).
2. Click the **+** at the top of the chat (a new chat). Model **qwen2.5-coder:14b**, mode **Agent**. Send `create a file named hello.txt in this folder that contains the word hello`. If VS Code asks to run a tool, allow only a tool that creates or edits a file (**Allow Once**) and click **Skip** for a terminal tool (lesson 11). Expected (not yet seen): **no** "static system messages..." message; after a short wait, the extension's sentence for the server's `context_too_large` refusal in the chat: **The conversation is too long for this model. Start a new chat or attach less.**, inside the editor's own frame (seen on 20 November 2026: "Sorry, your request failed... retried 5 times (total retry wait time: about 15 seconds) Last error: 502" followed by the sentence, and a **Try Again** button; lesson 19). The log then holds six `status=413 code=context_too_large` lines for one prompt. Write what you see, in a few words.
3. A new chat (**+**), same model. Send `/plan describe in three steps how to add a second line to hello.txt`. Expected (not yet seen): the same, no "static system messages..." message, then the server's refusal. Write what you see.

The agent then reads the log file of the test profile (duration, status, code, prompt tokens) and checks the scratch folder:

```bash
ls /Users/ydekpo/x1d-test-workspace
```

Expected: empty if the server refused (no `hello.txt`). If a file appeared, the agent prints its size with `wc -c`, never its content.

**Answer:** what you saw at steps 1 to 3.

## Part 2b: a large code model with a 65536-token window (you, about 10 minutes; added during the run of 20 November 2026)

Only when the server lists a code model with a window of 65536 tokens or more (decision D-024; on 20 November 2026, `devstral-2`, window 65536, ceiling 16384, checked by the agent with `curl -s http://127.0.0.1:1975/ide/v1/models`, read-only). **About the desktop application:** loading a model of 123B parameters takes minutes and can push out the desktop application's model; choose the moment.

**You start with:** Part 2 done, the test window open.
**You leave with:** one Agent turn that created `hello.txt` and one Plan turn, both answered by the large model.

1. A new chat (**+**). Model **devstral-2** (the picker shows `74K`: 57344 + 16384). Mode **Agent**. Send `create a file named hello.txt in this folder that contains the word hello`. Wait: the first word can take minutes (seen: about 4 minutes). If nothing comes after 10 minutes, click the stop button and say so. Allow only a tool that creates or edits a file (**Allow Once**); **Skip** a terminal tool. Expected: no refusal; `hello.txt` appears in the Explorer with **Keep** and **Undo**; an answer saying the file was created.
2. A new chat (**+**), same model. Send `/plan describe in three steps how to add a second line to hello.txt`. **Skip** any tool. Expected: an answer in steps, no refusal (seen: about 4 minutes, because Plan's prompt start differs from Agent's and is read again).

The agent then reads the log (expected: `status=200 alias=devstral-2` lines with their durations and prompt tokens) and prints the size of `hello.txt` with `wc -c` (expected `5`), never its content.

**Answer:** the number beside the model, about how long the first answer took, and what happened.

## Part 3: clean up (you, then the agent, about 3 minutes)

**Terminal: Terminal (zsh)**, run by the agent after your step 2.

**You start with:** Part 2 done.
**You leave with:** nothing left behind, and the proof that your real profile never saw version 0.2.2.

1. In the test window, Extensions view, click **Assistant Cabinet Coder**, then **Uninstall**.
2. **Quit the test VS Code completely**: with the test window in front, **Code > Quit Visual Studio Code** (Cmd+Q). If VS Code offers to save `hello.txt`, click **Don't Save**. Your normal window stays open. Say when it is done. (On 20 November 2026 the first check still found the test instance running: there are two VS Code icons in the Dock, and the quit must go to the test one; click its icon first, then Cmd+Q.) Every check below runs after this (lesson 6), and no check runs after the deletion.

```bash
pgrep -f "x1d-vscode-data" | wc -l
```

Expected: `0`.

```bash
cat /Users/ydekpo/x1d-vscode-ext/extensions.json; echo; cat /Users/ydekpo/x1d-vscode-ext/.obsolete
```

Expected: an empty list `[]`, and `.obsolete` naming `assistantcabinet.assistant-cabinet-coder-0.2.2` (lesson 16: the folder itself may still be there).

```bash
ls /Users/ydekpo/.vscode/extensions | grep -i cabinet
```

Expected: `assistantcabinet.assistant-cabinet-coder-0.2.1` only (installed by you on 18 November 2026, lesson 10), no `0.2.2`.

```bash
shasum -a 256 "/Users/ydekpo/Library/Application Support/Code/User/settings.json"
```

Expected: the same hash as in Part 0.

```bash
rm -rf /Users/ydekpo/x1d-test-workspace /Users/ydekpo/x1d-vscode-data /Users/ydekpo/x1d-vscode-ext
```

Nothing was turned on on the server by this test, so there is nothing to undo there (`IDE_ENABLED=on` stays, decision D-020).

## What was walked without you

Walked by the agent (19 November 2026, on the Mac): the full suite on the compiled output (the budget rule for 32768, 65536, 131072, 262144, the fallback and tiny windows, `cabinet-small` read from the stub, the estimate unchanged before and after calibration); the stub's `small-model` mode; the package built; the server's guard read in its source. Part A of this lot (the owner's clicks, the agent's count-only build) measured the editor's side.

Only you can walk: everything in the VS Code window. Not walked by anyone yet: a real Agent turn that creates a file with a real 32768-token model (refused by the server, see the run record).

## Run record

- Date and VS Code version: 19 and 20 November 2026, VS Code 1.147.0, macOS on the owner's Mac, signed out of GitHub, package `assistant-cabinet-coder-0.2.2.vsix` (19 files) in a throw-away profile; the Mac's server package 0.1.11 with `IDE_ENABLED=on`, its settings unchanged by this test. The agent ran Part 0, stopped the stub, checked the server's model list read-only, wrote the test profile's settings and read every log; the owner played every editor step. The Mac was shut down between Part 1 (19 November) and Part 2 (20 November); the test profile survived and the agent reopened the test window.
- Matched:
  - Part 0: VS Code 1.147.0; the package built; 0.2.2 installed in the test profile only; the stub listening in mode `small-model`.
  - Part 1: **Cabinet: connected**; **cabinet-small** in Agent answered **Hello from the stub, caf&eacute;.** and `/plan hello` answered the same, with no "static system messages" refusal; the log held `call=chat status=200 alias=cabinet-small` twice (prompt tokens 6105 and 7959 by the stub's count).
  - Part 2: the server listed `qwen2.5-coder:14b` with a window of 32768 (read-only `curl`, status 200); with an empty settings file the extension found the server by itself; in Agent and in Plan the editor sent the request (no "static system messages" refusal) and the server refused it with `context_too_large` (`status=413`, under 10 ms each, before any model was loaded), shown with the extension's sentence; no `hello.txt` was created.
  - Part 2b: the server listed `devstral-2` with a window of 65536 and a ceiling of 16384; the picker showed `74K`; the Agent turn created `hello.txt` (5 bytes, content not printed) with one tool call and answered "The file hello.txt has been created..."; the Plan turn answered; the log held `status=200 alias=devstral-2` lines: `ms=218739 prompt_tokens=21597 tool_calls=1`, then `ms=6253 prompt_tokens=21678 tool_calls=0` (Agent), and `ms=200912 prompt_tokens=23747 tool_calls=0` (Plan). Decision D-024 records these numbers.
  - Part 3: after the quit, no test process; `extensions.json` empty and `.obsolete` naming 0.2.2; the normal profile holds 0.2.1 only; the real settings file's hash unchanged (`90df2fbc...6143` before and after); the test folders deleted.
- Deviated:
  - Part 1 step 2: the picker showed `45K` beside **cabinet-small**, not `33K` (the editor adds input budget and ceiling); it confirms the new budget. The test was corrected.
  - Part 2 steps 2 and 3: the editor retried each refusal five times (six `status=413` lines per prompt, about 15 seconds) and framed the extension's sentence with "Failed to get response from the AI model; retried 5 times ... Last error: 502" (lesson 19). The test was corrected.
  - Part 2b (added during the run at the owner's request, devstral-2 having been installed meanwhile): the first answer of each chat took about four minutes; the owner found the model slow and is installing `gpt-oss:120b` to compare.
  - Part 3 step 2: the first check found the test instance still running (seven processes); the owner quit it from its own Dock icon, then every check passed. The test was corrected.
- Not shown: Agent with a real 32768-token model (refused by the server's guard, a server finding sent with `docs/SESSION/SERVER-PROMPT-development-mode.md`); a turn with `gpt-oss:120b` (not installed yet); Windows with this version.
