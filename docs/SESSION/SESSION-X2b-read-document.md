# Lot X2b: the document tool and `describe` mode (PDF, Word, Excel, PowerPoint, CSV, scanned pages)

> **Read first:** `docs/VIBE-CODING-PRACTICES.md`, `docs/SESSION/COMMON-RULES.md`, `AGENTS.md`, `docs/DECISIONS.md`, `docs/LESSONS.md`, `docs/ARCHITECTURE.md`, `docs/HUMAN-TESTS-PROTOCOL.md`, **`docs/SPIKE-FINDINGS.md`** (items (d), (e), (i), (k)), `docs/IDE-CONTRACT.md` sections 2, 5 and 7, and the modules of Lot X2a (`attachments`, `tools`).

Branch: `feat/x2b-read-document`, from `feat/x2a-view-image` once the owner has accepted it. Estimate: 5 hours of agent work plus the owner's test (about 25 minutes). Needs: the server's Lots 17a and 17b for the real test (everything before that runs against the stub) and, for image description, a vision alias (`IDE_VISION_ALIAS`) set on the server.

## Goal

The agent can read a PDF, a Word file, a spreadsheet, a presentation or a CSV that lives on the developer's machine, and a model that cannot see can still be told what an image shows. Both go through the server's analysis route, with the safety rules of Lot X2a.

## Files this lot may change or create

Create: `src/analysis.ts` (the request body, the call to `POST /ide/v1/files/analyze` over the existing transport, and the formatting of the result), tests, `docs/human-tests/X2b-documents.md`.
May change: `package.json` (the `cabinet_read_document` tool, the `when` clauses), `src/tools.ts` (the new tool and the `describe` mode of `cabinet_view_image`), `src/attachments.ts` (additions only: media types by extension), `src/client.ts` (additions only: the `features` reading already exists, add the analyze call here only if it fits better than `analysis.ts`), `src/extension.ts` (context keys), `src/messages.ts` and `src/log.ts` (additions only), `test/stub-gateway/` (additive), `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/LESSONS.md`.
**Untouchable (empty `git diff --stat feat/x2a-view-image -- <paths>` in the report):** `src/transport.ts`, `src/sse.ts`, `src/discovery.ts`, `src/platform.ts`, `src/keys.ts`, `src/convert.ts`, `src/provider.ts`, `src/tokens.ts`, `docs/IDE-CONTRACT.md`, `docs/VIBE-CODING-PRACTICES.md`, `docs/SPIKE-FINDINGS.md`, and every existing test file.

## Baseline

Run the whole suite before the first edit; record the count.

## Build

1. **`cabinet_read_document`** (`contributes.languageModelTools`: `name`, `displayName`, `modelDescription`, `userDescription`, `toolReferenceName: "cabinetDocument"`, `canBeReferencedInPrompt: true`, `tags`, `inputSchema` with `path` (string, required) and optional `question` (string); `when` clause on the context key `assistantCabinetCoder.documentAnalysis`, which the extension sets from the server's `features.document_analysis`; if the spike's (k) shows the `when` clause does not hide a tool, register the tool always and answer with a clear message when the feature is off). The tool reads the file **locally** and posts it to `POST /ide/v1/files/analyze` (`mode: "extract"`), then returns the text (a header line with file name, pages, truncation, warnings, then the text) as a `LanguageModelToolResult` text part. Media types by extension for `pdf`, `docx`, `xlsx`, `pptx`, `txt`, `md`, `csv`, `json`; the server checks the content's signature (contract section 5), the extension does not trust the extension either and sends what it read. An image file given to this tool is not analysed here: the answer points to `cabinet_view_image`. For a scanned document, the contract's `describe` mode ("images and scanned pages through `IDE_VISION_ALIAS`") is used when `features.image_description` is on and the user's `question` is given; how the server treats scanned pages in `extract` mode is not fully specified: use what the contract says, write the observed behaviour in `docs/ARCHITECTURE.md`, and list any gap in the report.
2. **`cabinet_view_image` gains the parameter `mode`**: `"view"` (default, unchanged from Lot X2a) or `"describe"`: send the file to the server's vision alias through the analysis route (`mode: "describe"`, optional `question`) and return the description text. The `modelDescription` tells the model to use `describe` when it cannot see images. `describe` is refused with a clear message when `features.image_description` is off; `view` never depends on a server feature.
3. **Availability.** The extension reads `features` from `/ide/v1/models` (already done by `client`) and sets the context keys `assistantCabinetCoder.documentAnalysis` and `assistantCabinetCoder.imageDescription` each time the model list is refreshed; the document tool appears only when its feature is on. A server that returns `404` or `provider_capability_unsupported` for the route is handled with English messages (machine code only, as everywhere).
4. **Safety.** Exactly the rules of Lot X2a, reused from `src/attachments.ts` (inside the workspace or confirmed outside; full path, size and server shown; size limit; no write API; plain-HTTP warning). The file bytes go only to the configured server. The server's limits (`payload_too_large`, page limit, `truncated`) are shown in plain words. A file name or content never reaches the log.
5. **Tests.** The stub gains `POST /ide/v1/files/analyze` (scripted answers, an error mode, a slow mode, a `404` mode, a `provider_capability_unsupported` mode); request bodies sent (base64 length, `mode`, `question`, media types for each extension); result formatting with truncation, warnings and several pages; confirmation text; context keys follow `features` (on, off, a server without `features`); the `describe` refusal when the feature is off; the redirect of an image given to the document tool; no-leak (a unique secret in the file name and the file bytes never reaches logs or error messages); the source-scanning test of Lot X2a still passes for the new module (no write function); the neutrality guard for the new tool descriptions.
6. **Docs.** README and `docs/ARCHITECTURE.md` updated; `docs/human-tests/X2b-documents.md` (at most about 25 minutes): a PDF, a Word file, a spreadsheet and a screenshot of the owner's own non-sensitive material, read by asking the agent or through `#cabinetDocument`; the refusal outside the workspace; the plain-HTTP warning; the result with the vision alias missing; the tool hidden when the feature is off.

## Done means

Tests green and the count recorded against the baseline, lint and format clean, a `.vsix` builds, the human-test file written and walked as far as possible without VS Code. Report in French (COMMON-RULES section 6) with the git commands.

---

Binding rules, identifiers and VS Code facts: `docs/SESSION/COMMON-RULES.md`.
