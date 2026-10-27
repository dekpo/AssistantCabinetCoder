# Human tests: protocol

A human test is a script the owner plays on a real VS Code. It lives in `docs/human-tests/<lot>.md` and is tracked. The agent walks every step it can first (build, packaging, manifest checks, the stub) and says plainly what only the owner can walk.

## Rules

- **Short.** At most about forty minutes. Prove what is new, leave out what an earlier real run already proved, and say what was left out.
- **A script, not a list.** It runs top to bottom, in parts of at most about fifteen commands. Each part opens with "You start with" and closes with "You leave with".
- **Name the terminal at the top of every part** ("Terminal: Git Bash"), even when it is the default.
- **Git Bash only.** Commands use POSIX syntax and `/c/Users/...` paths. A step specific to Windows installation that Git Bash cannot do is the only exception: it is announced in one line and kept to that step.
- **Every command in full, where it is asked.** Never "as before". Each command is in its own code block; the expected result is written outside the block. Editor steps name every click by its exact label; where the owner's wording differs, it is added in brackets.
- **One backup at the start and one restore at the end** of anything the test changes (for example the user settings file).
- **Expectations come from a run or from the machine's real state**, never from a neighbouring document.
- **No content in the results.** What the owner pastes back is numbers, names and kinds, never message text, file content or file names of private files.

## The loop

In the chat, the agent gives **one part at a time**, never the whole script.

1. The owner plays one part and pastes its output.
2. The agent reads it before giving the next part.
3. A deviation is a finding about the test or the product first, never the owner's mistake: the test file is corrected at once and a lesson is written in `docs/LESSONS.md`.

## Run record

After the run, the agent appends a record at the end of the test file, in this format:

```
## Run record

- Date and VS Code version:
- Matched: (steps whose result was as expected)
- Deviated: (step, expected, seen, what was changed in the test or the product)
- Not shown: (what could not be observed, and why)
```
