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
