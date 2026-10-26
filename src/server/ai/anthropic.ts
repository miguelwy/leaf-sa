import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { AiOutputError, type AiProvider, type StructuredRequest, type StructuredResult } from "./provider";

let client: Anthropic | null = null;
function getClient() {
  // Reads ANTHROPIC_API_KEY from the server environment; never exposed to the browser.
  client ??= new Anthropic({ maxRetries: 3, timeout: 10 * 60 * 1000 });
  return client;
}

export const anthropicProvider: AiProvider = {
  name: "anthropic",
  async generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
    const response = await getClient().beta.messages.parse({
      model: req.model,
      max_tokens: req.maxOutputTokens,
      // Extraction quality matters more than latency here.
      output_config: { effort: "high", format: betaZodOutputFormat(req.schema) },
      // On a safety-classifier decline, the API re-runs the request on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.prompt }],
    });

    if (response.stop_reason === "refusal") {
      throw new AiOutputError("The model declined to analyze this transcript.", false);
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiOutputError("The analysis was cut off before completion.", true);
    }
    if (!response.parsed_output) {
      throw new AiOutputError("The model returned output that does not match the extraction schema.", true);
    }
    return {
      output: response.parsed_output as z.infer<S>,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0),
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  },
};
