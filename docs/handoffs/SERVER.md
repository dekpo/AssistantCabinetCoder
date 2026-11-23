# Handoff from the extension to the server project

Written by the extension project (`AssistantCabinetCoder`) for the server project (`AssistantCabinetServer`), which reads it read-only (`git -C ../AssistantCabinetCoder show <branch>:docs/handoffs/SERVER.md`). The server writes its side in its own `docs/handoffs/CODER-EXTENSION.md`. Decision D-032 of the extension: each project writes what the other needs here **before** the other plans its next package, so that one package per platform carries everything; the owner carries a one-line message between the two chats.

## 1. Lot P0b: run record and verdict (23 November 2026)

Read in full: `docs/human-tests/P0b-panel-agent.md` (run record at the end) and `docs/DECISIONS.md` D-030, D-031, D-032 on the extension's branch `feat/p0b-panel-agent`.

**What the panel sends.** Every request of the agent loop carries a 500-character system prompt and four tool definitions (2 087 characters of JSON: `read_file`, `list_files`, `search_text`, `propose_edit`), then the conversation with every earlier tool call and result. One request per step, at most 12 steps per message, never retried; Stop closes the connection.

**Measured on the Mac (server 0.1.13, VS Code 1.147.0), from the extension's log:**

| Model               | Task              | Steps | Model time               | Valid tool calls         | Right result          | `prompt_tokens`, first and largest step |
| ------------------- | ----------------- | ----- | ------------------------ | ------------------------ | --------------------- | --------------------------------------- |
| `qwen2.5-coder:14b` | read a file       | 1     | 1.7 s                    | 0 (call written as text) | no                    | 666                                     |
| `qwen2.5-coder:14b` | find a definition | 1     | 0.7 s                    | 0 (call written as text) | no                    | 671                                     |
| `qwen2.5-coder:14b` | add a function    | 1     | 0.7 s                    | 0 (call written as text) | no                    | 679                                     |
| `gpt-oss:20b`       | read a file       | 5     | 6.2 s (2.8 s of loading) | 4 of 4                   | yes                   | 585, 874                                |
| `gpt-oss:20b`       | find a definition | 4     | 1.8 s                    | 3 of 3                   | yes                   | 591, 934                                |
| `gpt-oss:20b`       | add a function    | 7     | 12.3 s                   | 6 of 6                   | yes (run and checked) | 600, 1 387                              |

- **Plain-text tool calls.** `qwen2.5-coder:14b` never returned `tool_calls`: its whole answer was the call written as text, either a bare JSON object or a fenced `json` block, for example `{"name": "read_file", "arguments": {"path": "calc/operations.py"}}`. Same in three new conversations.
- **Prefix reuse.** For `gpt-oss:20b`, steps 2 and later received their first event in 0.1 to 0.35 s: the engine reused the prompt start.
- **Reasoning.** No hidden reasoning of `gpt-oss` showed in the answer text.
- **Language.** One final answer of `gpt-oss:20b` was written in Polish to an English message. The extension will strengthen its system prompt in its Lot P1.
- **For the guard's ratio.** The requests of Parts 3 and 4 were sent between 18:27 and 18:35 UTC on 23 November 2026. Their register lines on the Mac give `prompt_chars` against `prompt_tokens` for the panel's real requests (English, JSON and Python).

**The owner's verdict (extension D-031):**

- the panel: **Go with changes**;
- the provider in the editor's chat: **removed** in the extension's next lot;
- the plain-text tool calls: **seen with the server first** (its Lot 46);
- the next extension lots: P1 (finishing the panel), then documents and images, then the agent catalogue, then the release.

**The owner's principle for code models (D-031 (5)).** The product offers a short, tested and tuned range of code models, from small to medium to very large, not the whole catalogue. A model enters the range only after passing the panel's three tasks (read, search, edit with approval) with valid tool calls.

## 2. What the extension asks for the server's next package (Lot 46: Mac 0.1.14, Windows MSI 0.1.36)

Everything the extension can foresee up to its release is listed here, so that no other server package is needed before it.

1. **D-100 and D-101 in the packages** (already planned). The panel reads `features.stop_at_every_stage` and `max_context_window` from its Lot P1. It works without them on 0.1.13.
2. **Plain-text tool calls: the server's answer is needed.** Is it the engine's template for `qwen2.5-coder`, a setting, or the model itself? If the gateway converts it, a proposed rule: only on `/ide/`, only when the request offers tools, only when the whole answer text is one JSON object (bare or in one fenced `json` block) whose `name` is one of the request's own tools and whose `arguments` is an object; the result is a normal `tool_calls` entry with `finish_reason` `tool_calls`. If the server prefers not to, say so and the range simply leaves such models out.
3. **The range of code models (D-031 (5)), measured through the panel.**
   - Candidates small, medium and very large, among the server's aliases.
   - Measured on each machine profile with the panel's three tasks of the P0b test (read, search, edit with approval): the times and the valid-call counts.
   - The recipe (user guide 18.10) names that range and its windows.
   - Optional, only if it is cheap enough to ship in the same package: a field in `GET /ide/v1/models` that marks the aliases of the tested range (for example `data[].recommended_for_agent: true|false`; the name is yours, the panel would list them first and mark them). Without it, the range is simply the set of aliases the administrator exposes on `/ide/`.
4. **The ratio value and the warning.**
   - The panel's requests are small: at most 1 387 tokens in the P0b tasks, under 3 000 characters of fixed part. So 32 768 tokens is enough for small and medium tasks: lower the warning threshold (for example to 16 384) or drop it.
   - Keep the ratio's default at 2 and give the recipe value from the register lines above.
5. **No new endpoint, field or error code** is needed by the extension's lots of documents, images and agents: they use `POST /ide/v1/files/analyze` and `GET /ide/v1/agents` as the contract describes them.

## 3. When

- **Extension Lot P1** (finishing the panel) starts now and needs nothing new to be built. Its human test runs on 0.1.13 if 0.1.14 is not installed, and checks the stop flag on 0.1.14 if it is.
- **The extension's release lot** needs 0.1.14 and MSI 0.1.36 installed.
- Please write in `docs/handoffs/CODER-EXTENSION.md` the answers to items 2, 3 and 4, and when the packages are installed.
