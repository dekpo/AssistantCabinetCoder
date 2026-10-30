# Implementation plan: the VS Code extension "Assistant Cabinet Coder" (revised 27 October 2026)

Project: **AssistantCabinetCoder** (folder `C:\Users\dwyol\Documents\CURSOR\AssistantCabinetCoder`, remote `https://github.com/dekpo/AssistantCabinetCoder.git`). It replaces the first plan, which called the project `AssistantCabinetVSCode`. The binding rules of every chat are in `COMMON-RULES.md`; the contract with the server is `docs/IDE-CONTRACT.md` (tracked); the lots are the `SESSION-X*.md` files, one per chat. This plan is a local session document (the folder is in `.gitignore`); anything of it that is committed is in English.

## 1. What it is, and how it is installed

An ordinary VS Code extension, delivered as **one `.vsix` file**: in VS Code, Extensions view, menu `...`, **Install from VSIX...** (or `code --install-extension file.vsix`). No marketplace, no account, no installer. The server's MSI does **not** deliver the file.

## 2. What the extension brings to VS Code

| In VS Code | What the extension does | Lot |
| --- | --- | --- |
| Connection | Finds the server (reads `server.env` on the server's own machine), HTTPS with the authority file, API key in VS Code's secret store, connection test, content-free log, status bar | X1a |
| Chat model picker | Adds the server's models, with their window, tools and images | X1b |
| **Ask**, **Agent**, **Plan** modes (Local session) | Translates VS Code <-> server faithfully: text, tool calls, tool results, pasted images | X1b |
| Tool for images | `cabinet_view_image`: reads an image **on this machine** and shows it to a model that can see (or, with the server's vision alias, describes it) | X2a, X2b |
| Tool for documents | `cabinet_read_document`: reads a PDF, Word, Excel, PowerPoint, CSV or scanned file **on this machine** and has the server turn it into text | X2b |
| Agents list | 5 agents shipped in the `.vsix` (Implementer, Reviewer, Architect, Debugger, Test Writer) plus a command that copies the administrator's catalogue into `.github/agents/` after a preview | X3 |
| Release | Robustness, security review, `.vsix`, final README, full human test | X4 |

**Reading, creating and editing files, running the terminal or the tests: the VS Code Agent does it, on this machine, with the user's approvals.** The extension does not reimplement it; it gives the agent a good model and the two tools VS Code lacks (documents and images).

## 3. What was verified in the VS Code documentation (dated 21 October 2026) and its code

- An extension can provide models to the chat (`languageModelChatProviders`), with tools and images.
- **Models brought by the user work without a GitHub sign-in and without a Copilot plan, even offline.** My biggest doubt, lifted by the documentation, **to be confirmed by the probe X0** on the owner's VS Code.
- **Plan** exists in the Local session (`/plan`), with its model set by `chat.planAgent.defaultModel`.
- Limits stated by VS Code: **inline suggestions** (ghost text) and **semantic search** need a Copilot plan, so they will not be available; for a Copilot Business/Enterprise account the GitHub administrator can disable the "bring your own model" policy.
- A model without tool calling is not offered to the agents: the extension announces "tools" only if the server confirms it.
- Custom agents are `.agent.md` files; **a `.vsix` installed by hand cannot register agents dynamically** (a "proposed" API), hence the sync command. The static `chatAgents` contribution for the shipped agents is to be confirmed by X0.

## 4. The lots (one chat per lot; none above about six hours, per the practices)

The first plan had four lots (X1 at 14 to 18 hours and X2 at 7 to 10 hours were too big). X1 is now X1a and X1b; X2 is X2a and X2b.

| Lot | Branch (from the previous one) | Content | Estimate | Owner's test | Needs on the server side |
| --- | --- | --- | --- | --- | --- |
| *setup* | `docs/setup` | `.gitignore`, the practices, the contract (done by the planning chat; the owner commits it) | - | none | - |
| **X0** | `feat/x0-spike` | **Probe**: repository set-up, a throw-away spike extension and a script for the owner (about 40 min); measures what VS Code really sends, sign-in-free use, images, attachments, shipped agents, tool names, `when` clauses. **Stops and waits for the owner's go.** | 2 h | about 40 min | none |
| **X1a** | `feat/x1a-foundations` | **Foundations**: manifest and settings, server discovery, HTTPS transport with the authority file, SSE parser, typed client for `/health` and `/ide/v1/models`, key in the secret store, commands, status bar, content-free log, **stub gateway**, privacy and risk guard tests | 6 h | about 15 min | none (stub; `GET /health` of the tower works today) |
| **X1b** | `feat/x1b-provider` | **Model provider**: models in the picker, full conversion in both directions, streaming, tool calls, images, calibrated token count, error messages, spike removed, README | 8 h | about 40 min | Lot 15b + `IDE_ENABLED=on` (or the stub) |
| **X2a** | `feat/x2a-view-image` | **Image tool, `view` mode**, and the shared path-safety and size rules for both attachment tools | 4 h | about 15 min | none |
| **X2b** | `feat/x2b-read-document` | **Document tool** and `describe` mode through `POST /ide/v1/files/analyze`, availability from `features` | 5 h | about 25 min | Lot 17b (and 17a) (or the stub) |
| **X3** | `feat/x3-agents` | **Agents**: five shipped agents, sync of the server's catalogue (preview, marker, never a silent overwrite) | 5 to 7 h | about 25 min | Lot 16 (or the stub) |
| **X4** | `feat/x4-release` | **Robustness, security, `.vsix` release**, final README, full human test | 5 to 7 h | about 60 min | all |

Every lot is tested first against the **stub gateway** shipped with the extension (`npm run stub`), so the extension and the server advance in parallel now that the contract is frozen. The server's lots are 15a (done), 15b, 16, 17a, 17b, 18 and 19; 18 (large machines) and 19 (optional keys limited to the editor) have no extension lot but X4's compatibility table mentions them.

## 5. Safeguards

- **Zero runtime dependency** (Node's built-in modules only), pinned dev dependencies, no install script, no telemetry, no network call outside the configured server (tests check it in the sources).
- **Settings in `machine` scope**: a booby-trapped project folder cannot redirect the key to another server.
- **The key** lives only in VS Code's secret store, never in a setting, a log or a message.
- **The log** carries only codes, durations and token counts: never text, tool arguments, file names or keys.
- **The two attachment tools cannot write anything** (a test forbids write functions in those modules) and refuse paths outside the workspace folder without explicit confirmation.
- **Agent files**: the file name comes only from a validated identifier, written only under `.github/agents/`, marked "managed by Assistant Cabinet Coder", previewed before writing, never over a hand-made file.
- **Made to be changed by an AI**: small single-purpose modules, pure functions, everything tested without VS Code, `docs/ARCHITECTURE.md` updated by every lot, decisions and lessons written down.
- **Security notes for the README** (from the server project): the server runs plain HTTP and, on the tower, no authentication; once the editor surface is on, anyone who reaches the port can use it, and source code crosses the network in clear. The README tells administrators to use HTTPS (the authority file through `Select CA File`) and, when the server has keys, a key, on any shared network.

## 6. What the owner provides

- At the start of X0: the **publisher name** (default `assistantcabinet`) and the **licence** of the extension (the agent proposes MIT or Apache-2.0 and does not invent one), and the go-ahead for the list of dev dependencies.
- Play the X0 probe (about 40 minutes) and say "go"; then one short human test at the end of each lot.
- Run the git commands the agent gives (the agent never commits).

## 7. Risks

- **VS Code moves fast** (the AI APIs change every month): the probe X0 fixes the minimum version, and X4's compatibility table ties extension version, `ide_api` and server version together.
- **Agent/Plan quality** is made by the model and its window (32 768 tokens or more); the extension cannot replace it. The small models on the tower will not do well at it.
- **No ghost-text completion**: out of scope while VS Code requires a Copilot plan for it.
- **macOS**: discovery has the macOS path but it is not claimed tested without a Mac (the owner expects one on 28 October 2026).
- **Remote windows (WSL/SSH)**: discovery reads the machine the extension runs on; the probe (h) records where it runs.
