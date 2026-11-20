# Prompt for the server project: a development mode for coding with the editor extension

Written on 19 November 2026, with the measurements of 20 November 2026 added, by the extension project (`AssistantCabinetCoder`, Lot X1d) at the owner's request, to be run in a chat opened on `AssistantCabinetServer`. It carries measurements and proposals; **the owner decides**, and the server project's own rules apply in full.

## How to use this prompt (for the agent of the server project)

1. Read first, as every chat of the server project does: `AGENTS.md`, `docs/IDE-VSCODE-SESSION/COMMON-RULES.md`, `docs/DECISIONS.md`, `docs/LESSONS.md`, `docs/IDE-CONTRACT.md`, `docs/CONFIGURATION.md`, `docs/LONG-DOCUMENTS-AND-CONTEXT-WINDOW.md`, `docs/MODEL-MANAGEMENT.md`, `docs/MODEL-LICENCE-EVIDENCE.md`, `docs/IDE-VSCODE-SESSION/SESSION-LOT-18-big-machine-readiness.md` and `docs/handoffs/CODER-EXTENSION.md`.
2. **Build nothing at first.** Check each fact below against the server's code and documents, then report to the owner in French, in plain words: what is confirmed, what is wrong in this prompt, and a proposal split into lots (goal, files, estimate, human test), with a recommendation. Wait for the owner's choice.
3. Never change the settings, models or services of a running server: every server step is the owner's, given as commands with what they change and how to undo them. The extension project is never changed from here; a change of `docs/IDE-CONTRACT.md` is made here and the owner copies it to the extension.
4. Every new behaviour is additive and off by default, as the server's rules require: a machine that does not turn the development mode on behaves exactly as today.

## Why (the owner's decision, extension decision D-024)

The developers who will code with this solution use a server dedicated to coding and do not use the desktop application at the same time. The extension's real tests are to be judged in those conditions. The owner is installing large code models for this, for example `devstral-2` (123B, licence given by the owner as a modified MIT licence, `https://ollama.com/library/devstral-2`). A 32768-token window is a floor that the editor's Agent mode just fits; the comfortable answer is larger windows on a server set up for coding: a **development mode**.

## What the extension measured (VS Code 1.147.0, macOS, signed out, 19 November 2026)

Measured with the extension's stub and a count-only build of the extension that was never committed (extension decision D-023, lesson 17):

- **The editor's static prompt is large.** An Agent turn sends a system message of 23647 characters and **59 tool definitions whose JSON is 76601 characters**, plus about 800 characters of context: about **101000 characters before the user's first word**. Plan sends 61 tools (78875 characters of JSON). The history comes on top, turn after turn.
- **The editor refuses a turn when its own count of that static prompt exceeds the model's input budget** ("static system messages and tool definitions exceed this model's context budget"). It counts with its own tokenizer and never asks the extension. Probe models: 24576 input tokens refused, 28672 accepted. So the static prompt is between about 24500 and 28700 tokens by the editor's count.
- **The extension's answer (D-023, version 0.2.2):** the input budget it reports is the window minus a reserve of an eighth of the window (at least 2048 tokens, never more than `max_output_tokens`). That gives 28672 for a 32768-token alias, 57344 for 65536 and 114688 for 131072. It sends no `max_tokens`. **The extension needs no change for larger windows.**

Then measured against the owner's Mac server on 20 November 2026 (extension human test X1d, Parts 2 and 2b; server settings unchanged by the test):

- **`qwen2.5-coder:14b` (window 32768):** Agent and Plan requests were refused with `context_too_large` 413 in under 10 ms each, before any model was loaded, as Finding 1 predicts. **The editor retried each refusal five times** (six identical 413 requests per prompt, about 15 seconds), so the server's logs and counters see six refusals for one user action.
- **`devstral-2` (window 65536, ceiling 16384), set up by the owner:** an Agent turn created a file (one tool call, then a final answer) and a Plan turn answered; no refusal.

  | Request | Duration | `prompt_tokens` (the model's own count) |
  | --- | --- | --- |
  | Agent, first request of the chat | 219 s | 21597 |
  | Agent, second request (after the tool call) | 6 s | 21678 |
  | Plan, first request of a new chat | 201 s | 23747 |

  So the real tokenizer gives **about 4.7 characters per token** for the editor's static prompt (about 101000 characters), not 2. The runtime reused the prompt start within a chat (6 s), but Plan, whose system message and tools differ from Agent's, was read again in full: the first turn of every chat costs three to four minutes with this model on this machine. The owner found it slow and is installing `gpt-oss:120b` to compare.

## Finding 1: the window-overflow guard refuses every Agent request on a 32768-token alias

Read in the server's source (read-only, branch `develop`, 19 November 2026): `api/ide_openai.py` adds the JSON of the tools to the texts it counts (`prompt_chars`), and `api/ide.py` (`check_ceilings`) refuses with `context_too_large` 413 when `prompt_chars / 2 > context_window`. For the editor's Agent request, about 101000 characters gives about 50000 "estimated tokens", above 32768, and above 40960 too. So **with VS Code 1.147.0, Agent and Plan are refused by the server on every alias whose window is below about 51000 tokens**, although the editor now sends them (seen on 20 November 2026 with `qwen2.5-coder:14b`, see above). The same request measured 21597 real tokens on `devstral-2`, so it would fit a 32768-token window with room to spare: the guard refuses requests that are not certain overflows.

The contract sentence ("a request whose text characters divided by 2 already exceed the alias's `context_window`") does not say that the tools count; the code counts them. At least the contract needs to say it.

Proposals, for the owner to choose (check them first):

- (1a) Count the tool definitions at a ratio closer to what a tokenizer gives for JSON schemas (one measurement above: about 4.7 characters per token for the whole request on `devstral-2`; confirm it on other models with the runtime's `prompt_eval_count`, for example with `scripts/measure_ide_context.py`), or leave them out of the "certain overflow" estimate, which then stays certain for the text alone.
- (1b) Make the ratio of the guard a setting (default unchanged, 2 characters per token), which the development mode raises.
- (1c) Whatever is chosen: say in `docs/IDE-CONTRACT.md` whether the tools count, so the extension can explain a refusal.

## Proposal 2: a development mode for a server dedicated to coding

Off by default; one documented switch turns it on (a setting, or a `cabinet` command that writes several settings, as the owner prefers), with `cabinet config check` and `cabinet doctor` telling the administrator what it changed. Candidates, each to be checked against the code and the decisions of Lot 18:

- **Larger windows for the code aliases**: 65536 or more (131072 for a professional code model on a large machine), never above the model's own maximum (`effective_context_window`). The current advice ("an alias meant for Agent or Plan should get 32768 tokens or more", contract section on settings) becomes, measured on VS Code 1.147.0: 32768 just fits the editor, 65536 or more is comfortable.
- **The memory of long windows**: the Lot 18 keys `OLLAMA_KV_CACHE_TYPE` (`q8_0` halves the cache of `f16`) and `OLLAMA_FLASH_ATTENTION`, with a sizing table for a 123B model at 65536 and 131072 tokens on the owner's 128 GiB Mac.
- **Keeping the code model loaded**: `OLLAMA_KEEP_ALIVE` and `OLLAMA_MAX_LOADED_MODELS` chosen so that a 123B model is not reloaded between turns, and the reuse of the prompt prefix by the runtime (each turn resends about 101000 characters of the same static prompt) checked with `OLLAMA_NUM_PARALLEL`.
- **Time limits**: `IDE_REQUEST_TIMEOUT_SECONDS` against the real time to the first token of a large model on the editor's prompt (measured: about 200 to 220 s for `devstral-2` on about 22000 to 24000 tokens, within the default 900 s; the extension also waits 900 s of silence by default). Keep in mind that the editor retries a failed request five times (see above): a timeout would be paid six times.
- **The speed of the first turn**: the editor's prompt start differs between Agent and Plan, and each new chat starts cold; check whether the runtime can keep more than one prompt start cached, and compare a mixture-of-experts model (`gpt-oss:120b`, which the owner is installing) with `devstral-2` on the same request.
- **The overflow guard** of Finding 1, with the development mode's ratio.
- **Hiding the large code models from the desktop** with `IDE_ONLY_ALIASES`, if the owner wants them on the editor surface only.
- **A warning** from `cabinet config check` (or `doctor`) when an alias meant for the editor has a window below 65536 tokens.

## Proposal 3: report each model's own maximum window (contract, additive)

An optional field in `GET /ide/v1/models` (for example `max_context_window`, the model's own maximum) would let the extension's Test Connection say "this alias may be raised up to N tokens with `cabinet models context`". Additive: an older extension ignores unknown fields.

## Proposal 4: devstral-2 as the reference code model of the development mode

The owner installed it on 20 November 2026 and the server lists it as `devstral-2` with a window of 65536 and a ceiling of 16384; it works in Agent and Plan (see above) but its first turn is slow. Still to check before the owner relies on it, and the same for `gpt-oss:120b`: its Ollama tag and size; its own maximum window; whether its Ollama template supports tool calling (the editor sends tools in every mode, and a model without tool calling is never offered in Agent); its licence terms against the server's model policy and `docs/MODEL-LICENCE-EVIDENCE.md`; its memory at 65536 and 131072 tokens with and without `q8_0`; its speed on the Mac (time to first token on a prompt of about 30000 tokens, tokens per second). The owner installs and sizes it; this chat gives the commands.

## Carried over from the extension's earlier runs

- In Ask mode, `qwen2.5-coder:14b` answered with a tool call written as plain JSON text (a block naming a tool `ask_user`), not as a real tool call (extension human test X1b, Part 5 step 3, 19 November 2026): a question for the server's handling of that model's tool calls, or for the model itself.

## What the extension project needs back

The owner's choice, and, if the contract changes, the new `docs/IDE-CONTRACT.md` to copy over; and the name of the code alias the development mode recommends (today `devstral-2` at 65536 tokens; perhaps `gpt-oss:120b` after the comparison), so that the extension's next real tests run Agent and Plan with it (extension decision D-024).
