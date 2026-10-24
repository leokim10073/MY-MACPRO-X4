// Anthropic client and the one helper every AI function uses to get a tool call back.

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaTool,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

export const FAST_MODEL = process.env.AI_FAST_MODEL ?? "claude-haiku-5-5";
export const SLOW_MODEL = process.env.AI_SLOW_MODEL ?? "claude-sonnet-5-5";

let defaultClient: Anthropic | undefined;

/** Reads ANTHROPIC_API_KEY from the environment. Created on first use so importing this file never needs a key. */
export function getClient(): Anthropic {
  defaultClient ??= new Anthropic();
  return defaultClient;
}

export class AiRefusalError extends Error {}

export interface ToolCallOptions {
  client?: Anthropic;
  model: string;
  system: string;
  user: string;
  tool: BetaTool;
  maxTokens: number;
  /** Fast path: force the tool and skip thinking (Haiku accepts both). Slow path models reject forced tool_choice. */
  fast?: boolean;
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
  /**
   * Called with each tool input. Return problems to send back to the model for one repair round,
   * or an empty array to accept. The last input is returned either way; the caller repairs the rest.
   */
  check?: (input: unknown) => string[];
}

export interface ToolCallResult {
  input: unknown;
  /** Problems still present in the returned input (empty if the model fixed them or none were found). */
  problems: string[];
  latencyMs: number;
}

/**
 * Calls the model with a single strict tool and returns that tool's input.
 * Retries once if the model answers without calling the tool, and does one repair round if `check` finds problems.
 */
export async function callTool(opts: ToolCallOptions): Promise<ToolCallResult> {
  const client = opts.client ?? getClient();
  const tool: BetaTool = { ...opts.tool, strict: true };
  const messages: BetaMessageParam[] = [{ role: "user", content: opts.user }];
  const started = Date.now();
  let lastInput: unknown;
  let problems: string[] = [];

  // At most: first answer, one nudge if no tool call, one repair round.
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await client.beta.messages.create(
      {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages,
        tools: [tool],
        ...(opts.fast
          ? { tool_choice: { type: "tool", name: tool.name }, thinking: { type: "disabled" } }
          : {
              tool_choice: { type: "auto" },
              output_config: { effort: opts.effort ?? "medium" },
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
            }),
      },
      { timeout: opts.timeoutMs ?? 60_000 },
    );

    if (response.stop_reason === "refusal") {
      throw new AiRefusalError(`Model declined (${response.stop_details?.category ?? "unknown"})`);
    }
    const call = response.content.find(
      (b): b is Extract<BetaContentBlock, { type: "tool_use" }> => b.type === "tool_use" && b.name === tool.name,
    );
    messages.push({ role: "assistant", content: response.content });

    if (!call) {
      if (response.stop_reason === "max_tokens") throw new Error(`${tool.name}: hit max_tokens before calling the tool`);
      if (lastInput !== undefined) break;
      messages.push({ role: "user", content: `Call the ${tool.name} tool with your answer. Do not reply in text.` });
      continue;
    }

    lastInput = call.input;
    problems = opts.check?.(call.input) ?? [];
    // Fast path has no time for a repair round.
    if (problems.length === 0 || attempt === 2 || opts.fast) break;
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: call.id,
          is_error: true,
          content: `Fix these problems and call ${tool.name} again with the full corrected answer:\n- ${problems.join("\n- ")}`,
        },
      ],
    });
  }

  if (lastInput === undefined) throw new Error(`${tool.name}: model never called the tool`);
  return { input: lastInput, problems, latencyMs: Date.now() - started };
}
