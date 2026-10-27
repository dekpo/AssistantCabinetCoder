# Vibe-coding practices of this programme (copied from the server project, 27 October 2026)

Written in English, like every file of the repository. These are the working rules that kept `AssistantCabinetServer` safe to change by an AI for months (46 recorded lessons, 47 decisions, no regression reaching the owner's machine). The extension, `AssistantCabinetCoder`, follows the same logic. This file is tracked in git from the first commit of the repository; keep it current: a practice that proves wrong is corrected here the moment it is found.

## 1. The idea

An AI writes and changes the code; the owner decides, plays the human tests and owns git. Everything below exists so that an AI that has read none of the earlier conversations can still work safely: the repository, not the chat, is the memory.

## 2. The repository is the memory

- **`AGENTS.md`** at the root: the binding rules for any agent, short (language, git, privacy, terminal, tests, what never to touch). Read first in every chat.
- **`docs/DECISIONS.md`**: one numbered entry per decision (D-001...), dated, with the reason and who decided. Never reopened without the owner. New decisions take the next free number.
- **`docs/LESSONS.md`**: one numbered entry per mistake already made, written **the moment it is found** (what happened, the rule that prevents it). Read before touching anything that has bitten before. A mistake that is not written down is made again.
- **`docs/ARCHITECTURE.md`**: what each module does, the data flow of one request, where to add a feature; updated by every lot.
- **`docs/HUMAN-TESTS-PROTOCOL.md`** and `docs/human-tests/`: how a person tests and what each run showed.
- **Session prompts** (`docs/SESSION*`) are local, never committed; they are rewritten against the real state when their turn comes (a prompt written weeks earlier is stale: check the git log, the build numbers, the last test run).

## 3. The unit of work: one lot, one chat, one branch

- A **lot** is small enough for one chat. If its estimate is above about 6 hours, split it (the server's Lots 15 and 17 were each split in two). A chat that grows long loses detail; the files carry the work.
- A lot file has the same parts every time: goal and why; branch and where it starts; what to read first; **the files it may change** (everything else stays byte-identical); numbered steps; "done means"; the final report. It ends with a pointer to the shared rules.
- **One branch per lot**, named with a Conventional Commit prefix (`feat/...`, `docs/...`), each created from the previous lot's branch, never from `main`. The owner merges nothing into `main` until the product is declared perfect.
- The agent opens with a task list of at most eight lines with estimates, then gives one-line status updates, and ends with **one report**.

## 4. The safety net (before changing anything)

1. **Baseline run**: run the whole test suite once before the first edit and record the count. It proves the starting point is green and gives the number the final run is compared with.
2. **Golden (characterization) tests** for whatever must not move, written against the current behaviour and green before the change; they run in every state the change creates (feature absent, off, on).
3. **Guard tests** that make a rule executable: a language guard (no foreign language in code), a no-store test (a unique secret placed in every input must appear in no log, register entry or error), a neutrality guard beside each model-facing string, a drift test that fails when the documentation misses a command, setting or menu entry.
4. **Untouchable files** are listed per lot, and the report pastes an empty `git diff --stat <start branch> -- <those paths>` as proof. **An existing test is never edited to make it pass**: if one fails, the agent stops and tells the owner.
5. **Additive and off by default.** New behaviour sits behind a switch that is off, and is not even mounted or registered when off.
6. **Stop and ask** when a design in the lot file proves wrong against the code, when a dependency, download, model or licence needs a go-ahead, or when something promised looks impossible. A short question with a recommended option beats a silent guess.

## 5. Honesty about what was verified

- **Never claim what was not shown.** The agent cannot see the owner's screen or answer an administrator prompt: every click, prompt, installation or service step is the owner's, and the report says plainly what was walked, what was not, and what is "expected, not yet seen".
- Every expectation in a test script comes from a run or from the machine's real state, never from a neighbouring document. Facts about an external tool (an API, a runtime, an editor) are **checked against the pinned version**, with the evidence written in the decision.
- The agent walks every step it can before proposing a human test, on temporary copies, without touching real services.

## 6. Human tests

- **Short**: the owner's time is the scarce resource (two hours was too long, forty minutes was enough). Prove what is new, leave out what an earlier real run already proved, and say what was left out.
- A script, not a list: runs top to bottom, parts of at most about fifteen commands, "You start with" / "You leave with", one backup at the start and one restore at the end, every command written in full where it is asked (never "as before"), each command in its own block with the expectation outside it, the owner's wording in brackets where it differs.
- The owner pastes the output of each part and the agent reads it before giving the next. A deviation is a finding about the test or the product first, never the owner's mistake: the test file is corrected at once and a lesson is written. A **run record** (what matched, what deviated, what was not shown) is appended to the test file.

## 7. Git

- **Git is owner-only.** The agent never commits, stages, pushes or tags. It ends with the branch name, one-line Conventional Commit subjects and the **full copy-paste commands for the local repository and the remote**, written after reading `git status` and `git log`.
- **No AI attribution anywhere git-facing** (no model name, co-author trailer or "generated by" link, in a commit, a branch name or a pull request), whatever the tooling's default says.
- Local-only files (session prompts, secrets, build output) are in `.gitignore`; a prompt folder is ignored as a whole.

## 8. Supply chain and privacy

- **No runtime dependencies** where it can be avoided (the extension: Node's built-in modules only); development dependencies pinned to exact versions, a lockfile committed, no install scripts, no download the owner did not approve. Free licences only (Apache 2.0, MIT, BSD); copyleft needs the owner's decision.
- **No telemetry, no network call except to the configured server, no content written anywhere** (code, messages, tool arguments, file names and images included: logs carry codes, durations and counts only). A key lives in the platform's secret store and is never printed or logged.
- Privacy rules are **tests**, not intentions.

## 9. Code that an AI can change safely

- Small modules with one job each; pure functions wherever possible; every behaviour covered by a test that does not need the host application; the host's API behind one thin adapter.
- All user-facing messages in one file (`src/messages.ts`); machine codes, not sentences, cross module boundaries.
- Fakes and stubs for everything outside the repository (a stub server that scripts a tool call, an error, a slow first byte, a split stream, a version mismatch).
- **Seams for the second platform**: every operating-system call behind one module, so a new platform is an added implementation, never a rewrite. Nothing for a platform that cannot be tested is claimed tested.
- No dead code: what is removed goes with its tests, settings and documentation. No extra deliverable that was not asked for. Run only the test that proves the change while working; the full suite, the linter and the formatter once at the end.
- Frozen documents inside the shipped package, compared byte for byte after an extraction; a new version number for every build that is installed.

## 10. Language and tone

Every file (code, comments, tests, documents, commit subjects, machine codes, the prompts written for another chat) is **English**. The agent talks to the owner **in French, in plain words, without jargon**, in short sentences. Command-line tools speak English only.

## 11. Specific to this extension

- The server's contract (`docs/IDE-CONTRACT.md`, vendored from the server's `docs/IDE-CONTRACT.md`, which the server's Lot 15b commits; until then the server's copy is `docs/IDE-VSCODE-SESSION/IDE-API-CONTRACT.md`, byte-identical on 27 October 2026) is the only shared truth. The vendored copy is never edited here: a change of the contract is made in the server project and copied over. A test compares the two copies when both are present. A gap in the contract is written in the report, never guessed from the server's code.
- Tolerate what the server does not have yet: read `features` and `ide_api`, treat a `404` as "editor surface off", never assume a lot of the server exists. Each lot first runs against the stub server and only then against the real one.
- The server's lots (15a, 15b, 16, 17a, 17b, 18, 19) and the extension's lots (X0, X1a, X1b, X2a, X2b, X3, X4) advance in parallel; the mapping is in `docs/SESSION/PLAN-EXTENSION.md`, section 4. The binding rules of every extension chat are in `docs/SESSION/COMMON-RULES.md`; the repository's `AGENTS.md` (written in Lot X0) carries their short form.
- Lot files and human tests: a lot file lives in `docs/SESSION/` (local); the human-test script of a lot lives in `docs/human-tests/` (tracked), with its run record appended after the owner has played it.
