import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { AiOutputError, type AiProvider, type StructuredRequest, type StructuredResult } from "./provider";

let client: OpenAI | null = null;
function getClient() {
  // Reads OPENAI_API_KEY from the server environment; never exposed to the browser.
  client ??= new OpenAI({ maxRetries: 3, timeout: 10 * 60 * 1000 });
  return client;
}

export const openAiProvider: AiProvider = {
  name: "openai",
  async generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
    const response = await getClient().responses.parse({
      model: req.model,
      instructions: req.system,
      input: req.prompt,
      max_output_tokens: req.maxOutputTokens,
      text: { format: zodTextFormat(req.schema, req.schemaName) },
      // Do not let the provider retain the conversation for later retrieval.
      store: false,
    });

    if (response.status === "incomplete") {
      throw new AiOutputError(`The analysis was incomplete (${response.incomplete_details?.reason ?? "unknown reason"}).`, true);
    }
    if (!response.output_parsed) {
      throw new AiOutputError("The model returned output that does not match the extraction schema.", true);
    }
    return {
      output: response.output_parsed as z.infer<S>,
      model: response.model,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cacheReadTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
      },
    };
  },
};
