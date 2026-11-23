/**
 * No-leak guard of the provider path: a unique secret in a message, a tool argument, a tool result,
 * an image payload, a tool description, a role name and the key must never reach a log line, a thrown
 * error, a message shown to the user, or a file, whatever way the call fails.
 */
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { formatCallLine } from "../src/log";
import { ChatProvider, type ChatCall } from "../src/provider";
import { closeAgents } from "../src/transport";
import { FakeHost } from "./support/fake-host";
import { message, opening, text, toolCall, toolResult } from "./support/editor";
import { dataEvent, delta, routes, sseHeaders, startScripted } from "./support/fake-server";
import { startStub, type StubOptions } from "./stub-gateway/stub";

after(() => closeAgents());

function unique(label: string): string {
  return `SECRET-${label}-${Math.random().toString(16).slice(2, 12)}${Date.now().toString(16)}`;
}

describe("no-leak guard, provider path", () => {
  it("keeps secrets out of logs, errors, messages and files, on every way of failing", async () => {
    const secrets = {
      key: unique("KEY"),
      message: unique("MESSAGE"),
      toolArgument: unique("TOOLARG"),
      toolResult: unique("TOOLRESULT"),
      image: unique("IMAGE"),
      description: unique("DESCRIPTION"),
      role: unique("ROLE"),
      serverArguments: unique("SERVERARGS"),
      envelopeText: "stub secret message",
    };
    const forms = [
      ...Object.values(secrets),
      Buffer.from(secrets.image).toString("base64"),
      Buffer.from(secrets.message).toString("base64"),
    ];
    const seen: string[] = [];
    const tools = [
      {
        name: "read_file",
        description: secrets.description,
        inputSchema: { type: "object", description: secrets.description },
      },
    ];
    const history = (typed: string): ChatCall["messages"] => [
      ...opening(`${typed} ${secrets.message}`),
      message("Assistant", toolCall("c1", "read_file", { path: secrets.toolArgument })),
      message("User", toolResult("c1", [text(secrets.toolResult)]), {
        mimeType: "image/png",
        data: Buffer.from(secrets.image),
      }),
    ];
    const call = (typed: string, vision = true, id = "cabinet-code"): ChatCall => ({
      model: { id, imageInput: vision },
      messages: history(typed),
      tools,
      toolMode: "auto",
    });

    async function attempt(host: FakeHost, chat: ChatCall, signal?: AbortSignal): Promise<void> {
      const provider = new ChatProvider(host);
      try {
        // What the model answers is shown to the user on purpose: only logs, errors and messages are checked.
        await provider.chat(chat, () => undefined, signal ?? new AbortController().signal);
      } catch (error) {
        assert.ok(error instanceof Error);
        seen.push(error.message, String(error), error.stack ?? "", JSON.stringify(error));
      }
      await provider.information(false);
      for (const shown of host.shown) {
        seen.push(shown.text);
      }
      for (const record of host.logs) {
        seen.push(formatCallLine(record, new Date("2026-10-27T10:00:00.000Z")));
      }
    }

    const folder = await mkdtemp(path.join(os.tmpdir(), "acc-provider-leak-"));
    const here = process.cwd();
    process.chdir(folder);
    try {
      const modes: [StubOptions, string][] = [
        [{}, "error"],
        [{}, "error-http"],
        [{}, "empty"],
        [{}, "cut"],
        [{}, "text"],
        [{}, "tool-call"],
        [{ mode: "key-needed" }, "text"],
        [{ mode: "off" }, "text"],
        [{ mode: "version-mismatch" }, "text"],
        [{ mode: "redirect" }, "text"],
        [{ slowFirstByteMs: 800 }, "slow"],
      ];
      for (const [options, scenario] of modes) {
        const stub = await startStub(options);
        try {
          const timeoutSeconds = scenario === "slow" ? 0.2 : 5;
          await attempt(
            new FakeHost(stub.url, { apiKey: secrets.key, timeoutSeconds }),
            call(`[stub:${scenario}]`),
          );
        } finally {
          await stub.close();
        }
      }

      // Refusals before sending: an image for a model without vision, an unknown role.
      const quiet = await startStub();
      try {
        const host = new FakeHost(quiet.url, { apiKey: secrets.key });
        await attempt(host, call("[stub:text]", false, "cabinet-plain"));
        await attempt(host, {
          model: { id: "cabinet-code", imageInput: true },
          messages: [message(secrets.role, text(secrets.message))],
          toolMode: "auto",
        });
        await attempt(host, {
          model: { id: "cabinet-code", imageInput: true },
          messages: [message("User", { mimeType: secrets.role, data: Buffer.from(secrets.image) })],
          toolMode: "auto",
        });
        // The server's own refusal of the image, and a call cancelled before it starts.
        await attempt(host, call("[stub:text]", true, "cabinet-plain"));
        const gone = new AbortController();
        gone.abort();
        await attempt(host, call("[stub:text]"), gone.signal);
      } finally {
        await quiet.close();
      }

      // A model that sends arguments that are not JSON (and holds a secret), and a stream with no end.
      const server = await startScripted(
        routes({
          chat: (_req, res, body) => {
            sseHeaders(res);
            if (body.includes("[stub:no-end]")) {
              res.end(dataEvent(delta({ content: secrets.serverArguments })));
              return;
            }
            res.end(
              dataEvent(
                delta({
                  tool_calls: [
                    {
                      index: 0,
                      id: "c",
                      function: {
                        name: "read_file",
                        arguments: `{"a": "${secrets.serverArguments}`,
                      },
                    },
                  ],
                }),
              ) +
                dataEvent(delta({}, "tool_calls")) +
                "data: [DONE]\n\n",
            );
          },
        }),
      );
      try {
        const host = new FakeHost(server.url, { apiKey: secrets.key });
        await attempt(host, call("[stub:text]"));
        await attempt(host, call("[stub:no-end]"));
        await attempt(host, {
          ...call("[stub:text]"),
          tools: [{ name: "not a valid name" }],
        });
      } finally {
        await server.close();
      }

      assert.deepEqual(await readdir(folder), [], "the provider wrote no file");
    } finally {
      process.chdir(here);
      closeAgents();
      await rm(folder, { recursive: true, force: true });
    }

    const everything = seen.join("\n");
    assert.ok(everything.length > 0);
    assert.ok(everything.includes("call=chat"), "chat calls were logged");
    for (const form of forms) {
      assert.equal(everything.includes(form), false, `a secret leaked: ${form.slice(0, 20)}`);
    }
  });
});
