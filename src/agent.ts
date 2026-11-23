/**
 * The chat panel's agent loop (Lot P0b, decision D-026). Pure: the sender, the tools and what the
 * conversation records are passed in, so the loop is tested without the network or the editor.
 *
 * One step is one request to the model, sent once (never a retry). When the answer holds tool
 * calls, each call is run in order and its result appended, then the conversation is sent again.
 * The loop ends at a final answer (no tool call), at a failure, at Stop (the signal), or after
 * `MAX_STEPS` steps. A call the model makes with malformed arguments is not an error of the loop:
 * the tool turns it into a result the model reads (`tools.runToolCall`).
 *
 * It imports types only, so `messages.ts` can name its step limit without a cycle.
 */
import type { ChatResult } from "./chat";
import type { RawToolCall } from "./conversation";
import type { ToolOutcome } from "./tools";

/** The most steps (requests to the model) for one message of the user. */
export const MAX_STEPS = 12;

export interface AgentDriver {
  /** Sends the conversation as it is now (step 1, 2, ...) and streams the answer. */
  send(step: number): Promise<ChatResult>;
  /** The step ended with these calls: the conversation records them before they run. */
  recordCalls(calls: readonly RawToolCall[]): void;
  /** Runs one call (an edit waits here for the user's decision). */
  runCall(call: RawToolCall): Promise<ToolOutcome>;
  /** The call's outcome: the conversation records it, the panel shows it. */
  recordOutcome(call: RawToolCall, outcome: ToolOutcome): void;
}

export interface AgentEnd {
  outcome: "complete" | "stopped" | "failed";
  /** The last request's result (its code, phase, usage, durations). */
  last: ChatResult;
  /** How many requests were sent. */
  steps: number;
  /** The loop stopped at `MAX_STEPS` with the model still calling tools. */
  stepLimit: boolean;
  /** Whether a tool had run when it ended (a stop then happened after the first word). */
  toolsRan: boolean;
}

/** Runs the loop until a final answer, a failure, Stop or the step limit. Never throws. */
export async function runAgent(
  driver: AgentDriver,
  signal: AbortSignal,
  maxSteps: number = MAX_STEPS,
): Promise<AgentEnd> {
  let toolsRan = false;
  let last: ChatResult | undefined;
  for (let step = 1; step <= maxSteps; step += 1) {
    last = await driver.send(step);
    const calls = last.toolCalls ?? [];
    if (last.outcome !== "complete" || calls.length === 0) {
      return { outcome: last.outcome, last, steps: step, stepLimit: false, toolsRan };
    }
    driver.recordCalls(calls);
    for (const call of calls) {
      if (signal.aborted) {
        break;
      }
      const outcome = await driver.runCall(call);
      toolsRan = true;
      driver.recordOutcome(call, outcome);
    }
    if (signal.aborted) {
      return { outcome: "stopped", last, steps: step, stepLimit: false, toolsRan };
    }
  }
  return {
    outcome: "complete",
    last: last as ChatResult,
    steps: maxSteps,
    stepLimit: true,
    toolsRan,
  };
}
