# Lot X4: robustness, release and the full human test

> **Read first:** `docs/VIBE-CODING-PRACTICES.md`, `docs/SESSION/COMMON-RULES.md`, all of `docs/` of this repository (`ARCHITECTURE`, `DECISIONS`, `LESSONS`, `HUMAN-TESTS-PROTOCOL`, `SPIKE-FINDINGS`, every `docs/human-tests/` file with its run record), `docs/IDE-CONTRACT.md`, the server repository's `docs/USER-GUIDE.md` section on the editor surface (read-only, if Lot 15b is done), and the server lots' reports for the compatibility table.

Branch: `feat/x4-release`, from the newest accepted extension branch. Estimate: 5 to 7 hours of agent work plus the owner's full human test (about 60 minutes, on a real server). Needs: the server's lots as far as they are done; the rest is tested against the stub and said so.

## Goal

An extension the owner can install from a file on a colleague's machine, that survives real use for a full working day with long agent sessions, and that can be changed later by an AI without fear.

## Files this lot may change or create

Create: `docs/SECURITY.md`, `CHANGELOG.md`, `LICENSE` (only once the owner has named the licence in Lot X0: it is in `docs/DECISIONS.md`), `.vscodeignore`, `docs/human-tests/X4-full.md`, release scripts, new robustness tests.
May change: any `src/` module **to fix a defect a test of this lot reveals** (each such change has its test and a line in `docs/LESSONS.md`), `package.json` (scripts, `files`, version metadata only), `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/LESSONS.md`, `test/stub-gateway/` (additive).
**Untouchable:** `docs/IDE-CONTRACT.md`, `docs/VIBE-CODING-PRACTICES.md`, every existing test file (new tests are new files), the bundled agents' meaning (only a defect, with the owner's agreement).

## Baseline

Run the whole suite before the first edit; record the count.

## Do

1. **Long sessions and failures** (each one a test with the stub): a conversation of 300 requests does not grow memory without bound (caches are bounded; the calibration table has one entry per model); a server restart in the middle of a stream gives one clear message and the next request works; a stream that stalls longer than the timeout is aborted and reported; a `server_busy` answer is reported with its meaning and, for an **idle** request only, retried once after the delay the server gave (no retry of a request that already produced output); `rate_limited` with `Retry-After`; `context_too_large` explains that the conversation exceeds the model's window and what the user can do (start a new chat, attach less); an expired or rotated certificate (the authority file is re-read each request, so a renewed server certificate under the same authority needs nothing); the key cleared while a request is running; many models; a model list refresh while a request runs.
2. **The model-picker experience**: stable ordering, readable names, the tooltip with window and capabilities, and an empty-state message in `Test Connection` that says exactly what to do for each failure (off, key needed, unreachable, certificate untrusted, version mismatch). Most of it exists since Lots X1a and X1b: check it, and test what is not yet tested.
3. **Hardening review** written as `docs/SECURITY.md` of this repository: what the extension reads and writes (list), what it sends and where (list), the key's life, the settings' scope, the two tools and their boundaries, the agent files it writes and how they are marked, what a hostile workspace or a hostile server could try and why it fails (a workspace cannot move the key; a server cannot make the extension write outside `.github/agents`, read outside the workspace, or run a command; a server's instructions are shown in a preview before they are written). Each claim has a test or is marked "by reading" with the file and line.
4. **Release.** `npm run package` produces `assistant-cabinet-coder-<version>.vsix` (`vsce --no-dependencies`; a `.vscodeignore` that ships only compiled code, the bundled agents, `README.md`, `CHANGELOG.md`, `LICENSE` and the manifest; no source maps; `vsce ls` output checked by a test); the SHA-256 printed; an SBOM of the dev dependencies for the release folder (**ask the owner before adding any tool for it**; the default is a small script that reads `package-lock.json` and writes a CycloneDX JSON, no new dependency); version `0.1.0` stated in `CHANGELOG.md`, with a **compatibility table** (extension version -> `ide_api` -> the server MSI versions known to carry it, filled from what the server lots report; it mentions the server's Lot 18 (large machines) and Lot 19 (optional keys limited to the editor) even though they have no extension lot). A GitHub Actions workflow only if the owner agrees: lint, tests, `vsce package`, no secrets, artifacts attached to the run.
5. **README, final.** Install in four lines for a non-developer: *Extensions view > ... > Install from VSIX...* (or `code --install-extension`), set the server (nothing to type on the server's own machine), `Assistant Cabinet Coder: Set API Key` if the server asks, pick the model, choose Ask, Agent or Plan with Session Target = Local. Uninstall. What to do for each message. Honest limits. Privacy statement. How the server side is turned on (`cabinet-server config set IDE_ENABLED=on`, restart), pointing to the server's guide; the plain-HTTP security note of the plan (HTTPS and a key on any shared network).
6. **`docs/human-tests/X4-full.md`, the full script** (merge the parts of the earlier lots into one run top to bottom, Git Bash, each part with "You start with / You leave with", one backup and one restore): install; connection; Ask; Agent on a small real task in a scratch folder; Plan then "Start Implementation"; an image; the three document types; the bundled agents; sync agents; stop button; server restarted mid-answer; HTTPS and key; the surface switched off and on; uninstall. Walk everything you can with the stub and say what only VS Code can show.
7. **Lessons**: `docs/LESSONS.md` was written along the way; check that every mistake found in all lots is in it, numbered without gaps, and that each one names the rule that prevents it.

## Done means

Full test run green once and the count compared with the baseline; lint clean; the `.vsix`, its SHA-256 and the SBOM listed; `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, README, CHANGELOG, `docs/human-tests/X4-full.md` complete. Report in French (COMMON-RULES section 6): what the owner installs, how to try it in ten minutes, what was not walked, the residual risks without softening, and the git commands.

---

Binding rules, identifiers and VS Code facts: `docs/SESSION/COMMON-RULES.md`.
