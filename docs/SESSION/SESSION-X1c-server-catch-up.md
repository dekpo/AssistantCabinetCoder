# Lot X1c: catch up with the server (loopback address, `cabinet` command), then play the X1b human test on the Mac

> **Read first:** `docs/VIBE-CODING-PRACTICES.md`, `docs/SESSION/COMMON-RULES.md` (revised 18 November 2026: the Mac is now the owner's machine), `AGENTS.md`, `docs/DECISIONS.md`, `docs/LESSONS.md` (all of it), `docs/ARCHITECTURE.md`, `docs/HUMAN-TESTS-PROTOCOL.md`, `docs/SPIKE-FINDINGS.md`, `docs/HANDOVER.md`, `docs/human-tests/X1b-chat.md`, `docs/human-tests/logo-icon.md` (its run record and its finding "nothing in the chat"), `src/discovery.ts`, `src/messages.ts`, and, **read-only**, the server's handoff note `../AssistantCabinetServer/docs/handoffs/CODER-EXTENSION.md` and its decisions D-067, D-074 and D-081 (`../AssistantCabinetServer/docs/DECISIONS.md`).

Branch: `feat/x1c-server-catch-up`, created by the owner from `feat/logo-icon` (last code commit `9d1abfc`); its first commit holds only the revised session prompts of 18 November 2026 (`docs/SESSION/`). Check with `git log --oneline -3` that you are on it; if not, stop and say so. Estimate: about 2 hours of agent work for Part A, then the owner's X1b human test (about 45 minutes) in Part B. Needs: the Mac's own server (package 0.1.11 installed, `127.0.0.1:1975`) with `IDE_ENABLED=on`, which the owner turns on with `sudo` (see Part B); the stub before that.

## Why this lot exists

The extension's Lot X1b was built on 28 October 2026 and never tested on a real screen. Since then the server changed three things that touch the extension (server handoff note, section 2), none of them in the contract:

1. **The administrator's command is `cabinet`** (server D-067), no longer `cabinet-server`. The extension still names the old one in the "surface off" sentence (`src/messages.ts`), in `README.md` and in `docs/human-tests/X1b-chat.md`.
2. **The gateway always listens on `http://127.0.0.1:<SERVER_PORT>`** (server D-074), and also on `SERVER_BIND_ADDRESS` when that address exists on the machine. HTTPS (`TLS_MODE=on`) applies to the network address only, except when the bind address is a wildcard (`0.0.0.0`), where the one listener speaks HTTPS everywhere. Today `targetUrlFor` (`src/discovery.ts`) uses the network address with the configured scheme: on the Mac it gives `http://192.168.75.1:1975`, which fails as soon as that address disappears (cable unplugged, network changed).
3. **The address can change while the server runs** (server D-081, `cabinet config address`): `server.env` must be read again at each start and each connection check, never cached across them.

This lot fixes these, then plays the X1b human test on the Mac so that X1b and X1c are accepted together. It changes nothing else.

## Owner's agreement already given (18 November 2026)

The owner agreed to this correction lot, **including the edits of existing tests listed below as named exceptions**. No other existing test may change; if another one fails, stop and tell the owner.

## Files this lot may change or create

May change: `src/discovery.ts` (the target rule only), `src/messages.ts` (the command name in the existing sentences; additions only otherwise), `package.json` (version only), `README.md`, `docs/human-tests/X1b-chat.md` (it was never played: rewrite it for the Mac and for this lot), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/LESSONS.md`, `docs/HANDOVER.md` (delete it at the very end, once the X1b run record is written, as it says), `AGENTS.md` (only the "Terminal" rule, see step 5), `docs/HUMAN-TESTS-PROTOCOL.md` (only the "Git Bash only" rule, see step 5).
Create: new test files (for example `test/discovery-loopback.test.ts`).
**Named exceptions in existing tests** (each reported with its diff, nothing else in them changes):
1. `test/messages.test.ts`: the expected "surface off" sentence (line 47) gets `cabinet` instead of `cabinet-server`.
2. `test/discovery.test.ts`: only the assertions that encode the old rule "a specific bind address is used as the target" (around lines 101-102 and 130, and the `discoverServer` outcomes around lines 179 and 192 if they depend on it). The wildcard cases (lines 107, 108, 114-122) must keep passing **unchanged**.
3. `test/manifest.test.ts` line 34 and `test/provider-guards.test.ts` lines 51-52: the expected version.
**Untouchable (empty `git diff --stat feat/logo-icon -- <paths>` in the report):** `src/transport.ts`, `src/sse.ts`, `src/platform.ts`, `src/keys.ts`, `src/client.ts`, `src/codes.ts`, `src/convert.ts`, `src/provider.ts`, `src/tokens.ts`, `src/log.ts`, `src/extension.ts`, `docs/IDE-CONTRACT.md`, `docs/VIBE-CODING-PRACTICES.md`, `docs/SPIKE-FINDINGS.md`, the frozen records `docs/human-tests/X0-spike.md`, `docs/human-tests/X1a-connection.md`, `docs/human-tests/logo-icon.md` (they keep the old command name: they record what was true then), every other existing test file, and **everything in `../AssistantCabinetServer`** (read-only, never even `git fetch` there).

If `src/extension.ts` turns out to cache `server.env` across connection checks (item 3), do not change it: stop and tell the owner with the line numbers.

## Baseline

Run the whole suite before the first edit: **240 tests pass, 0 fail** is the expected count (the icon lot's final run, recorded in `docs/human-tests/logo-icon.md`); record the real one. If the contract guard is red, apply lesson 7 (tell the owner, nothing else starts).

## Part A: build (agent)

1. **The target rule** (`targetUrlFor` in `src/discovery.ts`). New rule, from the server's D-074:
   - bind address **not** a wildcard (a specific IPv4 or IPv6 address, or a host name): the target is `http://127.0.0.1:<port>`, whatever `TLS_MODE` says; no authority file is needed for it (check what `discoverServer` returns as `caFile` in that case and make it consistent: no CA file is attached to a plain-HTTP loopback target);
   - bind address a wildcard (`0.0.0.0`, `::`): today's rule, unchanged (HTTPS on the first certificate name when TLS is on, `undefined` when there is none; plain HTTP on `127.0.0.1` otherwise).
   - A configured `assistantCabinetCoder.serverUrl` still wins over discovery (unchanged).
   Write the reason in the function's comment and a decision (next free number, D-018 or later) citing the server's D-074 and the handoff note. New tests in a new file: a specific IPv4 bind address with TLS off and on, an IPv6 bind address, a host name, a wildcard with TLS off and on (unchanged results), the port kept, `caFile` absent for the loopback target.
2. **Fresh reading of `server.env`** (item 3). Check, by reading `src/extension.ts` and `src/discovery.ts`, that the file is read again at each start, each status refresh and each Test Connection. Write what you found (file and line) in the report. Add a test only if it can be written without touching an untouchable file.
3. **The command name.** `cabinet-server` becomes `cabinet` in `src/messages.ts` (the "surface off" sentence: `cabinet config set IDE_ENABLED=on`, then `cabinet restart`), in `README.md`, and in `docs/human-tests/X1b-chat.md`. On the Mac these commands need `sudo`; the sentence stays platform-neutral (the README says that on macOS they are run with `sudo`). `grep -rn "cabinet-server" .` outside `node_modules` and the frozen records must find nothing.
4. **Version 0.2.1** (practice 9: every installed build has a new number): `package.json`, the README's package file name, the named exceptions of item 3.
5. **The owner works on a Mac now** (since 6 November 2026). Change the one "Terminal" line of `AGENTS.md` and the "Git Bash only" rule of `docs/HUMAN-TESTS-PROTOCOL.md` to: commands written for the owner are POSIX shell commands; on macOS they run in Terminal (zsh) with `/Users/...` paths; on Windows they stay Git Bash with `/c/Users/...` paths; no PowerShell or `cmd` except a Windows-only step that Git Bash cannot do. Record it as a decision. Nothing else in those two files changes.
6. **README**: the server version the extension now expects (a server with the loopback listener of D-074; the Mac has package 0.1.11, Windows MSI 0.1.28 or newer, read from the server's handoff note), and the "on the server's own machine nothing needs to be typed" sentence checked against the new rule.
7. **Rewrite `docs/human-tests/X1b-chat.md` for the Mac** (it was never played, so it is not a frozen record). Keep its parts and its intent; change: Terminal (zsh) instead of Git Bash; `/Users/ydekpo/...` paths; the real settings file is `/Users/ydekpo/Library/Application Support/Code/User/settings.json` (`shasum -a 256` instead of `sha256sum`); no `tasklist` (check for a pending update in VS Code's own menu **Code > Check for Updates...**, and name it as seen); the `code` command is **not on the PATH** of this Mac: use `"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"` (check that the path exists first) or ask the owner to install the shell command from VS Code's Command Palette (**Shell Command: Install 'code' command in PATH**), and say which; the package name `assistant-cabinet-coder-0.2.1.vsix`; the tower part becomes **the Mac's own server**: no URL setting at all (discovery must find `http://127.0.0.1:1975` by itself, which is the proof of step 1), the models of the Mac listed (the code models `qwen2.5-coder:7b` and `qwen2.5-coder:14b` have a 32 768-token window; a model whose runtime does not report tool calling is not offered in the picker), one Ask turn and one small Agent turn on a scratch folder with `qwen2.5-coder:14b` (or the model the owner picks), the status bar label. Add one short part that proves the loopback rule: with no URL setting, Test Connection reports the server found on `127.0.0.1:1975` (read the code of the report first, lesson 5, and expect only what it really prints; the output channel holds codes and durations only). Keep the stub parts (markers `[stub:...]`, stop button, server cut mid-answer, wrong key, HTTPS with **Select CA File** against the stub with `--https`). Lessons 1, 2, 5, 6 apply. At most about 45 minutes.
8. **Walk** everything you can without VS Code, as X1b did: build, `npm run package` (expected 19 files), the compiled discovery run against a copy of the Mac's real `server.env` read from `/Library/Application Support/AssistantCabinetServer/config/server.env` (readable, no secret; never write there), then `GET /health` and `GET /ide/v1/models` on the target it returns (a `404` on the second means the surface is still off: expected until Part B).
9. Full suite, `npm run lint`, `npm run format`, the lesson-3 check (`grep -nP "[^\x00-\x7F]" -r src test` must find nothing new).

Report Part A in French (COMMON-RULES section 6), with the git commands for the owner, **before** Part B starts. The owner commits Part A first.

## Part B: the X1b human test, with the owner

1. **Turning on the editor surface of the Mac's server is the owner's action**, not yours: it needs `sudo` and it restarts the gateway. Before giving the commands, remind the owner in two lines of the effect on the desktop application (see COMMON-RULES section 7, "The server is shared with the desktop application") and let the owner choose the moment. The commands (only `config set` and a restart of the gateway; Ollama keeps its loaded models):

   ```bash
   sudo cabinet config set IDE_ENABLED=on
   sudo cabinet restart gateway
   ```

   Then check, as the agent: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1975/ide/v1/models` prints `200`.
2. Give the test **one part per message** (the owner's standing preference), read each pasted output before the next part, run yourself every command that needs no click in VS Code (the owner asked for this on 30 October 2026), keep screenshots to a minimum (one of the model picker is enough).
3. A deviation is a finding about the test or the product: correct the test file at once, write a lesson; a product defect is fixed only inside this lot's file list, with its test; anything else: stop and ask.
4. Append the run record to `docs/human-tests/X1b-chat.md` (format of `docs/HUMAN-TESTS-PROTOCOL.md`), covering X1b and X1c.
5. At the end, ask the owner whether to leave `IDE_ENABLED=on` on the Mac (recommended for the next lots, which test against it) or to turn it off (`sudo cabinet config set IDE_ENABLED=off`, then `sudo cabinet restart gateway`). Record the answer in the run record.
6. Delete `docs/HANDOVER.md` (the handover is over). Ask the owner whether `docs/SESSION/` stays tracked by git (recommended: yes, the server project decided the same in its D-073, and the owner now works on two machines); record the answer as a decision and, if "yes", replace the "TEMPORARY" comment at the top of `.gitignore` by a one-line comment saying the prompts are tracked (that one edit of `.gitignore` is allowed).

## Done means

Part A: tests green with the count against the baseline (240), lint and format clean, `grep` for `cabinet-server` empty outside the frozen records, the named exceptions listed with their diffs, the empty `git diff --stat` of the untouchable paths, `assistant-cabinet-coder-0.2.1.vsix` built. Part B: the run record written, the owner's two answers recorded, `docs/HANDOVER.md` gone. Final report in French with the git commands (Part B's commit: the run record, the decisions, the deletion), and the next lot: X2a (`docs/SESSION/SESSION-X2a-view-image.md`), **after** aligning that prompt with what X1b and X1c really showed (see COMMON-RULES section 9).

---

Binding rules, identifiers and VS Code facts: `docs/SESSION/COMMON-RULES.md`.
