# Spike findings (Lot X0)

Filled after the owner's run of `docs/human-tests/X0-spike.md`. **These measured facts override every assumption in `docs/SESSION/COMMON-RULES.md` section 8.** Each answer records what was seen (numbers, names, kinds; never message text), the VS Code version it was seen on, and what it changes.

Status: **not run yet.**

## (a) VS Code version, channel, install of the `.vsix`, signed-out state

_(to be filled after the run)_

## (b) Chat without GitHub sign-in or Copilot plan: models in the picker, modes, messages

_(to be filled after the run)_

## (c) What Ask, Agent and Plan hand to the provider

_(to be filled after the run)_

## (d) Pasted images and attachments (image, text file, selection, `#file`, PDF)

_(to be filled after the run)_

## (e) The image inside a tool result

_(to be filled after the run)_

## (f) The static custom agent: listed, tools respected, model used, exact model string

_(to be filled after the run)_

## (g) Workspace settings against a `machine`-scoped setting

_(to be filled after the run)_

## (h) Remote windows: on which side the extension runs

_(to be filled after the run)_

## (i) Tool names in Agent, and whether the editor's file and search tools reach a provider's models

_(to be filled after the run)_

## (j) Telemetry-related settings and chat features the guide must tell users to review

_(to be filled after the run)_

## (k) A `when` clause on a contributed tool

_(to be filled after the run)_

## Decision (the owner alone writes it)

**Verdict:** _(Go / Go with changes / Stop)_

_(If "Go with changes": what changes. If "Stop": why.)_

### Outcomes that change the plan (written in advance)

- Agent or Plan do not offer the provider's models without sign-in: the next lots keep the provider, but the user guide must say what the user has to do.
- Images or attachments arrive differently from the rules in COMMON-RULES: the conversion of Lot X1b changes.
- `chatAgents` does not work in a sideloaded `.vsix`: Lot X3 keeps only the sync command.
- A `when` clause does not hide a tool: Lot X2b registers the tool always and answers with a clear message when the feature is off.
- The editor's file tools are not offered to a provider's models: **Lot X2a stops** and the owner decides.

## Pre-run evidence (read in the installed VS Code, not yet seen working)

Read on 27 October 2026 in the bundle of the VS Code installed on the owner's machine (1.142.0; an update to 1.143.1 was already downloaded). This is what the editor's code declares, not a measured behaviour:

- The `chatAgents` contribution point exists. An entry requires `path`; `name` and `description` are accepted but marked deprecated (they come from the agent file's frontmatter); `when` and `sessionTypes` are accepted. The probe uses `path` only.
- `languageModelTools` entries accept `when`, `toolReferenceName`, `canBeReferencedInPrompt`, `tags`; a tool `name` must match `^(?!copilot_|vscode_)[\w-]+$`, so names with a dot are refused.
- `languageModelChatProviders` generates the activation event `onLanguageModelChatProvider:<vendor>` by itself, and `languageModelTools` generates `onLanguageModelTool:<name>`.
- Telemetry settings present: `telemetry.telemetryLevel`, `telemetry.enableCrashReporter`, `telemetry.enableTelemetry`, `telemetry.feedback.enabled`, `telemetry.captureContent`. Chat settings present: `chat.disableAIFeatures`, `chat.planAgent.defaultModel`, `chat.agent.enabled`, `chat.agent.maxRequests`, `chat.tools.global.autoApprove`, `chat.tools.terminal.autoApprove`, `chat.tools.edits.autoApprove`, `chat.agent.networkFilter`.
- The Copilot Chat extension is built into this VS Code (188 settings under `github.copilot.*`).
