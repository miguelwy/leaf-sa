import type { Usage } from "./provider";

/**
 * USD per 1M tokens (Anthropic first-party list prices). Unknown models report no
 * cost rather than a guess; set AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK to
 * track cost for other models.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
};

export function estimateCostUsd(model: string, usage: Usage): number | null {
  const known = PRICES[model];
  const envIn = Number(process.env.AI_PRICE_INPUT_PER_MTOK);
  const envOut = Number(process.env.AI_PRICE_OUTPUT_PER_MTOK);
  const price = known ?? (envIn > 0 && envOut > 0 ? { input: envIn, output: envOut, cacheRead: envIn / 10 } : null);
  if (!price) return null;
  const cost =
    (usage.inputTokens * price.input + usage.outputTokens * price.output + usage.cacheReadTokens * price.cacheRead) / 1_000_000;
  return Math.round(cost * 10000) / 10000;
}
