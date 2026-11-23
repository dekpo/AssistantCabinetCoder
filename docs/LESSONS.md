# Lessons

One numbered entry per mistake already made, written the moment it is found: what happened, and the rule that prevents it. Read all of it before touching anything that has bitten before. A mistake that is not written down is made again.

## 1. A pending VS Code update makes a second VS Code instance quit at once

27 October 2026, found while playing Part 1 of `docs/human-tests/X0-spike.md`. A VS Code update (1.143.1) had been downloaded the day before and its silent installer (`CodeSetup-stable-...exe /verysilent /update`) was waiting for every VS Code window to close. While it waits, `code --user-data-dir ...` starts, creates its data folder, writes no log and exits: no window opens, no error is printed, and the exit code is 0.

**Rule:** before any test that opens a separate VS Code instance, check that no update installer is waiting (`tasklist | grep -i -E "CodeSetup|Code.exe"` shows no `CodeSetup` line); if one is, close every VS Code window, wait until it has gone, and check `code --version` again. A test that needs a window to open starts with that check.

## 2. A test written from documentation used labels nobody had seen, and the test window was easy to confuse with the normal one

27 October 2026, found while playing Part 1 of `docs/human-tests/X0-spike.md`. Two mistakes: (1) the instructions named on-screen items (a "model picker", a "mode picker", "Session Target") from the documentation without having seen them on this VS Code (1.143.1), so the owner could not find them; in the real window the mode button reads **Agent**, the model button reads the model name (for example **GPT-4.1**) and **Local** is a label at the bottom left of the chat box. (2) After the test window was open, the agent told the owner to reopen the normal working window; the probe was then installed in the normal profile (`~/.vscode/extensions`), not in the isolated one, which broke the isolation the test promised.

**Rules:** an editor step names an item only as it appears on a screenshot of the target version; when none exists, the agent asks for one first and describes the position ("under the text field, second button from the left"). A test that uses a separate window starts with a check that tells the two windows apart (the Extensions view of the test window lists none of the owner's own extensions), and the agent never asks the owner to switch windows while a step is pending. The cleanup part checks that nothing was installed in the normal profile.

## 3. The file-writing tool turned Unicode escape sequences into real accented characters

27 October 2026, found by the language guard on its first run in Lot X1a. Test sources written with a Unicode escape sequence (the backslash, the letter u and four hex digits, meant for example to prove that a character split across two chunks is decoded) came out of the writing tool with the real accented character in the file, so five files held French diacritics and the guard failed, as it should.

**Rule:** a source file that needs a non-ASCII character writes it as an escape sequence and is checked with `grep -nP "[^\x00-\x7F]" -r src test` after it is written; if the writing tool altered the escapes, they are put back with a small script that builds the backslash with `String.fromCharCode(92)` (a literal backslash followed by u in a shell command line is altered too). Documents are checked the same way, and they describe the character in words.

## 4. A guard reads comments as well as code

27 October 2026, found by the no-risk guard on its first run in Lot X1a. A comment in `src/transport.ts` said "Never `rejectUnauthorized: false`", and the guard that forbids that option anywhere in `src/` failed on the comment.

**Rule:** a comment that explains a forbidden construct describes the rule in other words (for example "certificate checking is never turned off") instead of quoting the forbidden text. The same applies to the other patterns of the guard (`eval`, `fetch`, `console`, process spawning, file writing).

## 5. A test step assumed a file dialog that the extension had filtered

27 October 2026, found while playing Part 3 of `docs/human-tests/X1a-connection.md`. The step told the owner to pick a `.txt` file in the Select CA File dialog ("you may have to widen the filter"). The dialog offers only `.pem`, `.crt` and `.cer` files and has no all-files choice, so the step could not be played.

**Rule:** a step that picks a file in a dialog the extension opens uses a file that the dialog lists, and the agent reads the dialog filters in the code before writing the step (lesson 2 again: describe only what the screen shows). To test a refused file, give it an accepted extension and wrong content.

## 6. A clean-up step was run while the test window was still open

27 October 2026, found while playing Part 5 of `docs/human-tests/X1a-connection.md`. The checks (`grep` for the key, `ls` of the extensions folder) and the `rm` ran with the test window still open: ten VS Code processes held the profile, `grep` could not read three files, `rm` removed only the files that were not locked, and the answer about the extensions folder (which still held the extension) could not be read as "uninstall left something behind". The first `rm` also changed the folders before the checks were repeated, so the repeated checks were weaker.

**Rule:** a clean-up part starts with a step that closes the test window and says how to know it is closed (a "Device or resource busy" message means it is not); no check or deletion is run before that, and a check is never run after a deletion started. A deviation of this kind is recorded in the run record as "not shown" for what it hid.

## 7. The contract guard went red because the server committed a newer contract

28 October 2026, found by the baseline run of Lot X1b (121 passed, 1 failed). The server's Lot 17b, committed late on 27 October, changed `docs/IDE-CONTRACT.md` in the server project; the vendored copy here was the one of 27 October morning, and the guard that compares the two when the server repository is next to this one failed before any edit.

**Rule:** a red baseline is reported to the owner at once, with the cause, and nothing else starts until the owner decides. When the cause is a newer contract in the server project, the owner decides to copy it over (never edited here), it is checked with `cmp`, and it goes in a commit of its own so that it is not mixed with a lot's work.

## 8. The writing tool altered Unicode escapes again, and long heredocs failed in the shell tool

28 October 2026, Lot X1b. Lesson 3 happened again: a test and the stub came out of the writing tool with an accented character where the source had an escape sequence, found at once by the check that lesson 3 prescribes (`grep -nP "[^\x00-\x7F]" -r src test`). The same session found that multi-line heredocs fail in the agent's shell tool ("unexpected EOF"), so files are written with the file-writing tool and small edits are made with the edit tool or with `node -e` scripts that build the backslash with `String.fromCharCode(92)`.

**Rule:** run the check of lesson 3 after every file that may hold a non-ASCII character, before the first compile; never rely on a heredoc to write source or documents.

## 9. The no-URL guard caught an address in a comment and in a template string

18 November 2026, Lot X1c, first full run after the new target rule. The comment of `targetUrlFor` quoted the loopback address with its scheme, and the new code built the address from a template string that began with the scheme and two slashes; the guard that forbids URL literals in `src/` failed on both (lesson 4 again, in a new shape). The older code had avoided it by keeping the scheme in a variable.

**Rule:** in `src/`, an address is never written with its scheme: a comment says "plain HTTP on 127.0.0.1 and its port", and code joins a scheme variable (`"http:"`) and the host (`${scheme}//${host}:${port}`). Run `node --test out/test/guards.test.js` right after touching a module that builds addresses.

## 10. The package was installed in the owner's normal window before the test began, and a pending update showed as a title-bar button

18 November 2026, Lot X1c, between Part 0 and Part 1 of `docs/human-tests/X1b-chat.md` on the Mac. The report of Part A said the package was built; nothing said it would be installed only in the test window, so the owner uninstalled 0.2.0 from the normal profile and installed 0.2.1 there. The screenshots also showed a blue **Update** button in the title bar: on macOS that is how VS Code 1.146.0 shows a downloaded update (lesson 1's waiting installer, in another shape). The extension page kept showing the old README after the reinstall although the installed file was the new one.

**Rule:** when a package is built for a human test, say in the same message where it will be installed (the test window only) and that the normal window is not to be touched. On macOS, the check of lesson 1 looks for the **Update** button of the title bar as well as **Code > Check for Updates...**. A detail page of an extension is not evidence of the installed files: read the installed folder instead.

## 11. The stub's fallback tool ran a terminal command on the owner's Mac

18 November 2026, Part 2 of `docs/human-tests/X1b-chat.md`, VS Code 1.147.0. The script promised a file-reading tool and a file-creating tool, from the tool names measured on 1.143.1. On 1.147.0 the Agent request held no tool named like `read_file` or `create_file`, so the stub took the first tool of the list, a terminal tool, and asked VS Code to run the command `stub`. VS Code asked for approval, the owner allowed it, and the shell answered "command not found". Harmless, but a test must never let the stub's fallback choose what runs on the owner's machine.

**Rule:** before a human test that makes the stub call an editor tool, check that the tool names it relies on are still those of the VS Code version being tested; the step says which tool will run, that a terminal tool must be refused with **Skip**, and that only a read or create tool is allowed.

## 12. Copying a picture file in the Explorer pasted its name, not the picture

19 November 2026, Part 3 of `docs/human-tests/X1b-chat.md`, VS Code 1.147.0 on macOS. The script said to select `pic.png` in the Explorer, press Cmd+C and paste it into the chat, a way taken from the X0 run on Windows, where the picture was copied from the editor. On the Mac the chat box received the text `pic.png`; dragging the file did the same, and the **+** button answered "Could not attach pic.png." No picture reached the provider, so the image steps proved nothing and the log could not show it. A screen capture pasted with Cmd+V did nothing either: on 1.147.0, signed out, the chat took no picture at all, even for a model that reports image input.

**Rule:** a human test that needs a picture in the chat puts a real picture in the clipboard (on macOS a screen capture of a small harmless area with Cmd+Ctrl+Shift+4), and the step says how to tell it worked: a picture shows in the message, and the log line's prompt tokens grow. A way of attaching measured on one system is written as unmeasured on another.

## 13. The stop button stopped the screen, not the request

19 November 2026, Part 3 of `docs/human-tests/X1b-chat.md`, VS Code 1.147.0. The script expected the words to stop at once and the log to show `code=cancelled`. The words stopped on screen, but twice the log line showed the stub's full sixty seconds (`ms=60256`, then `ms=60254` with the stop clicked at `word20`) and no code: the editor never cancelled the request it had given the extension, so the server went on producing the answer. The extension's side had been proved only with a stand-in editor, which cancels when told to.

**Rule:** a stop or cancel step is judged on the log line (its duration and its code), never on the screen, and the stub's scenario is long enough for the difference to show. A behaviour proved with a stand-in editor is written as "not yet seen in the real editor" until a run shows it.

## 14. After a wrong key the models left the picker, and the editor offered its own sign-in

19 November 2026, Part 4a of `docs/human-tests/X1b-chat.md`, VS Code 1.147.0. The script expected our sentence **The server needs a valid API key.** in the chat after a wrong key. Saving the key made the extension read the model list again; the server refused it, the list became empty, and the editor removed the models from the picker before anything was sent. The message then went to no model, and the editor opened its own **Sign in to use GitHub Copilot** window. Only the status bar (**Cabinet: key needed**) and the **Test Connection** dialog named the key.

**Rule:** a failure that empties the model list is checked in the status bar, the picker and **Test Connection**, never by sending a message to a model that may have gone. A step that may open the editor's sign-in says to close it with its **X**. Whether the extension should tell the user itself when the list goes empty because of a key is a question for a later lot, not a test fix.

## 15. Agent mode refused the Mac's code model before sending anything

19 November 2026, Part 5 of `docs/human-tests/X1b-chat.md`, VS Code 1.147.0, the Mac's own server. The script took a 32768-token window as enough for Agent mode, from a server document and the X0 run on 1.143.1. On 1.147.0 the editor answered at once, without calling the extension, "static system messages and tool definitions exceed this model's context budget". The extension gives the editor an input budget of window minus output ceiling (here 16384 tokens) and a token estimate that errs high on purpose; the Agent prompt of this editor version, with its tool definitions, does not fit. The stub's 131072-token model had hidden it all through Parts 2 to 4.

**Rule:** a human test runs at least one Agent turn with a real model of the target server before it is called passed, because a stub with a large window proves nothing about the budget. How the input budget and the token estimate should be set for 32768-token models is a product question for its own lot, measured on the editor version in use, not a test fix.

## 16. The uninstalled extension's folder was still on disk

19 November 2026, Part 6 of `docs/human-tests/X1b-chat.md`, VS Code 1.147.0 on macOS. The script expected the test profile's extensions folder to hold no copy after **Uninstall** and Cmd+Q. The folder was still there: VS Code had emptied `extensions.json` and named the folder in `.obsolete`, and deletes it only at its next start, which never comes for a throw-away profile. The Dock also kept a VS Code icon after the test instance quit, although no process of it was left.

**Rule:** an uninstall is checked in `extensions.json` and `.obsolete`, not by the folder being gone; that the test instance has quit is checked by its processes, not by the Dock.

## 17. The lot's options assumed the editor used the extension's token estimate

19 November 2026, Part A of Lot X1d, VS Code 1.147.0. The lot file proposed a smaller output reserve (a quarter of the window) and a higher starting ratio for the estimate, both written before any measurement. A count-only local build showed that the editor never calls `provideTokenCount` in Agent or Plan (its agent harness counts the prompt itself), and probe models on the stub showed that a quarter of the window (24576 input tokens) was still refused while 28672 started. Without the measurement the lot would have shipped one change with no effect and one too small.

**Rule:** before changing how the extension answers the editor, measure what the editor really calls and the value it really needs, on the version in use: a count-only build that is never committed, and stub models that bracket the threshold. Options are written after the numbers, never before.

## 18. Document text inside a shell command ran words as commands

19 November 2026, Part B of Lot X1d. The agent appended decisions to `docs/DECISIONS.md` with a `node -e '...'` script whose text held an apostrophe ("the stub's") and back-quoted names. The apostrophe closed the shell quote, so zsh ran the rest of the text: globs failed, plain words were "command not found", and each back-quoted name was run as a command substitution, among them `cabinet models context`, the server's administrator command. Nothing was written and nothing changed: that command needs an alias, a value and administrator rights, so it stopped on its missing arguments. But a shell must never be given prose that can name a real command.

**Rule:** documents and any text with quotes or back quotes are written with the file-writing and editing tools only, never inside a shell command (no `node -e`, no heredoc, no `echo`); lesson 8 already banned heredocs for this. A shell script that edits a source file carries code only, and is read once for stray quotes before it is run.

## 19. The editor retried a refusal five times and called it 502

20 November 2026, Part 2 of `docs/human-tests/X1d-agent-budget.md`, VS Code 1.147.0. The script expected the server's `context_too_large` refusal to show as the extension's sentence. It did, but inside the editor's own frame: "Failed to get response from the AI model; retried 5 times (total retry wait time: 15.05 seconds) Last error: 502 The conversation is too long for this model...". The log held six identical `status=413 code=context_too_large` lines for one prompt. The extension throws a plain `Error` for every refusal, and the new agent harness treats a plain error as a passing failure worth retrying. Here it cost nothing (each refusal took under 10 ms and loaded no model), but a failure that is slow, such as a timeout on a large model, would be resent five times.

**Rule:** a human-test expectation for an error describes what the editor adds around the extension's sentence, as seen on the version in use. Whether a refusal that cannot succeed by retrying (a window overflow, a wrong key, a missing model) should reach the editor as another error type is measured first (lesson 17), in a later lot chosen by the owner.

## 20. The probe build overwrote the real package file

21 November 2026, Part A of Lot X1e. The count-only probe was packaged with `npm run package`, which writes `assistant-cabinet-coder-<version>.vsix` at the root: the probe took the name and the place of the real 0.2.2 package. It was installed in a throw-away profile only and the real package was rebuilt from the clean sources right after the probe was removed (the rebuilt file holds no probe, checked in its `extension.js`), so nothing reached the owner's normal profile.

**Rule:** a probe that is never committed is packaged to a path of its own outside the repository (`npx vsce package --no-dependencies --allow-missing-repository -o <scratch folder>/probe.vsix` after `npm run build`), never with `npm run package`; after the probe is removed, `git diff <start branch> -- src` is empty before anything else is built.

## 21. A heredoc was used again to append source

21 November 2026, Part B of Lot X1e. The function `describeOverflow` was appended to `src/messages.ts` with a shell heredoc, which lessons 8 and 18 forbid. The text came out intact (checked by reading the file and by the check of lesson 3), but only by luck: the sentence holds angle brackets and an apostrophe.

**Rule:** lessons 8 and 18 again: source and documents are written with the file-writing and editing tools only. Appending to the end of a file is an edit of its last lines, not a shell command.

## 22. A step that held two sends and two stops was skipped

21 November 2026, Part 2 of the measures of Lot X1e. Step 4 (a new chat, a Plan send, a stop, a second send, a second stop) came after three steps of the same shape; the owner answered after step 3, and the stub's console showed that step 4 had never been played. It was given again as a part of its own and played at once.

**Rule:** a measuring part that the agent checks in a console lists, at its end, what the console must show (for example "four answers of the scenario `long`"), and the agent reads the console before calling the part done; a step with several sends is split into one numbered step per send.

## 23. A lot file carried the desktop application's privacy default into the coding extension

23 November 2026, start of Lot P0a. The lot file recommended keeping the panel's conversations in memory only, "lost when the window reloads", citing the programme's privacy rules, which were copied from the server and the desktop application. The owner refused: the extension is a professional coding tool, its users expect their conversations to survive a reload like in any serious coding assistant, and the desktop application (office documents) is a different product with a different approach. A recommendation that throws away the user's work had been written as the safe default without asking what the users of this product expect.

**Rule:** before recommending that the extension throw away or not keep the user's work (conversations, drafts, settings) "for privacy", check whether the rule comes from the desktop application's context, and ask the owner with the cost to the user stated. Strict privacy here means no telemetry, no other host and no content in logs or error messages; it does not mean losing the user's own data on their own machine (decision D-027).

## 24. Saves in the background raced with opening, deleting and the first read of the index

23 November 2026, Lot P0a, found by the new tests before anything was installed. Three races: (1) twenty saves of one conversation, sent before the store had read its index, were written in the order the index reads finished, so an older version could win; (2) the index rebuilt during that first read waited for a write queued behind the save that was waiting for the read: a deadlock; (3) the session opened or deleted a conversation while its save was still queued, so a fresh conversation looked missing, and a deletion could be undone by the late save writing the file again.

**Rule:** an operation on stored data fixes its order when it is asked for, not after an `await`; nothing that a queued task waits for may itself wait behind that queue; and an operation that reads or removes what a background save is writing waits for the saves already on their way. Each such case gets a test that runs many operations at once.

## 25. Lessons 3 and 18 happened again in Lot P0a

23 November 2026. (1) The writing tool turned the escape sequence of an accented letter into the letter itself in `test/chat.test.ts`; the language guard caught it at the first full run, because the check of lesson 3 had been run on `src` only, not on `test`. (2) To fix two patterns of the human-test file, the agent put document text holding quotes into a `node -e '...'` command; zsh stopped on a glob before running anything, so nothing was written and no command ran, but lesson 18 forbids exactly that. (3) After the human run, during the panel's new look, three replacements in `src/session.ts` were made with a `node -e` script instead of the editing tool (lesson 21); the result was read back, found intact, and covered by the full suite.

**Rule:** the check of lesson 3 runs on `src`, `test` and `media` after every written file that may hold a non-ASCII character; any change to a document, even a few characters, is made with the editing tool, never inside a shell command.

## 26. A stop-before-the-first-word measure was spoiled twice by the script's own design

23 November 2026, Part 5 of the human test of Lot P0a. The script sent `hello` in the same conversation as the stopped long question, so `hello` carried the 60 000 characters again and its wait could not be told apart from the old reading. The retry used the same long text, which the server had kept from the first try, so the first word came after 117 ms and the stop fell while answering. Only a third try, with a new conversation and a text the server had never read, measured what was meant.

**Rule:** a measure of what follows a stop sends the next request in a **new** conversation, and a stop before the first word uses a text the server has **never read** (one per try, never reused). The agent reads the log before calling the try done: the stopped line must have no status and no `first_ms`.
