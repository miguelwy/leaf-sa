import "server-only";
import type { z } from "zod";
import type { AiProviderName } from "@/domain/meetings";

export interface StructuredRequest<S extends z.ZodType> {
  model: string;
  system: string;
  /** User-turn content; untrusted material (transcripts) must already be delimited. */
  prompt: string;
  schema: S;
  schemaName: string;
  maxOutputTokens: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface StructuredResult<T> {
  output: T;
  usage: Usage;
  model: string;
}

/** Thrown when the provider answered but the output is unusable (refusal, truncation, invalid JSON). */
export class AiOutputError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiOutputError";
  }
}

export interface AiProvider {
  name: AiProviderName;
  generateStructured<S extends z.ZodType>(request: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>>;
}

let override: AiProvider | null = null;

/** Tests inject a deterministic provider; never used by the application itself. */
export function setProviderForTests(provider: AiProvider | null) {
  override = provider;
}

export async function getProvider(name: AiProviderName): Promise<AiProvider> {
  if (override) return override;
  if (name === "anthropic") return (await import("./anthropic")).anthropicProvider;
  return (await import("./openai")).openAiProvider;
}
