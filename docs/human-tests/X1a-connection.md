# Human test X1a: the connection (about 20 minutes)

This test proves what Lot X1a added: the extension installs, finds or is told the server, talks to it, and **Test Connection** says in plain words what the server offers or what is wrong. There is no chat yet and no model is added to the chat. It runs against the **stub gateway** (`npm run stub`, a fake server on this computer) and then once against the **tower**.

Follows `docs/HUMAN-TESTS-PROTOCOL.md` and the lessons of `docs/LESSONS.md` (1 and 2). Every command is Git Bash. Expectations marked **(not yet seen)** come from the agent's run against a fake VS Code and from the specification, not from your screen: the point of this test is to replace them with what you see. Where an on-screen label differs from the one written here, write the label you really see in brackets.

## How this test is built

- **A separate VS Code profile**, as in X0: its own data folder and extensions folder, so it starts signed out of GitHub and **cannot change your real settings or extensions**. A hash of your real user settings file is taken before and after. The profile's settings file is written in advance with the server address, so there is no settings screen to find.
- **Two Git Bash windows.** Window 1 runs the stub and stays busy (Ctrl+C to change its mode). Window 2 is for the other commands. Keep both open for the whole test.
- **Left out on purpose:** automatic discovery of a server installed on this computer (no server is installed here; it is covered by unit tests with strings, including the Windows and macOS paths), the chat, remote windows (still untested, see the README), and everything an earlier real run already proved (install from VSIX, signed-out profile, Restricted Mode).

## Part 0: prepare (about 4 minutes)

**Terminal: Git Bash (window 2).**

**You start with:** a closed VS Code test window (your normal window may stay open), the repository on branch `feat/x1a-foundations`.
**You leave with:** the package built, four test folders, a hash of your real settings noted.

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

Expected: a hash and the file name. If the file does not exist, write "no settings file" and go on.

Build the package:

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run package
```

Expected: ends with `DONE  Packaged: ...assistant-cabinet-coder-0.1.0.vsix (15 files, ...)`.

```bash
ls -l /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder/assistant-cabinet-coder-0.1.0.vsix
```

Expected: one file of about 26 kilobytes.

Port 8099 (the stub's) must be free:

```bash
netstat -ano | grep ':8099'
```

Expected: no output.

Create the folders:

```bash
mkdir -p /c/Users/dwyol/x1a-test-workspace /c/Users/dwyol/x1a-vscode-data/User /c/Users/dwyol/x1a-vscode-ext /c/Users/dwyol/x1a-ca
```

A text file (no longer used as the wrong authority file, see Part 3 step 2; kept because the workspace needs one file):

```bash
printf 'line one\n' > /c/Users/dwyol/x1a-test-workspace/hello.txt
```

The test profile's settings, with the stub's address (the stub is not started yet):

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "http://127.0.0.1:8099"\n}\n' > /c/Users/dwyol/x1a-vscode-data/User/settings.json
```

**Paste back:** the output of `code --version`, of `sha256sum`, and of the `ls -l`.

## Part 1: open the test window and install (about 4 minutes)

**Terminal: Git Bash (window 2)** for the first command; the other steps are clicks in the test window.

**You start with:** Part 0 done, the stub **not** running.
**You leave with:** the extension installed in the test window, and the first look at its commands and status bar.

Open the test window (a new VS Code window opens; it looks like a first start):

```bash
code --user-data-dir "$(cygpath -w /c/Users/dwyol/x1a-vscode-data)" --extensions-dir "$(cygpath -w /c/Users/dwyol/x1a-vscode-ext)" "$(cygpath -w /c/Users/dwyol/x1a-test-workspace)"
```

In that window, in this order:

1. The welcome dialog offers **Continue without Signing In**: click it (never a sign-in button), then close the welcome page. If you are offered to turn on settings sync or to set up Copilot, **refuse**.
2. The folder opens in **Restricted Mode**. Click **Manage** in the grey banner (or the blue **Restricted Mode** button at the bottom left), then **Trust Workspace**. Without trust the extension stays disabled (lesson 2 of X0).
3. **Make sure this is the test window (lesson 2).** Open the Extensions view (Ctrl+Shift+X). In the test window the list of installed extensions is **empty**. If you see your own extensions, you are in your normal window: go back to the window that opened from the command above.
4. In the Extensions view click the **...** at the top right (**Views and More Actions...**), then **Install from VSIX...**, pick `C:\Users\dwyol\Documents\CURSOR\AssistantCabinetCoder\assistant-cabinet-coder-0.1.0.vsix`, click **Install**. Expected: **Assistant Cabinet Coder** appears in the installed list. Write down whether VS Code asks for a reload or a restart, and what you did.
5. Open the Command Palette (Ctrl+Shift+P) and type `Assistant Cabinet Coder`. Expected: six entries, **Assistant Cabinet Coder: Manage**, **Set API Key**, **Clear API Key**, **Select CA File**, **Test Connection**, **Show Output**. Write down any entry that is missing or named differently. Press Escape.
6. Look at the right side of the status bar (bottom of the window). Expected (not yet seen): **Cabinet: unreachable**, because the stub is not running. If you see nothing, write that down, then run **Assistant Cabinet Coder: Test Connection** once and look again.

**Paste back:** your answers to steps 4, 5 and 6.

## Part 2: the stub, one mode at a time (about 8 minutes)

**Terminal: Git Bash (window 1)** for the stub, then clicks in the test window. After each mode: Ctrl+C in window 1, then the next command.

**You start with:** Part 1 done.
**You leave with:** one observation per situation: surface off, version mismatch, key needed then connected, key cleared, server gone.

To see a message: open the Command Palette (Ctrl+Shift+P), run **Assistant Cabinet Coder: Test Connection**, read the dialog, close it.

### 2a. The editor surface is off

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode off --port 8099
```

Expected in window 1: `Stub gateway listening on http://127.0.0.1:8099 (mode: off).` Then run **Test Connection**.

Expected (not yet seen): a dialog headed **The server is reachable but not ready**, with the line `Health check: the server answered.` and the sentence **The server has not turned on the editor surface. Ask the administrator to run: cabinet-server config set IDE_ENABLED=on, then cabinet-server restart.** The status bar reads **Cabinet: off**.

### 2b. A different interface version

Ctrl+C in window 1, then:

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode version-mismatch --port 8099
```

Run **Test Connection**. Expected (not yet seen): the sentence beginning **The server speaks a different version of the editor interface...**; status bar **Cabinet: version**.

### 2c. A key is needed, then given

Ctrl+C in window 1, then:

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --key letmein-123 --port 8099
```

Run **Test Connection**. Expected (not yet seen): the sentence beginning **The server needs a valid API key.** with a **Set API Key** button, status bar **Cabinet: key needed**. Click **Set API Key** (or run **Assistant Cabinet Coder: Manage** and pick **Set API Key**). An input box asks for the key and shows dots as you type. Type `letmein-123` and press Enter. Expected: the message **The API key was saved in the secret store.**, and the status bar changes to **Cabinet: connected** within a second or two.

Run **Test Connection** again. Expected (not yet seen): **Connected: 3 models available**, the line `Editor interface version: 1`, the features line (all three `no`), and one line per model:

- `cabinet-chat`: window 32768 tokens, output up to 8192 tokens, tools yes, vision no
- `cabinet-code`: window 131072 tokens, output up to 16384 tokens, tools yes, vision yes
- `cabinet-plain`: window 8192 tokens, output up to 2048 tokens, tools no, vision no

and a note that **cabinet-plain** does not report tool calling and that VS Code 1.143.1 does not offer such a model in the chat picker in any mode.

### 2d. The key is cleared

Run **Assistant Cabinet Coder: Clear API Key**. Expected: **The API key was removed.**, and the status bar goes to **Cabinet: key needed**. Run **Test Connection** once more to see the key-needed sentence again.

### 2e. The server is gone

Press Ctrl+C in window 1 (the stub stops). Run **Test Connection**. Expected (not yet seen): a dialog headed **Cannot reach the server**, the sentence **The server cannot be reached...** and a `Technical detail:` line (for example `ECONNREFUSED`); status bar **Cabinet: unreachable**.

**Paste back:** for each of 2a to 2e, the headline and the first sentence you saw, the status-bar text, and any button name that differs from the one written here. For 2c, the model lines.

## Part 3: HTTPS and the authority file (about 4 minutes)

**Terminal: Git Bash (window 1)** for the stub, **window 2** for the settings; then clicks.

**You start with:** Part 2 done, window 1 free.
**You leave with:** the certificate message, a refused file, and a successful HTTPS connection.

Start the stub in HTTPS mode. It makes a throw-away authority and writes its public file to `C:\Users\dwyol\x1a-ca\ca.pem`:

```bash
cd /c/Users/dwyol/Documents/CURSOR/AssistantCabinetCoder && npm run stub -- --mode ok --port 8099 --https "$(cygpath -w /c/Users/dwyol/x1a-ca)"
```

Expected in window 1: `Stub gateway listening on https://127.0.0.1:8099 (mode: ok).` and `Authority file written to: ...x1a-ca\ca.pem`.

Point the test profile at the HTTPS address (window 2; VS Code reads the change by itself):

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "https://127.0.0.1:8099"\n}\n' > /c/Users/dwyol/x1a-vscode-data/User/settings.json
```

1. Run **Test Connection**. Expected (not yet seen): headed **Cannot reach the server**, the sentence **This computer does not trust the server's certificate...**, a `Technical detail:` line, a **Select CA File** button; status bar **Cabinet: certificate**.
2. Make a wrong file that the dialog will offer (it lists only `.pem`, `.crt` and `.cer` files, so a `.txt` file cannot be chosen; seen on 27 October 2026). Terminal: Git Bash (window 2):

   ```bash
   echo "not a certificate" > /c/Users/dwyol/x1a-ca/fake.pem
   ```

   Then click **Select CA File** (or run **Assistant Cabinet Coder: Select CA File**). A file dialog opens. Pick `C:\Users\dwyol\x1a-ca\fake.pem`. Expected: the message **The authority file is not a certificate in PEM format...** and nothing is saved.

3. Run **Select CA File** again and pick `C:\Users\dwyol\x1a-ca\ca.pem`. Expected: **The authority file was set.**
4. Run **Test Connection**. Expected (not yet seen): **Connected: 3 models available**; status bar **Cabinet: connected**. (If the stub still wants a key it does not here: this run has no `--key`.)

Ctrl+C in window 1.

**Paste back:** the headline and first sentence of steps 1, 2 and 4, and the `Technical detail:` text of step 1.

## Part 4: the tower, the status bar and the log (about 3 minutes)

**Terminal: Git Bash (window 2)** for the first command; then clicks.

**You start with:** Part 3 done, the stub stopped.
**You leave with:** one real server answer, and the log checked for content.

Point the test profile at the tower:

```bash
printf '{\n  "assistantCabinetCoder.serverUrl": "http://192.168.1.83:8090"\n}\n' > /c/Users/dwyol/x1a-vscode-data/User/settings.json
```

1. Run **Test Connection**. Expected: `Health check: the server answered.` (the tower answers `/health` today). Then, because the editor surface is off until the server's Lot 15b, the **editor surface** sentence from 2a, and status bar **Cabinet: off**. If the tower is off or unreachable, write that; if its editor surface is already on, the models appear: write what you see.
2. Click the status bar item. Expected (not yet seen): a menu **Assistant Cabinet Coder** with five entries (Set API Key, Clear API Key, Select CA File, Test Connection, Show Output). Pick **Show Output**.
3. In the output panel, select all the lines (click in the text, Ctrl+A, Ctrl+C) and paste them into the chat. Expected: one line per call, each like `2026-10-27T... call=models status=404 ms=12 code=ide_surface_off`: time, call name, status, duration, and a code. **No sentence, no model name from a message, no key, no text of any kind.** Tell me if any line holds anything else.

**Paste back:** your answer to step 1 and the pasted output lines.

## Part 5: uninstall and clean up (about 3 minutes)

**Terminal: Git Bash (window 2)** for the commands; step 1 is a click.

**You start with:** Part 4 done.
**You leave with:** nothing left behind, and the proof that your real profile never saw the extension.

1. In the test window, Extensions view, click **Assistant Cabinet Coder**, then **Uninstall**. Write whether VS Code asks for a reload.
2. **Close the test window completely**, the one whose title contains `x1a-test-workspace`; keep your normal window. Wait ten seconds. Every check below must run **after** this: while the window is open the profile's files are locked (a "Device or resource busy" message from `grep` or `rm` means the window is still open: close it and run that command again; lesson 6).

The key must not be in any file of the test profile (VS Code keeps it in its encrypted secret storage):

```bash
grep -rl "letmein-123" /c/Users/dwyol/x1a-vscode-data /c/Users/dwyol/x1a-vscode-ext
```

Expected: no output. If it prints a file name, write the name (not the content): that is a finding.

Nothing was installed in your normal profile (lesson 2):

```bash
ls /c/Users/dwyol/.vscode/extensions | grep -i cabinet
```

Expected: no output.

The extensions folder of the test profile holds no copy any more:

```bash
ls /c/Users/dwyol/x1a-vscode-ext
```

Expected: no `assistantcabinet.assistant-cabinet-coder-...` folder (only VS Code's own bookkeeping file, if any).

The proof that your real settings are untouched (the "after"; the hash must equal the one of Part 0):

```bash
sha256sum "/c/Users/dwyol/AppData/Roaming/Code/User/settings.json"
```

Delete the four test folders (they hold only test data):

```bash
rm -rf /c/Users/dwyol/x1a-test-workspace /c/Users/dwyol/x1a-vscode-data /c/Users/dwyol/x1a-vscode-ext /c/Users/dwyol/x1a-ca
```

Expected: no output.

**Paste back:** the outputs of the four checking commands.

## What was walked without VS Code, and what only you can walk

Walked by the agent: the `.vsix` builds (15 files, 26 kilobytes, nothing but the compiled sources, the licence, the README and the manifest); the compiled adapter was run against a fake `vscode` module and the stub in `--key` mode (activation, the status bar going to key needed, Test Connection with the key-needed and the connected reports, Set API Key, Clear API Key, the manage menu, the log lines); the stub's HTTPS mode and every transport rule (timeouts, cancellation, authority file re-read at each request, refusal of a file with a private key) are unit tests with a throw-away authority; the manifest, the language guard, the no-leak guard, the no-network and no-risk guard and the drift guard are tests.

Only you can walk: everything in the VS Code window (the trust prompt, install, the Command Palette entries, the status bar, the dialogs and their buttons, the file dialog, the input box with hidden characters, uninstall) and the answer of the tower. Not walked by anyone: automatic discovery on a real installation, macOS, remote windows.

## Run record

- **Date and VS Code version:** 27 October 2026, VS Code 1.143.1 stable, separate profile (signed out), folder trusted. The hash of the real user settings file was `b5e63f154111b39306f93738036196fe6ebea0ae5d296599f1110affdfff23a2` before and after.
- **Matched:** Part 0 (no update waiting, package of 26 469 bytes, port 8099 free). Part 1: install from VSIX, the six palette entries, the status bar at start-up (unreachable), all as written. Part 2: every dialog text as written (surface off with the exact administrator sentence, version mismatch, connected with the three model lines and the tool-calling note, cannot reach the server with `ECONNREFUSED`), the key-needed dialog with its **Set API Key** button, the hidden input, the saved and removed messages, and the status-bar text after each step (the owner confirmed these in words, without screenshots). Part 3: the certificate dialog with its **Select CA File** button and `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, a refused file (not a certificate, nothing saved), the authority file accepted, then connected over HTTPS. Part 4: the tower answered `/health`, then the surface-off sentence; the status bar menu with its five entries; the output channel held only time, call, status, duration and code (27 lines, no sentence, no key, no model name). The real user settings file was unchanged.
- **Deviated (each is a finding about the test first, fixed above):** (1) Part 3 step 2 could not be played: the Select CA File dialog lists only `.pem`, `.crt` and `.cer` files, so the `.txt` file could not be chosen. The step now uses a `fake.pem` with wrong content, was replayed and gave the expected message (lesson 5). (2) Part 5 was run with the test window still open, so its checks were not valid and `rm` was blocked on locked files; the step now closes the window first and says how to know (lesson 6); the commands were repeated after closing.
- **Not shown:** whether **Uninstall** was clicked and whether VS Code asked for a reload (not answered); that an uninstall leaves nothing behind (the extensions folder was deleted by the first `rm` before it could be read); a complete search for the key in the profile (the repeated `grep` found nothing, but ran on a data folder that the first `rm` had already emptied of its unlocked files; the files that stayed were the locked ones, among them the secret-storage database `state.vscdb`). Not walked by anyone: automatic discovery on a real installation, macOS, remote windows, a server answering with the editor surface on (the tower's is off until the server's Lot 15b).
- **Side note:** `assistantcabinet.cabinet-spike-0.0.1` is still in the normal profile's extensions folder. It is the probe installed there by mistake during Lot X0 (lesson 2), already marked obsolete in `.obsolete`; VS Code removes it when the normal window next starts. The extension of this lot was never in the normal profile.
