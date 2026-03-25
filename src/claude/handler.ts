/**
 * Claude Code SDK integration.
 * Processes WeChat messages through Claude Code and returns text responses.
 */
import { query } from "@anthropic-ai/claude-code";
import type { BotConfig, PermissionMode } from "../store.js";
import type { Options } from "@anthropic-ai/claude-code";

export type ClaudeResponse = {
  text: string;
  durationMs: number;
  costUsd?: number;
};

export type ClaudeOptions = Pick<Required<BotConfig>, "model" | "maxTurns" | "systemPrompt" | "cwd" | "permissionMode">;

/**
 * Send a prompt to Claude Code and collect the text response.
 * Claude Code runs in a subprocess with access to the local filesystem.
 */
export async function askClaude(prompt: string, opts: ClaudeOptions): Promise<ClaudeResponse> {
  const start = Date.now();
  const texts: string[] = [];
  let costUsd: number | undefined;

  const conversation = query({
    prompt,
    options: {
      model: opts.model,
      maxTurns: opts.maxTurns,
      cwd: opts.cwd,
      // Cast needed: SDK types haven't added "auto" and "dontAsk" yet,
      // but the runtime supports them.
      permissionMode: opts.permissionMode as Options["permissionMode"],
      ...(opts.systemPrompt ? { appendSystemPrompt: opts.systemPrompt } : {}),
    },
  });

  for await (const message of conversation) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          texts.push(block.text);
        }
      }
    } else if (message.type === "result") {
      if (message.subtype === "success" && message.result) {
        texts.length = 0;
        texts.push(message.result);
      }
      costUsd = message.total_cost_usd;
    }
  }

  const text = texts.join("\n").trim() || "(Claude 没有返回文本内容)";

  return {
    text,
    durationMs: Date.now() - start,
    costUsd,
  };
}
