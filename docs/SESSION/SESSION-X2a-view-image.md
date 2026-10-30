# Lot X2a: the image tool, `view` mode, and the safety rules shared by the attachment tools

> **Read first:** `docs/VIBE-CODING-PRACTICES.md`, `docs/SESSION/COMMON-RULES.md`, `AGENTS.md`, `docs/DECISIONS.md`, `docs/LESSONS.md`, `docs/ARCHITECTURE.md`, `docs/HUMAN-TESTS-PROTOCOL.md`, **`docs/SPIKE-FINDINGS.md`** (items (d), (e), (i), (k)), the VS Code guide `api/extension-guides/ai/tools` (tools, `prepareInvocation`, confirmation, `LanguageModelToolResult`), and the conversion of tool-result images in `src/convert.ts` (Lot X1b).

Branch: `feat/x2a-view-image`, from `feat/x1b-provider` once the owner has accepted it. Estimate: 4 hours of agent work plus the owner's test (about 15 minutes). Needs nothing from the server for `view` mode.

## What this lot is and is not

The editor's own agent tools already **read, create, edit and search files, run commands and tests** on the developer's machine, with the user's approvals: this extension does not reimplement them. What the editor cannot do is read a PDF, a Word file, a spreadsheet or a presentation (Lot X2b), or look at a screenshot with a model that cannot see (Lot X2b, `describe` mode). This lot adds the **image tool in `view` mode** (the image itself goes to a model that can see) and the path-safety, size and confirmation rules that both attachment tools share. Nothing in this lot writes.

**Contingency:** if the spike's (i) shows that the editor's file tools are **not** available to a provider's models, stop and report; the owner decides whether a small set of workspace file tools with approvals is added in a separate lot.

## Files this lot may change or create

Create: `src/attachments.ts` (pure rules: path resolution, workspace containment, size limit, image signature check, confirmation text; the file system is passed in so tests use temporary folders), `src/tools.ts` (registration of `cabinet_view_image`), tests, `docs/human-tests/X2a-view-image.md`.
May change: `package.json` (the `languageModelTools` contribution, the setting `assistantCabinetCoder.maxAttachmentBytes`), `src/extension.ts` (registration only), `src/messages.ts` and `src/log.ts` (additions only), `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/LESSONS.md`.
**Untouchable (empty `git diff --stat feat/x1b-provider -- <paths>` in the report):** `src/transport.ts`, `src/sse.ts`, `src/discovery.ts`, `src/platform.ts`, `src/keys.ts`, `src/client.ts`, `src/convert.ts`, `src/provider.ts`, `src/tokens.ts`, `docs/IDE-CONTRACT.md`, `docs/VIBE-CODING-PRACTICES.md`, `docs/SPIKE-FINDINGS.md`, and every existing test file.

## Baseline

Run the whole suite before the first edit; record the count.

## Build

1. **`cabinet_view_image`** (`contributes.languageModelTools`: `name`, `displayName`, `modelDescription`, `userDescription`, `toolReferenceName: "cabinetImage"`, `canBeReferencedInPrompt: true`, `tags`, `inputSchema` with `path` (string, required)). In this lot it has no `mode` parameter and no `when` clause: it works without any server feature. It reads the file **locally** and returns `LanguageModelDataPart.image(bytes, mime)` so that a vision model sees the image itself. Only `png`, `jpeg`, `webp`, `gif`, with the **signature checked**, not only the extension; an image bigger than `assistantCabinetCoder.maxAttachmentBytes` (setting, default 20 MiB, machine scope) is refused with a clear message; a model that cannot see gets the clear message from the conversion (Lot X1b), and Lot X2b will add `describe` for it. The `modelDescription` is neutral (no profession) and short.
2. **Safety, binding, shared by both attachment tools** (`src/attachments.ts`). Neither tool ever writes anything. A path is resolved with `fs.realpath`; it must lie **inside an open workspace folder**; a path outside (or a symlink that leads outside) is refused unless the user confirms in the confirmation dialog, which must show the full resolved path, the size and the server that will receive the bytes (`prepareInvocation` with a `MarkdownString`; for `view` mode the image reaches the server as part of the chat request, and the text says so). Size limit checked before reading. File names and content never go to the output channel; the log line has the tool name, status, byte count, machine code. When the server URL is plain `http` on a non-loopback address, the confirmation says "this connection is not encrypted".
3. **Tests.** Path rules (inside, outside, symlink escape created in the test, `..` segments, a directory, a missing file, a file larger than the limit, a name with unusual characters, a path in another drive format); signature check for images (right extension wrong content, right content wrong extension); the result part (bytes and mime); confirmation text contents (full path, size, server, the plain-HTTP warning); no-leak (a unique secret in the file name and the file bytes never reaches logs or error messages); **no write APIs** (`fs.write*`, `fs.rm*`, `fs.unlink*`, `fs.mkdir*`, `fs.copy*`, `fs.rename*`, `fs.append*`, `fs.truncate*` are absent from the tool modules, enforced by a source-scanning test); the manifest test for the tool and the setting; the tool's description passes the neutrality guard.
4. **Docs.** README and `docs/ARCHITECTURE.md` updated; `docs/human-tests/X2a-view-image.md` (at most about 15 minutes): a screenshot of the owner's own non-sensitive material read with a vision model through `#cabinetImage` or by asking the agent; the refusal outside the workspace; the plain-HTTP warning; a model without vision (the clear message).

## Done means

Tests green and the count recorded against the baseline, lint and format clean, a `.vsix` builds, the human-test file written and walked as far as possible without VS Code. Report in French (COMMON-RULES section 6) with the git commands.

---

Binding rules, identifiers and VS Code facts: `docs/SESSION/COMMON-RULES.md`.
