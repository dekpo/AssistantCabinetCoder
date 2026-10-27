# Decisions

One entry per decision, dated, with the reason and who decided. Never reopened without the owner. New decisions take the next free number.

## D-001 The project and extension are named AssistantCabinetCoder

27 October 2026, decided by the owner. The folder, the remote and the npm name (`assistant-cabinet-coder`) follow it. The older session files and the vendored contract still say `AssistantCabinetVSCode`: same project; the contract copy keeps the old name on purpose until the server project updates it.

## D-002 No merge into `main` until the owner declares the product perfect

25 October 2026, decided by the owner. Work stays on lot branches, each new branch starts from the previous lot branch. No merge into `main` and no pull request is proposed.

## D-003 The practices of `docs/VIBE-CODING-PRACTICES.md` apply

27 October 2026, decided by the owner. The file is copied from the server project and kept current here: a practice that proves wrong is corrected in it the moment it is found.

## D-004 Publisher is `assistantcabinet`

27 October 2026, answer of the owner at the start of Lot X0 (recommended default accepted).

## D-005 Licence is MIT

27 October 2026, answer of the owner at the start of Lot X0 (recommended default accepted). `LICENSE` names Dekpo-Wyna Yologaza (the git user of the repository) as copyright holder; the owner may change the name.

## D-006 Tests use Node's built-in runner

27 October 2026, set by the Lot X0 specification and accepted by the owner. Tests are compiled by `tsc` and run with `node --test "out/test/**/*.test.js"`; no test framework is added, so no dev dependency for it.

## D-007 Dev dependencies and their exact versions

27 October 2026, go-ahead of the owner; versions checked with `npm view` the same day. All pinned exactly in `package.json`, lockfile committed, `.npmrc` sets `ignore-scripts=true` (the only install script in the tree, in `@vscode/vsce-sign`, is therefore never run; `vsce package` does not need it).

| Package           | Version | Licence    |
| ----------------- | ------- | ---------- |
| typescript        | 6.0.3   | Apache-2.0 |
| @types/vscode     | 1.140.0 | MIT        |
| @types/node       | 24.19.2 | MIT        |
| @vscode/vsce      | 4.0.0   | MIT        |
| eslint            | 10.13.0 | MIT        |
| @eslint/js        | 10.0.1  | MIT        |
| typescript-eslint | 8.72.1  | MIT        |
| prettier          | 3.9.10  | MIT        |

Two choices differ from the first proposal made to the owner:

- **TypeScript 6.0.3, not 7.0.2.** `typescript-eslint` 8.72.1 declares the peer range `typescript >=4.8.4 <6.1.0`, so TypeScript 7 cannot be used with the linter. Same licence.
- **`@types/node` 24.19.2, not 26.x.** The owner's Node is 24 (the latest 24 release of the types is used); `engines.node` is `>=22`.

`@types/vscode` is pinned to the same minimum as `engines.vscode` (`^1.140.0`), because `vsce` refuses a `@types/vscode` newer than the engine. The owner's VS Code at the time of Lot X0 is 1.142.0. Lot X0's findings may raise this minimum.

Known and accepted: `npm audit` reports two high-severity advisories in `@azure/msal-node` (through `@azure/identity`, a dependency of `@vscode/vsce` used only to publish to the marketplace). Nothing is published by this programme and the package is a development tool that never ships in the `.vsix`, so no fix is applied; `npm audit fix` would change pinned versions and is not run without the owner.

## D-008 The spike test runs in a separate VS Code profile

27 October 2026, decided by the agent for Lot X0 and reported to the owner. `docs/human-tests/X0-spike.md` opens VS Code with its own `--user-data-dir` and `--extensions-dir`. Reasons: the window starts signed out of GitHub with no Copilot, which is the situation of the intended users; the owner's real settings and extensions cannot change (a hash of the real user settings file before and after is the proof). The remote-window question (h) forces the extension side with the `remote.extensionKind` override instead of building a second package, which approximates a manifest value; the run record says so.
