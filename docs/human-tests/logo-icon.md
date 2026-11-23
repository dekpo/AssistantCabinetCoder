# Logo: the extension icon (record)

Branch `feat/logo-icon`, started from `feat/x1b-provider` (`3e63a74`). Work order: `AssistantCabinetDesktop/docs/SESSION-LOGO/CODER-LOGO-03-extension-icon-handoff.md`, which applies the logo selection the owner validated on 6 November 2026.

## What was done

- **Baseline:** `npm ci`, then `npm test`: 238 tests, 237 passed, 1 failed. The contract guard was red because the server's commit `cc5e7b8` (3 November 2026, decision D-067 of the server: the administrator's command is renamed to `cabinet`) changed two lines of the server's `docs/IDE-CONTRACT.md`. Lesson 7 applied: the owner was told, chose to copy the contract over, and the copy was checked with `cmp` and committed on its own (`2149ec6`).
- **Icon:** `images/icon.png` is a copy of the kit's `icones_rognees/puce_degrade_A_blanc_fond_transparent/png/256x256.png` (the gradient chip with a white A on a transparent background), checked with `cmp` (SHA-256 `ebb5f6bb...737ef`). Nothing was drawn, resized or re-exported, and the kit was not changed. Nothing from the handoff's "Rejected" list was used.
- **Manifest:** `package.json` gets `"icon": "images/icon.png"`, and the icon is added to the `files` list (decision D-011, item 4: the package contents are chosen there).
- **Test:** `test/icon.test.ts` (new) checks that the icon is declared and packaged, and that the file is a 256 x 256 PNG with an alpha channel.
- **Left out on purpose** (not in the selection): an activity-bar icon (the extension has no view) and a `galleryBanner` (no marketplace). The version stays 0.2.0: `test/manifest.test.ts` pins it, and an existing test is not edited without the owner.

## Walked by the agent

`npm test`: 240 passed, 0 failed. `npm run lint` and `npm run format`: no change. `npm run package`: `assistant-cabinet-coder-0.2.0.vsix`, 19 files (18 before), 46.1 KB. The package lists `extension/images/icon.png`, its manifest declares it as the default icon, and the packaged file is byte-identical to the kit's file.

## Run record

6 November 2026, on the owner's Mac (the first install of this extension on macOS). VS Code version: not shown. Installed with **Install from VSIX...**; the extension page shows version 0.2.0 and source VSIX.

- **Matched:** the icon is shown and readable in the Extensions view and on the extension's page, in a dark theme and in a light theme (two screenshots).
- **Deviated:** none for the icon.
- **Not shown:** the status bar (hidden by the panel in the screenshots).

## Finding made during the run: nothing in the chat

The owner saw no model in the chat and no icon or menu of the extension. Checked by the agent on the same Mac:

- **No icon in the left bar and no side menu: expected.** The extension contributes no view; it adds a model provider, six commands (Command Palette, category **Assistant Cabinet Coder**) and a status bar item on the right (`Cabinet: ...`), which opens the Manage menu.
- **No model in the chat: the server's editor surface is off.** A server is installed on this Mac (`/Library/Application Support/AssistantCabinetServer`, version 0.1.7). The extension's own discovery, run with the compiled `out/src/discovery.js`, finds it at `http://192.168.75.1:1975`. `GET /health` answers `200`, but `GET /ide/v1/models` answers `404`, because `server.env` does not set `IDE_ENABLED` (contract: `off` by default). The installed server has the editor routes, so turning the switch on is an administrator step on the server (`sudo cabinet config set IDE_ENABLED=on`, then `sudo cabinet restart`); it is not a defect of the extension. The status bar item should read `Cabinet: off` (expected, not yet seen).
- The X1b human test (`docs/human-tests/X1b-chat.md`) has not been played yet: its run record is still empty. It is the test that proves the models in the chat.
