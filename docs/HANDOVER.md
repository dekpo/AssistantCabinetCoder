# Handover: resuming on another machine

Written on 30 October 2026 when the owner changed computers in the middle of Lot X1b. Delete this file once the work has resumed and the X1b run record is written.

## State of the work

- Branch `feat/x1b-provider`, pushed. Lot X1b (the model provider) is **built and committed**: 238 tests pass, lint and format are clean, version 0.2.0.
- The contract refresh (`docs/IDE-CONTRACT.md`) is its own commit, before the lot commit.
- Lot X1b is **not yet accepted**: its human test, `docs/human-tests/X1b-chat.md`, has **not been run**. Part 0 was prepared on the old machine and the test window was opened, but nothing was answered or recorded. Start again from Part 0 on the new machine (the test folders were machine-local).
- After the human test: append the run record to `docs/human-tests/X1b-chat.md` (the agent does it from the owner's answers), then Lot X2a (`feat/x2a-view-image`, created from `feat/x1b-provider`).
- Pending before X2a starts: check that `docs/SESSION/SESSION-X2a-view-image.md` is aligned with what X1b really built (module names, the `Host` interface, stub markers, `tools` and `convert` APIs, test counts), correct it if needed, then give the owner the branch and git commands and the prompt to run in a new window.

## What travels through git, and what is copied once by hand

By owner decision (30 October 2026) `.gitignore` temporarily does **not** ignore `docs/SESSION/`, so every lot prompt travels with the branch: `COMMON-RULES.md`, `PLAN-EXTENSION.md` and the prompts X0, X1a, X1b, X2a, X2b, X3 and X4, the whole plan from start to end. The folder `docs/SESSION/profile/` holds a copy of the owner's global rules (`CLAUDE.md`) and of the agent memory (`memory/`).

On the new machine, copy the global rules into the user profile by hand (Claude Code only reads them from there; if a `CLAUDE.md` already exists there, merge instead of overwriting):

```bash
mkdir -p /c/Users/<user>/.claude
cp docs/SESSION/profile/CLAUDE.md /c/Users/<user>/.claude/CLAUDE.md
```

The agent memory is optional: copy `docs/SESSION/profile/memory/*.md` into the project's memory folder of Claude Code (its name is built from the repository path), or simply give the agent the memory line below.

The `.vsix` packages are not stored: rebuild with `npm run package`.

When the handover is over, restore the ignore rule (see the top of `.gitignore`) and run `git rm -r --cached docs/SESSION`, so the prompts become local-only again.

Memory in one line: for a human test, give **one part per message**, and say explicitly whether a step is Git Bash or `cmd`. The owner also asked, on 30 October 2026, to keep screenshots to a minimum (one for the model picker is enough) and to run every command that needs no editor click as the agent rather than asking the owner to open terminals.

## Set up the new machine

All in Git Bash.

```bash
git clone <repository address> AssistantCabinetCoder   # or: git fetch --all in an existing clone
cd AssistantCabinetCoder
git checkout feat/x1b-provider
git status --short                                     # expected: nothing
node --version                                         # expected: 22 or higher (24.21.0 was used)
npm ci                                                 # no install script runs (.npmrc)
npm test                                               # expected: 238 pass, 0 fail
npm run lint && npm run format
npm run package                                        # expected: assistant-cabinet-coder-0.2.0.vsix, 18 files
code --version                                         # the test was written for 1.143.1
```

Read in this order: `AGENTS.md`, `docs/VIBE-CODING-PRACTICES.md`, `docs/DECISIONS.md`, `docs/LESSONS.md`, `docs/ARCHITECTURE.md`, `docs/HUMAN-TESTS-PROTOCOL.md`, `docs/SPIKE-FINDINGS.md`, `docs/human-tests/X1b-chat.md`.

## Resuming the human test on the new machine

- The agent can do the whole of Part 0, start and restart the stub (`npm run stub -- --mode ok --port 8099`, other modes in the test), open the test window and clean up. The owner only clicks in the test VS Code window and reports what is seen.
- Take a **new** hash of the new machine's real `settings.json` before and after (the old machine's hash, `b5e63f15`, does not apply). Its path on Windows is `/c/Users/<user>/AppData/Roaming/Code/User/settings.json`; adapt every `/c/Users/dwyol/...` path in the test to the new user name.
- No VS Code update may be pending (lesson 1). Close other VS Code windows that hold the same profile folders.
- Part 5 points at the tower (`http://192.168.1.83:8090`). That address only works from the home network; on another network write "tower not reachable" and move on.
- Expectations marked "(not yet seen)" in the test are exactly that: the point is to replace them with what the owner sees. Lesson 2 applies: if a label differs, write the label really seen.

## Facts worth keeping in mind

- Git is owner-only. One branch per lot, from the previous lot's branch, never from `main`, no pull request.
- `src/codes.ts`, `docs/VIBE-CODING-PRACTICES.md` and (without the owner's word) `docs/IDE-CONTRACT.md` are not touched. Existing tests are never edited to pass.
- The stub chooses its answer from a marker typed at the start of a chat message: `[stub:text]`, `[stub:tool-call]`, `[stub:tool-call:<tool name>]`, `[stub:long]`, `[stub:cut]`, `[stub:empty]`.
- What was never seen on a real screen: the model picker and its tabs, the tooltips, the tool steps and their approvals, a pasted image, the stop button, the messages in the chat, and the reachability of the provider's Manage entry. These are the questions the X1b human test answers.
