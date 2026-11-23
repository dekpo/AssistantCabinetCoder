# Human test P0b: the chat panel's agent and its tools on the Mac (about 35 minutes)

This test proves what Lot P0b built (decisions D-026 and D-030): the panel's agent loop and its four tools (`read_file`, `list_files`, `search_text`, `propose_edit`), a change **written only after Accept**, **Undo** that takes it back, a path outside the project refused, and **Stop** in the middle of the loop. It then measures what the Mac's two code models do with the tools, and ends with the owner's verdict on the panel and on the provider in the editor's chat.

Follows `docs/HUMAN-TESTS-PROTOCOL.md` and lessons 1, 2, 6, 10, 13, 16, 20, 22 and 26 of `docs/LESSONS.md`. Every command is a Terminal (zsh) command on the Mac; **the agent runs every command that needs no click** and reads the outputs itself (the stub's console, the extension's log, and the scratch project's files: they are test files written by the agent, so it may read them). You play the clicks.

## How this test is built

- **A separate VS Code profile**: its own data folder (`/Users/ydekpo/p0b-vscode-data`), extensions folder (`/Users/ydekpo/p0b-vscode-ext`) and a scratch project (`/Users/ydekpo/p0b-test-workspace`, a tiny calculator in Python written by the agent), plus one file **outside** the project (`/Users/ydekpo/p0b-outside.txt`) for the refusal. The package is installed **in the test profile only**, by the agent; your normal VS Code window is not touched (lesson 10). A hash of your real settings file is taken before and after.
- **What is measured where:** each step of the loop is one log line `call=chat ... step=N` (its `prompt_tokens`, its `ms`, and `tools=` the names the model called); each tool call is one line `call=tool tool=<name> outcome=<...>` (and `reason=` when it failed). A stop is judged on the stub's console and the log (lesson 13), a change on the file's hash, never on the screen.
- **The Mac's server** answered on 23 November 2026 with version **0.1.13**; `qwen2.5-coder:14b` and `gpt-oss:20b` both have a window of **32768** tokens, an output ceiling of 16384 and tool calling.
- **Left out on purpose:** the tools off in an untrusted folder or with a model without tool calling (unit-tested in `test/session-agent.test.ts`, the line it shows is drawn by `test/webview-agent.test.ts`), the creation of a new file by Accept (unit-tested; the real `WorkspaceEdit` is seen only for a change of an existing file), keys, HTTPS, the provider in the editor's chat (unchanged), Windows.

## Part 0: prepare (agent, about 3 minutes)

**Terminal: Terminal (zsh)**, run by the agent.

**You start with:** every VS Code test window quit (from the test instance's own Dock icon, lesson 16); your normal window open, with no blue **Update** button in its title bar (lesson 1; if you see one, say so first).
**You leave with:** the package 0.4.0 built, a fresh test profile pointed at the stub, the scratch project, the package installed in the test profile, the stub running, the test window open.

The agent runs, in this order, and reads each output:

```bash
pgrep -f "p0b-vscode-data" | wc -l
```

Expected: `0`.

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --version
```

Expected: `1.147.0` on the first line.

```bash
shasum -a 256 "/Users/ydekpo/Library/Application Support/Code/User/settings.json"
```

Expected: a hash (the "before"); on 23 November 2026 it began with `90df2fbc`.

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run package
```

Expected: ends with `DONE  Packaged: ...assistant-cabinet-coder-0.4.0.vsix (34 files, ...)`.

```bash
rm -rf /Users/ydekpo/p0b-test-workspace /Users/ydekpo/p0b-vscode-data /Users/ydekpo/p0b-vscode-ext /Users/ydekpo/p0b-outside.txt
```

```bash
mkdir -p /Users/ydekpo/p0b-test-workspace/calc /Users/ydekpo/p0b-test-workspace/tests /Users/ydekpo/p0b-vscode-data/User /Users/ydekpo/p0b-vscode-ext
```

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "http://127.0.0.1:8099"\n}\n' > /Users/ydekpo/p0b-vscode-data/User/settings.json
```

Then the agent writes the scratch project **with its file-writing tool** (lesson 18), six small files: `README.md` (one line, "A tiny calculator used to test a coding assistant."), `calc/__init__.py` (imports the three functions), `calc/operations.py` (`add`, `subtract` and `multiply`, each with a one-line docstring), `main.py` (prints `add(2, 3)` and `multiply(4, 5)`), `tests/test_operations.py` (one test per function) and `notes.txt` (two lines: "First line of the notes." and "Second line of the notes."); and outside the project `/Users/ydekpo/p0b-outside.txt` (one line, "This file is outside the project."). It records their hashes:

```bash
cd /Users/ydekpo/p0b-test-workspace && shasum -a 256 notes.txt calc/operations.py
```

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --user-data-dir /Users/ydekpo/p0b-vscode-data --extensions-dir /Users/ydekpo/p0b-vscode-ext --install-extension /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder/assistant-cabinet-coder-0.4.0.vsix
```

Expected: the folder `assistantcabinet.assistant-cabinet-coder-0.4.0` in `/Users/ydekpo/p0b-vscode-ext`.

```bash
lsof -nP -iTCP:8099 -sTCP:LISTEN
```

Expected: no output. Then the stub, which stays running (its console is read by the agent):

```bash
cd /Users/ydekpo/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --port 8099
```

Expected: `Stub gateway listening on http://127.0.0.1:8099 (mode: ok).` Then the test window:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --user-data-dir /Users/ydekpo/p0b-vscode-data --extensions-dir /Users/ydekpo/p0b-vscode-ext --new-window /Users/ydekpo/p0b-test-workspace
```

## Part 1: the stub, the tools, Reject, Accept, Undo and the outside path (you, about 8 minutes)

**Terminal:** none for you.

**You start with:** Part 0 done, the test window open.
**You leave with:** three tool lines seen, one change rejected, one accepted then undone, one path refused; `notes.txt` back as it was.

1. **Make sure this is the test window (lesson 2):** its title contains `p0b-test-workspace`, and the Extensions view lists only **Assistant Cabinet Coder** (version **0.4.0**). Click **Continue without Signing In** if asked. When VS Code asks whether you trust the authors of the folder, click **Yes, I trust the authors** (the tools work only in a trusted folder). The status bar reads **Cabinet: connected**. Open the tab **Assistant Cabinet Coder** in the right side bar. Expected: no line saying that the tools are off. In the model pill at the bottom choose **cabinet-chat**.
2. Send:

```text
[stub:agent-steps:calc/operations.py] explain
```

Expected (not yet seen in the editor): inside the answer, three compact lines, each with an icon: **List** `.` with the note `5 entries` (`calc/`, `tests/`, `README.md`, `main.py`, `notes.txt`); **Read** `calc/operations.py` with `lines 1-... of ...`; **Search** `a` with a number of matches; then the text **Closing answer from the stub.** No file content appears in those lines.

3. Send:

```text
[stub:agent-edit:notes.txt] edit
```

Expected (not yet seen): a line **Read** `notes.txt`, then a line **Edit** `notes.txt` with a frame and three icons on its right (two panes, a cross, a check mark; hover each: **Show the change**, **Reject**, **Accept**); the answer says **Waiting for your decision**; VS Code opens a diff view titled `notes.txt (proposed change)` whose right side adds ` [edited by the stub]` to the first line. **Click the cross (Reject).** Expected: the diff closes, the line's note reads `rejected`, then **Closing answer from the stub.**

4. Send the same message again:

```text
[stub:agent-edit:notes.txt] edit
```

This time click the **two panes** icon once (the diff view comes to the front again if you had moved away), then **the check mark (Accept)**. Expected: the diff closes, `notes.txt` opens in the editor with its first line ending in ` [edited by the stub]`, with no dot of unsaved changes on its tab; the line's note reads `accepted`.

5. Click inside `notes.txt` in the editor and press **Cmd+Z**. Expected: the first line is back to `First line of the notes.` and the tab shows a dot (not saved). Press **Cmd+S**.
6. Send:

```text
[stub:agent-steps:../p0b-outside.txt] read
```

Expected: the **Read** line shows `../p0b-outside.txt` with the note `outside the project folder`; nothing of that file appears anywhere.

**What the agent must read before calling this part done (lesson 22):** in the stub's console, 4 `start scenario=agent-steps` lines for step 2 (each `tools=4`), 3 `agent-edit` lines for step 3 and 3 for step 4, 4 `agent-steps` lines for step 6, each with `complete=true`; in the extension's log (every `*Cabinet*.log`, lesson of P0a's run record), `call=chat` lines with `step=1` to `step=4`, `call=tool` lines with `tool=list_files`, `read_file`, `search_text` and `outcome=done`, one `tool=propose_edit outcome=rejected`, one `tool=propose_edit outcome=accepted`, one `tool=read_file outcome=failed reason=outside_workspace`, and no path, file name or text; and the hash of `notes.txt` equal to Part 0's (after the Undo and the save):

```bash
find /Users/ydekpo/p0b-vscode-data/logs -name "*Cabinet*.log" -exec grep -h "call=" {} \;
```

```bash
cd /Users/ydekpo/p0b-test-workspace && shasum -a 256 notes.txt
```

**Answer:** what steps 2 to 6 showed, in a few words, and a screenshot of step 3 (the line with its three icons and the diff view).

## Part 2: the stub, Stop in the middle of the loop and while a change waits (you, about 4 minutes)

**Terminal:** none for you.

**You start with:** Part 1 done.
**You leave with:** two stopped loops, no file changed.

1. Click **+** (new conversation). Send:

```text
[stub:agent-loop:calc/operations.py] loop
```

Expected: a new **Read** line every 5 seconds (`npm run stub` paces this scenario so that the loop lasts about a minute). **Take your time; click the square (Stop) whenever you like before the loop ends.** Expected: no new line after the click; **Stopped.** under the answer (or, when the click falls while the next step is being read, the sentence that begins "Stopped before the first word arrived"); the arrow button is back. The agent checks in the stub's console and the log that nothing was sent after the click.

2. Send:

```text
[stub:agent-edit:notes.txt] edit
```

When the **Edit** line shows its three icons, **click the square (Stop) instead of a decision.** Expected: the diff closes, the line's note reads `stopped`, **Stopped.** under the answer, and `notes.txt` is unchanged.

**What the agent must read before calling this part done (lesson 22):** in the stub's console, the `agent-loop` lines stop at the click (no `start` after it; the last one may say `complete=false`) and fewer than 12 of them; for step 2, exactly 2 `agent-edit` lines (no third step); in the log, `code=cancelled` or `outcome=stopped` at the end of each loop and no `outcome=accepted`; the hash of `notes.txt` unchanged:

```bash
find /Users/ydekpo/p0b-vscode-data/logs -name "*Cabinet*.log" -exec grep -h "call=" {} \; | tail -20
```

```bash
cd /Users/ydekpo/p0b-test-workspace && shasum -a 256 notes.txt
```

**Answer:** what steps 1 and 2 showed, in a few words.

## Part 3: the Mac's own server, three tasks for `qwen2.5-coder:14b` (you, about 9 minutes)

**Before you start, about the desktop application:** the server is shared with it. Parts 3 and 4 **load `qwen2.5-coder:14b`** (about 9 GB) and then **`gpt-oss:20b`** (about 13 GB). The Mac keeps at most two models loaded, so this **will** push out the model the desktop application uses and make its next answer slow; an editor answer at the same time as a desktop one slows both. Nothing is changed on the server: no setting, no restart. **Choose the moment**, and say "go".

**Terminal: Terminal (zsh)**, run by the agent; then clicks.

**You start with:** Part 2 done.
**You leave with:** three tasks of `qwen2.5-coder:14b` measured, and `calc/operations.py` as the accepted edit left it.

The agent stops the stub (Ctrl+C in its terminal), checks the server and the models (lesson 15: a real model, a real window), and empties the test profile's settings so that discovery finds the Mac's server:

```bash
curl -s http://127.0.0.1:1975/health | grep -o '"version": *"[^"]*"'
```

Expected: `"version":"0.1.13"` or newer (the agent says which).

```bash
curl -s http://127.0.0.1:1975/ide/v1/models | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const m of JSON.parse(s).data){if(/^(qwen2.5-coder:14b|gpt-oss:20b)$/.test(m.id))console.log(m.id,m.context_window,m.max_output_tokens,m.capabilities.tools)}})'
```

Expected: two lines, `gpt-oss:20b 32768 16384 true` and `qwen2.5-coder:14b 32768 16384 true` (another window: the agent says so before going on).

```bash
printf '{}\n' > /Users/ydekpo/p0b-vscode-data/User/settings.json
```

The status bar reads **Cabinet: connected** within a few seconds; the model pill lists the server's models. For each task: click **+** first (a new conversation, lesson 26), choose **qwen2.5-coder:14b**, send the text, and wait for the end (the arrow button comes back). Say "done" after each task; the agent reads the log and the file before the next one.

1. **Task 1, read.** Send:

```text
Explain what calc/operations.py does.
```

Expected: the model reads the file (a **Read** line, maybe a **List** line first), then explains the three functions.

2. **Task 2, search.** Click **+**, choose the model again if needed, send:

```text
Where is the function multiply defined? Give the file and the line.
```

Expected: a **Search** line (or **Read** lines), then `calc/operations.py` and the right line number.

3. **Task 3, edit.** Click **+**, send:

```text
Add a function divide(a, b) to calc/operations.py that raises ValueError when b is 0.
```

Expected: a **Read** line, then an **Edit** line with its three icons and the diff view. **Look at the diff:** if it adds a correct `divide` without breaking the rest, click **Accept**; otherwise click **Reject** and say why. If the model answers without proposing an edit, say so.

**What the agent must read for each task:** the log lines of the task: the number of `step=` lines (the steps), the sum of their `ms` (the time) and the first one's `first_ms`, the **`prompt_tokens` of `step=1`** (measure (a): a few thousand expected, against 21 597 for the editor's Agent request), the `tools=` names, every `call=tool` line's `outcome=` and `reason=` (a `reason=invalid_arguments` or `unknown_tool` means a call that was not valid), any `code=` (a failure, for example `context_too_large`); after task 3, the content of `calc/operations.py` (a test file), to judge whether the result is right:

```bash
find /Users/ydekpo/p0b-vscode-data/logs -name "*Cabinet*.log" -exec grep -h "call=" {} \; | tail -30
```

```bash
cat /Users/ydekpo/p0b-test-workspace/calc/operations.py
```

**Answer:** after each task, "done" and what the panel showed in a few words (was the answer right?).

## Part 4: the Mac's own server, the same three tasks for `gpt-oss:20b` (you, about 9 minutes)

**Terminal: Terminal (zsh)**, run by the agent first.

**You start with:** Part 3 done.
**You leave with:** three tasks of `gpt-oss:20b` measured.

The agent puts `calc/operations.py` back as Part 0 wrote it, **with its file-writing tool**, and checks its hash against Part 0's:

```bash
cd /Users/ydekpo/p0b-test-workspace && shasum -a 256 calc/operations.py
```

Then the same three tasks as Part 3, each in a new conversation (**+**), with **gpt-oss:20b** chosen in the pill, the same texts, the same decision on the diff. The first task loads the model: **Reading the request** may last longer.

**What the agent must read for each task:** the same as Part 3.

**Answer:** after each task, "done" and what the panel showed in a few words.

## Part 5: the owner's verdict (you, about 2 minutes)

No click. The agent first gives a short table of Parts 3 and 4 (per model and task: steps, time, valid calls, right result, `prompt_tokens` of the first step). Then you answer three questions, recorded as a decision:

1. **The panel:** _Go_ (the next lots build on it), _Go with changes_ (say which), or _Stop_.
2. **The provider in the editor's chat** (frozen at 0.2.3, still registered): kept, or removed in the next lot.
3. **The order of the next lots** planned again on the panel: images, documents, the server's agent catalogue, the release (and the copy button on code blocks, if you want it).

## Part 6: clean up (you, then the agent, about 3 minutes)

**Terminal: Terminal (zsh)**, run by the agent after your click.

**You start with:** Part 5 done.
**You leave with:** the test instance quit, the test folders deleted (the test conversations with them), your normal profile and settings unchanged.

1. **Quit the test instance from its own Dock icon** (right-click its VS Code icon, **Quit**; lesson 16). Your normal VS Code stays open. Say "quit".

Then the agent runs, in this order:

```bash
pgrep -f "p0b-vscode-data" | wc -l
```

Expected: `0`. Anything else: the agent stops and asks you to quit the test instance again; nothing below runs before `0` (lesson 6).

```bash
shasum -a 256 "/Users/ydekpo/Library/Application Support/Code/User/settings.json"
```

Expected: the same hash as in Part 0.

```bash
ls /Users/ydekpo/.vscode/extensions | grep -i cabinet
```

Expected: the same list as before the test (your normal profile is untouched by it; on 23 November 2026, `assistantcabinet.assistant-cabinet-coder-0.2.1`).

```bash
rm -rf /Users/ydekpo/p0b-test-workspace /Users/ydekpo/p0b-vscode-data /Users/ydekpo/p0b-vscode-ext /Users/ydekpo/p0b-outside.txt
```

Nothing was turned on on the server by this test, so nothing is undone there. The two models stay loaded until the model engine unloads them by itself after a few idle minutes.

## Walked by the agent before the run (23 November 2026)

- `npm test`: 473 tests, all passing (395 before the lot); `npm run lint` and `npx prettier --check .` clean. The package `assistant-cabinet-coder-0.4.0.vsix` was built (34 files, 98.2 KB: three new compiled modules, `agent`, `tools`, `workspace`).
- The whole loop ran without the editor, against the stub's new scenarios and a real temporary folder (`test/session-agent.test.ts`): four steps with three tool lines; an edit shown, nothing written while it waits, applied after Accept, left alone after Reject; Stop while a change waits (no further step, nothing applied) and in the middle of the loop (no request after the stop); the 12-step limit; the tools off in an untrusted workspace, with no folder and with `cabinet-plain`; the steps saved in format 2 and shown again by a new session; no file content, path or argument in the log; one model list shared with the status bar.
- The path rules on real folders (`test/workspace.test.ts`): `..`, absolute paths, a symbolic link to a file and to a folder outside, a file to create under a linked folder outside, a large file, a binary file, bytes that are not UTF-8, `.git` and `node_modules` skipped, a regular expression's characters searched as text.
- Read-only on the Mac's server: `/health` version 0.1.13; `qwen2.5-coder:14b` and `gpt-oss:20b` window 32768, ceiling 16384, tools true.
- **Not walked**, the owner's part: everything in the editor (the trust prompt, the diff view, Accept through the real `WorkspaceEdit`, Cmd+Z, the look of the tool lines in the theme) and everything against the real server.

## Run record

23 November 2026, on the Mac, VS Code 1.147.0, package 0.4.0 (34 files, 98.33 KB) installed in the test profile only, server 0.1.13. Walked in the chat one step at a time; the agent read the stub's console, the extension's log and the files. Times in the log are UTC.

- **Part 0:** no test instance before; the owner's settings hash `90df2fbc142df561...`; the scratch project written by the agent (hashes `notes.txt` `39cf5bfe...`, `calc/operations.py` `cd9c2ef1...`); the stub on 8099. At start the log showed **two** `call=models` lines instead of P0a's three: the status bar and the panel now share one request.
- **Part 1, passed.**
  - Step 2: 4 requests, each `tools=4`, `complete=true`; the log `step=1` to `step=4` with `tools=list_files`, `read_file`, `search_text`, each `call=tool ... outcome=done`. The panel showed **List** `.` `5 entries`, **Read** `calc/operations.py` `lines 1-13 of 13`, **Search** `a` `20 matches`, then the closing text; no content in the lines.
  - Step 3: the diff view `notes.txt (proposed change)` opened by itself; the **Edit** line was framed with its three icons and **Waiting for your decision (20 s)**. Reject: `call=tool ms=79582 tool=propose_edit outcome=rejected`, then one closing request.
  - Step 4: Accept: `outcome=accepted`; `notes.txt` opened in the editor with the suffix and no unsaved mark.
  - Step 5: Cmd+Z then Cmd+S: the hash of `notes.txt` back to `39cf5bfe...` (Undo works on the change).
  - Step 6: `call=tool tool=read_file outcome=failed reason=outside_workspace`; the panel's note **outside the project folder**.
  - No path, file name or text in the log.
  - Seen, to fix later: the target `.` of **List** reads like the separator dot.
- **Part 2, passed after a fix of the stub.**
  - Step 1: the loop was stopped during the 4th request: the stub `ms=536 complete=false`, the log `code=cancelled step=4`, nothing sent after. Because the click fell while that step was being read, the note was the sentence "Stopped before the first word arrived..."; that is the intended wording (kept).
  - Step 2, first try: the message `[stub:agent-edit:notes.txt] edit` sent after the stopped loop **replayed the loop** (three reads). The extension had sent the right conversation; the stub took a user message right after a `tool` message for a tool's image and read the old marker (lesson 28). The stub was fixed (a plain-text user message is a real one), a test was added (474 tests), the stub restarted.
  - Step 2, replayed in a new conversation: Stop while the change waited: `propose_edit outcome=stopped`, exactly 2 requests, the diff closed, `notes.txt` unchanged; the next message in the same conversation ran `agent-edit` again (Read, Edit, Reject `outcome=rejected`, closing).
  - The step "click Stop when three or four lines are there" (one line per second) asked the owner for a fast action; the owner's rule of that day (AGENTS.md: no action faster than about 20 seconds) led to pacing the stub's `agent-loop` at 5 seconds a step in `npm run stub` and to rewriting the step.
- **Part 3, `qwen2.5-coder:14b`: the model never called a tool.** In all three tasks it wrote the call as plain text in its answer (`{"name": "read_file", "arguments": {"path": "calc/operations.py"}}`, then a `json` code block for `search_text`, then `read_file` again), with no `tool_calls`; the loop therefore ended after one step with that text as the answer.
  - Read: `ms=1690 prompt_tokens=666 completion_tokens=20 first_ms=1325 step=1`.
  - Search: `ms=704 prompt_tokens=671 completion_tokens=29 first_ms=136`.
  - Edit: `ms=678 prompt_tokens=679 completion_tokens=28 first_ms=141`; `calc/operations.py` unchanged.
- **Part 4, `gpt-oss:20b`: three tasks right, every call valid.**
  - Read: 5 steps (List `.`, List `calc`, Read `calc/operations.py`, Read `README.md`, answer), model time 6.2 s (first step `first_ms=2838`, the model loading), `prompt_tokens` 585 then 632, 674, 810, 874; the explanation was right. It used a Markdown table, which the panel does not draw (the pipes show): to fix.
  - Search: 4 steps (List, Search `multiply` 8 matches, Read, answer), 1.8 s, `prompt_tokens` 591 to 934; the answer "line 11 of `calc/operations.py`" is right.
  - Edit: 7 steps, 6 calls (List, Read, List `tests`, Read the tests, Read again, `propose_edit`), model time about 12.3 s (the edit's step `ms=7180 completion_tokens=809`), then 34.8 s of the owner's review; Accept `outcome=accepted`; the agent ran the result: `divide(6, 3)` gives `2.0`, `divide(1, 0)` raises `ValueError: Cannot divide by zero`. The final sentence was written **in Polish** although the message was English: the system prompt's language sentence is not enough for this model.
  - Steps 2 and later started in 0.1 to 0.35 s: the engine reuses the prompt start of the previous step.
  - Measure (a): the first request of a task is **585 to 679 prompt tokens** (system prompt, four tools and the message), against 21 597 for the editor's Agent request; the largest request of the run was 1 387 tokens.
- **Part 5, the owner's verdict (decision D-031):** the panel **Go with changes**; the provider in the editor's chat **removed** in the next lot; the plain-text tool calls of `qwen2.5-coder` **to be seen with the server** (its Lot 46), `gpt-oss` advised for the agent meanwhile; the next lots: **finishing the panel first** (P1), then documents and images, then the agent catalogue, then the release.
- **Part 6:** the test instance quit from the Dock (`pgrep` gave `0`); the settings hash unchanged; the normal profile still has `assistantcabinet.assistant-cabinet-coder-0.2.1` only; the test folders and the outside file deleted. Nothing was turned on on the server.
