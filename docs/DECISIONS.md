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

## D-009 Lot X0 verdict: Go with changes

27 October 2026, decided by the owner after the run recorded in `docs/SPIKE-FINDINGS.md` (VS Code 1.143.1 stable, signed out, no Copilot plan, folder trusted). Evidence: the provider's model, the editor's own file tools, an image in a tool result, an attached or pasted image, the shipped agent and the `when` clause all worked without any sign-in. Changes to the plan: a System role is handled by the conversion; a model without tool calling is never shown in the chat; a PDF is text only, so Lot X2b stays necessary; the `model:` string of agent files is tested first in Lot X3; remote windows are retested before the release. Lot X1a starts from `feat/x0-spike`.

## D-010 The extension activates on `onStartupFinished`

27 October 2026, decided by the agent in Lot X1a and reported to the owner, who may reverse it. The Lot X1a text says "activation only when needed (never `*`; commands activate it)". But the status bar item (`Cabinet: connected | off | key needed | unreachable`) must exist before any command is run, so the extension also activates once VS Code has finished starting. It never uses `*`. At that moment it makes one request to the configured (or locally discovered) server and to no other host; with no server configured and none found, it makes no request and the status bar item stays hidden. The manifest test accepts only that one event. The provider's own event is added by Lot X1b.

## D-011 Small additions to the lot's lists

27 October 2026, decided by the agent in Lot X1a and reported to the owner. (1) `src/codes.ts` is a module of its own (machine codes and `CabinetError`), because `transport`, `sse`, `client`, `log` and `messages` all need the codes and none may import another's internals. (2) Three more status-bar states than the four named in the lot, `Cabinet: certificate`, `Cabinet: version` and `Cabinet: error`, because showing a wrong certificate or an interface mismatch as "unreachable" would point the user at the wrong fix. (3) A discovered `server.env` that lacks `SERVER_BIND_ADDRESS` or `SERVER_PORT` uses the server's own defaults (`127.0.0.1`, `8080`, from the server's `docs/CONFIGURATION.md`); a file with none of the five keys is "no settings". (4) The package contents are chosen with the `files` list of `package.json` (compiled sources, `LICENSE`, `README.md`) instead of a `.vscodeignore`, to stay inside the lot's file list. (5) The `.vsix` is built by `npm run package`; `npm run stub` builds first, then starts the stub.

## D-012 The test authority is built with `node:crypto` alone

27 October 2026, decided by the agent in Lot X1a. Node cannot issue certificates and the HTTPS tests must pass on any machine, so `test/support/pki.ts` writes the few X.509 structures it needs (ECDSA P-256, basic constraints, key usage, subject alternative names) by hand and signs them with `crypto.sign`. No OpenSSL, no new dependency; the authority is created in memory at run time and never stored (`*.pem` is ignored by git). The demo (`npm run stub -- --https FOLDER`) writes only the public authority file.
