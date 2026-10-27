# Human test X0: the spike (about 40 minutes)

This test measures what VS Code really does with a model provider extension, before the real extension is designed. It uses the throw-away probe in `spike/` (vendor `cabinetspike`, two scripted models). The probe answers from a script and writes **structure only** to its log: numbers, names and kinds, never message text.

Follows `docs/HUMAN-TESTS-PROTOCOL.md`. Every command is Git Bash. Expectations marked **(not yet seen)** come from the VS Code documentation of 21 October 2026 or from the code of the installed VS Code, not from a run: the point of this test is to replace them with what you see.

## How this test is built

- **A separate VS Code profile.** The test opens VS Code with its own data folder and its own extensions folder, so it starts **signed out of GitHub**, with no Copilot, and it **cannot change your real settings or extensions**. This is the situation of a new user who only has our server. Do not sign in to anything in that window. A hash of your real user settings file is taken before and after, as proof that nothing changed (that is the backup and the restore of this test).
- **Where the answers come from.** After each part, one command prints what the probe logged since the previous one. Paste its output into the chat. If the command prints nothing, use the fallback: in VS Code open **View > Output**, choose **Cabinet Spike** in the dropdown on the right, click in the text, press Ctrl+A then Ctrl+C, and paste.
- **Keep the same Git Bash window open for the whole test** (the dump command remembers where it stopped).
- Where an on-screen label may differ from the one written here, write the label you really see in brackets in your answer.
- **Left out on purpose:** the server, the key, the real provider (later lots); the Copilot features themselves.

## Part 0: prepare (Git Bash, about 5 minutes)

**You start with:** a closed VS Code (the test window is a separate one; your normal window may stay open), Git Bash, the repository on branch `feat/x0-spike`.
**You leave with:** a test folder with four files, the probe package checked, and a hash of your real user settings noted.

Version and channel of VS Code (answers part of (a)):

```bash
code --version
```

Expected: three lines (version, commit, architecture). On 27 October 2026 the version was `1.142.0`. **An update to 1.143.1 is already downloaded on this machine** (a second folder next to the first one), so the test window may start in 1.143.1 after VS Code applies it. The version that counts is the one the probe prints on its `env vscode=...` line in Part 1; write both.

```bash
grep -h '"quality"' "$(dirname "$(dirname "$(which code)")")"/*/resources/app/product.json
```

Expected: two identical lines `"quality": "stable"` (one per installed version folder). If you see `insider`, write it down: it is a finding.

Proof that your real settings are untouched (the "before"). Note the line it prints:

```bash
sha256sum "/c/Users/dwyol/AppData/Roaming/Code/User/settings.json"
```

Expected: a hash and the file name. If the file does not exist, write "no settings file" and go on.

The probe package must exist:

```bash
ls -l /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder/spike/cabinet-spike-0.0.1.vsix
```

Expected: a file of about 8 kilobytes. If it is missing, build it with `cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run spike:package`, then run the `ls` again.

Create the three folders:

```bash
mkdir -p /c/Users/dwyol/x0-test-workspace/.vscode /c/Users/dwyol/x0-vscode-data /c/Users/dwyol/x0-vscode-ext
```

A text file, and a workspace settings file that tries to override the machine-scoped setting (question (g)):

```bash
printf 'line one\nline two\nline three\n' > /c/Users/dwyol/x0-test-workspace/hello.txt
```

```bash
echo '{ "cabinetSpike.machineSetting": "from-workspace" }' > /c/Users/dwyol/x0-test-workspace/.vscode/settings.json
```

A 16-pixel PNG, made by the probe's own code:

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && node -e 'require("fs").writeFileSync(process.argv[1], require("./spike/out/src/png").makePng16())' /c/Users/dwyol/x0-test-workspace/pic.png
```

A tiny one-page PDF:

```bash
node -e 'const o=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>","<< /Length 39 >>\nstream\nBT /F1 18 Tf 20 50 Td (Spike PDF) Tj ET\nendstream","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];let s="%PDF-1.4\n";const x=[];o.forEach((b,i)=>{x.push(s.length);s+=`${i+1} 0 obj\n${b}\nendobj\n`});const r=s.length;s+=`xref\n0 ${o.length+1}\n0000000000 65535 f \n`+x.map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+`trailer\n<< /Size ${o.length+1} /Root 1 0 R >>\nstartxref\n${r}\n%%EOF\n`;require("fs").writeFileSync(process.argv[1],s)' /c/Users/dwyol/x0-test-workspace/doc.pdf
```

```bash
ls -la /c/Users/dwyol/x0-test-workspace
```

Expected: `hello.txt` (29 bytes), `pic.png` (93 bytes), `doc.pdf` (about 580 bytes) and the `.vscode` folder.

**Paste back:** the output of the four commands `code --version`, `grep`, `sha256sum` and the last `ls`.

## Part 1: sign-in, install, models, modes (about 10 minutes) [questions (a) and (b)]

**You start with:** Part 0 done.
**You leave with:** the probe installed in the test window, and a list of what the chat offers without any sign-in.

Open the test window (a new VS Code window opens; it looks like a first start):

```bash
code --user-data-dir "$(cygpath -w /c/Users/dwyol/x0-vscode-data)" --extensions-dir "$(cygpath -w /c/Users/dwyol/x0-vscode-ext)" "$(cygpath -w /c/Users/dwyol/x0-test-workspace)"
```

In that window, in this order:

1. If a box asks whether you trust the authors of the folder, click **Yes, I trust the authors** (without trust, VS Code ignores workspace settings and question (g) would be meaningless). Close any welcome page. If you are offered to sign in, to turn on settings sync or to set up Copilot, **refuse**.
2. **Signed-out check.** Click the **Accounts** icon (a person, bottom of the left bar). Expected: no GitHub account is listed and the menu offers to sign in (for example "Sign in with GitHub to use ..."). If a GitHub account is listed, click it, then **Sign Out**, and write that down. Note what the status bar and the chat view say about Copilot.
3. Open the Extensions view (the four-squares icon, or Ctrl+Shift+X). Click the **...** at the top right of that view (**Views and More Actions...**), then **Install from VSIX...**, pick `C:\Users\dwyol\Documents\CURSOR\AssistantCabinetCoder\spike\cabinet-spike-0.0.1.vsix`, click **Install**.
   Expected: "Cabinet Spike (throw-away probe)" appears in the installed list. Write down whether VS Code asks for **Reload** / **Restart Extensions** and what you did. Do **not** run any Spike command yet.
4. Open the chat view (Ctrl+Alt+I, or the chat icon in the title bar). Write down what it shows: the chat input, or a "sign in / set up" screen with no input.
5. **Model picker.** Click the model name at the bottom of the chat box. Write down **every entry exactly as written**. Expected (not yet seen): **Spike Tools Model** and **Spike Plain Model** (with the vendor in some form).
   - If neither shows up: click **Manage Models...** (or run **Chat: Manage Language Models** from Ctrl+Shift+P), write what you see, then run **Spike: Log Info** from Ctrl+Shift+P and look at the picker again. Write which of these made the models appear.
6. **Modes.** The chat box has a mode picker with **Ask**, **Agent**, **Plan** (labels may differ). Find the **Session Target** setting and set it to **Local**. For each of the three modes, open the model picker and write which of the two spike models is listed. Expected (not yet seen): **Spike Plain Model** (no tool calling) is missing in Agent and in Plan, and present in Ask.
7. **What the picker says when something is missing:** copy the exact words of any message, tooltip or empty-state text about a missing model, a missing sign-in or a missing plan.

Print what the probe logged:

```bash
LOG=$(find /c/Users/dwyol/x0-vscode-data/logs -name '*Cabinet Spike*.log' | sort | tail -1); [ "$LOG" = "$PREV" ] || MARK=0; tail -n +$((MARK+1)) "$LOG"; MARK=$(wc -l < "$LOG"); PREV=$LOG
```

Expected: a first line `activate`, an `env ...` line with the VS Code version and `remoteName=none`, and `provideLanguageModelChatInformation silent=... models=2` once or more (the value of `silent` is a finding). If the command prints nothing at all, use the fallback in "How this test is built".

**Paste back:** your written answers to steps 2 to 7, then the dump.

## Part 2: what a turn hands to the provider (about 8 minutes) [question (c)]

**You start with:** Part 1 done, **Spike Tools Model** selected.
**You leave with:** three requests in the log, one per mode.

In each of the three turns, start with a new chat (the **New Chat** button, a plus sign at the top of the chat view), pick the mode, keep **Spike Tools Model**, type the short word shown and press Enter.

1. Mode **Ask**, type `hello`. Expected (not yet seen): the reply "Spike plain answer."
2. Mode **Agent**, type `hello`. Expected (not yet seen): the probe calls the first tool whose name contains `read`; VS Code may ask you to confirm or show an error for it; then the reply "Spike closing answer." If a confirmation box appears, click **Allow** (or **Continue**) once.
3. Mode **Plan** (or type `/plan hello` in a new chat in Agent mode, if there is no Plan mode in the picker). Same expectation as 2. If it asks questions or loops more than three times, press Stop and say so.

Print what the probe logged:

```bash
LOG=$(find /c/Users/dwyol/x0-vscode-data/logs -name '*Cabinet Spike*.log' | sort | tail -1); [ "$LOG" = "$PREV" ] || MARK=0; tail -n +$((MARK+1)) "$LOG"; MARK=$(wc -l < "$LOG"); PREV=$LOG
```

Expected: for each turn a `request` line (messages, firstMessageChars, toolMode, tools, modelOptionsKeys), the `options.tools names` line, one `msg[...]` line per message, the `lm.tools` line and a `reply` line. There may be extra `request` lines you did not cause (title or summary requests): count them, they are a finding.

**Paste back:** the dump, and which of the three turns showed the expected reply on screen.

## Part 3: images and attachments (about 10 minutes) [questions (d) and (e)]

**You start with:** Part 2 done, **Spike Tools Model** selected, mode **Ask**.
**You leave with:** one request per attachment kind in the log.

Do these seven turns **in this order**, each in a new chat, each with the text `hi` (write on paper which number was which if you change the order):

1. **Pasted image.** Press Win+Shift+S, drag a small rectangle on the screen, then click in the chat box, press Ctrl+V and send. Write whether the chat shows an image pill.
2. **Attached PNG.** Click the paperclip (**Add Context...**) > **Files & Folders...** (or **Files...**) and pick `pic.png`. Send.
3. **Attached text file.** Same menu, pick `hello.txt`. Send.
4. **Selection.** Open `hello.txt` in the editor, select the second line with the mouse, go back to the chat box, type `#selection` (pick it in the list), then ` hi`. Send.
5. **`#file` reference.** Type `#file:hello.txt` (pick it in the list), then ` hi`. Send.
6. **PDF.** Add `doc.pdf` the same way as step 2. Send. Write down any error or warning the editor shows (for example "not supported").
7. **Tool-result image (question (e)).** Switch to mode **Agent**, new chat, type `call the tool spike_image`. Expected (not yet seen): the probe calls `spike_image`, VS Code runs it (a confirmation may appear: click **Allow**), and the **next** request carries the image inside a tool result.

For turn 1, if the chat refuses the image, write the exact message, then select **Spike Plain Model**, paste an image again and write what happens (a model without image input).

Print what the probe logged:

```bash
LOG=$(find /c/Users/dwyol/x0-vscode-data/logs -name '*Cabinet Spike*.log' | sort | tail -1); [ "$LOG" = "$PREV" ] || MARK=0; tail -n +$((MARK+1)) "$LOG"; MARK=$(wc -l < "$LOG"); PREV=$LOG
```

Expected: `data:image/png:<bytes>b` or `data:image/jpeg:...` parts for the images, `text:<n>` parts for the text file, selection and `#file`, and for the PDF either a `data:application/pdf:...` part, a text part or nothing. In turn 7, the last request shows `toolResult[data:image/png:93b]`.

**Paste back:** the dump, the number order you used, and the messages of any error.

## Part 4: agent, tools, setting (about 8 minutes) [questions (f), (g), (i), (j), (k)]

**You start with:** Part 3 done.
**You leave with:** answers about the shipped agent, the tool names, the setting and the `when` clause.

1. **Shipped agent (f).** Open the agent picker (the mode picker of the chat box). Write whether **Spike Agent** is listed and under what heading. If it is: new chat, pick it, keep **Spike Tools Model**, type `hello`, send. Expected (not yet seen): the request is made with `model=spike-tools` (the agent file has no `model`, so the selected model is used) and the `options.tools names` line holds only the tools of the `read` group, not the whole editor list. Write the exact string the model picker shows for **Spike Tools Model** (hover it if there is a tooltip): this is what a `model:` field of an agent file must contain.
2. **Tool names (i).** The dump of step 1 holds `options.tools names=[...]` and `lm.tools names=[...]`. Write whether the editor's own file and search tools (names like `read`, `readFile`, `search`, `edit`, `terminal`) are among `options.tools` of an Agent turn made with a spike model and **no sign-in**.
3. **The `when` clause (k).** Run **Spike: Log Info** from Ctrl+Shift+P. In the dump, read the `lm.tools` line: is `spike_gated` listed while the key is false? Then click the tools icon in the Agent chat box (**Configure Tools...**) and write whether **Spike Gated** is listed. Now run **Spike: Toggle Gated Tool** (a message says the key is now true), then **Spike: Log Info** again and look at the same two places. Expected (not yet seen): absent while false, present while true.
4. **Machine setting (g).** The line `setting machineSetting effective=... user=... workspace=... workspaceFolder=...` of the second **Spike: Log Info** shows the value. Expected (not yet seen): `effective="default"`; the workspace file value `from-workspace` must **not** be the effective value. Also open Settings (Ctrl+,), search `cabinetSpike`, click the **Workspace** tab and write whether a warning says the setting cannot be applied there.
5. **Telemetry and chat settings (j).** The list below comes from the installed VS Code. In Settings, search `telemetry` and write the value shown for `telemetry.telemetryLevel`. Search `chat.disableAIFeatures` and write its value.

```bash
grep -h -o '"telemetry\.[A-Za-z.]*"' "$(dirname "$(dirname "$(which code)")")"/*/resources/app/out/vs/workbench/workbench.desktop.main.js | sort -u | grep -E 'telemetryLevel"$|enableCrashReporter|feedback|captureContent|enableTelemetry'
```

Expected: five names, `"telemetry.captureContent"`, `"telemetry.enableCrashReporter"`, `"telemetry.enableTelemetry"`, `"telemetry.feedback.enabled"` and `"telemetry.telemetryLevel"` (read from the installed bundles before this test).

Print what the probe logged:

```bash
LOG=$(find /c/Users/dwyol/x0-vscode-data/logs -name '*Cabinet Spike*.log' | sort | tail -1); [ "$LOG" = "$PREV" ] || MARK=0; tail -n +$((MARK+1)) "$LOG"; MARK=$(wc -l < "$LOG"); PREV=$LOG
```

**Paste back:** your answers to steps 1 to 5, the `grep` output and the dump.

## Part 5: remote window (optional, about 8 minutes) [question (h)]

Skip this part if you have neither WSL nor an SSH machine, and write "not tested". Everything here is **(not yet seen)**. The probe declares `extensionKind: ["ui"]`; the test forces the other value with VS Code's own override setting. This approximates declaring each value in the manifest; say so in the run record.

**You start with:** Part 4 done, the test window open.
**You leave with:** where the probe runs in each case.

1. In the test window, run **Preferences: Open User Settings (JSON)** from Ctrl+Shift+P and make the file read exactly this (the test profile is separate from yours), then save:
   ```json
   { "remote.extensionKind": { "assistantcabinet.cabinet-spike": ["workspace"] } }
   ```
2. Open the folder in your remote: click the green box at the bottom left, **Connect to WSL** (or **Connect to Host...** for SSH), then **File > Open Folder...** on any folder of the remote. Open Ctrl+Shift+P and run **Spike: Log Info**. Write whether the command exists (the probe is installed in the remote) or VS Code offers to install it there.
3. In the settings file change `["workspace"]` to `["ui"]`, save, reload the window (**Developer: Reload Window**), run **Spike: Log Info** again.

```bash
LOG=$(find /c/Users/dwyol/x0-vscode-data/logs -name '*Cabinet Spike*.log' | sort | tail -1); [ "$LOG" = "$PREV" ] || MARK=0; tail -n +$((MARK+1)) "$LOG"; MARK=$(wc -l < "$LOG"); PREV=$LOG
```

Expected: the `env` lines show `remoteName=wsl` (or `ssh-remote`), with `platform=linux` when the probe runs in the remote (`workspace`) and `platform=win32` when it runs on your Windows side (`ui`). Remote windows keep their logs on the remote side, so the dump may show only the local run: then copy the **Cabinet Spike** output from **View > Output** for the other.

**Paste back:** your answers and the output lines.

## Part 6: clean up (about 2 minutes)

Close the test window (and the remote connection). Then, in Git Bash, the proof that your real settings are untouched (the "after"; the hash must equal the one of Part 0):

```bash
sha256sum "/c/Users/dwyol/AppData/Roaming/Code/User/settings.json"
```

Delete the three test folders (they hold only test data):

```bash
rm -rf /c/Users/dwyol/x0-test-workspace /c/Users/dwyol/x0-vscode-data /c/Users/dwyol/x0-vscode-ext
```

Expected: no output. Your normal VS Code never saw the probe.

**Paste back:** the hash.

## What was walked without VS Code, and what only you can walk

Walked by the agent: the probe builds with the pinned `@types/vscode` 1.140.0; its eight unit tests pass; the `.vsix` builds and its manifest was read back (extension kind, activation event, two tools with the `when` on one, agent file, machine-scoped setting); the compiled probe was run against a fake `vscode` module (activation, both models, a plain turn, a tool call, a closing turn, the image tool, the two commands) and its log held no message text; the commands of Part 0 and the dump command were run on temporary copies. The contribution keys were checked in the installed VS Code 1.142.0: `chatAgents` accepts `path` (and `name`, `description`, `when`, `sessionTypes`; the first two are marked deprecated), `languageModelTools` accepts `when`.

Only you can walk: everything in the VS Code window (sign-in state, install, pickers, modes, attachments, tool runs, settings UI) and the remote windows.

## Run record

_(Appended after the run, in the format of `docs/HUMAN-TESTS-PROTOCOL.md`.)_
