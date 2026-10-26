import "server-only";
import type { SessionUser } from "@/domain/auth";
import { aiSettingsSchema, type AiProviderName, type AiSettings, type AiSettingsInput, type AiStatus } from "@/domain/meetings";
import { collections } from "@/server/db/collections";
import { toObjectId } from "@/server/db/ids";

/** Default model per provider. OpenAI has no default: the model must be chosen explicitly. */
export const DEFAULT_MODELS: Record<AiProviderName, string | null> = {
  anthropic: "claude-opus-5-5",
  openai: null,
};

const KEY_ENV: Record<AiProviderName, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" };
const MODEL_ENV: Record<AiProviderName, string> = { anthropic: "AI_ANTHROPIC_MODEL", openai: "AI_OPENAI_MODEL" };

export function providerKeyConfigured(provider: AiProviderName): boolean {
  return !!process.env[KEY_ENV[provider]]?.trim();
}

/** Deployment-level kill switch: AI_PROCESSING_ENABLED=false disables AI regardless of Settings. */
export function aiAllowedByDeployment(): boolean {
  return (process.env.AI_PROCESSING_ENABLED ?? "true").toLowerCase() !== "false";
}

export async function getAiSettings(): Promise<AiSettings> {
  const { settings } = await collections();
  const doc = await settings.findOne({ _id: "ai" });
  if (!doc || !("enabled" in doc)) {
    return { enabled: false, provider: "anthropic", model: null, redactContactDetails: true, approvedAt: null, approvedBy: null };
  }
  return {
    enabled: doc.enabled,
    provider: doc.provider,
    model: doc.model,
    redactContactDetails: doc.redactContactDetails,
    approvedAt: doc.approvedAt,
    approvedBy: doc.approvedBy?.toHexString() ?? null,
  };
}

export async function getAiStatus(): Promise<AiStatus> {
  const s = await getAiSettings();
  const keyConfigured = providerKeyConfigured(s.provider);
  const effectiveModel = s.model ?? process.env[MODEL_ENV[s.provider]]?.trim() ?? DEFAULT_MODELS[s.provider];
  let reason: string | null = null;
  if (!aiAllowedByDeployment()) reason = "AI processing is disabled for this deployment (AI_PROCESSING_ENABLED=false).";
  else if (!s.enabled) reason = "AI processing has not been approved in Settings.";
  else if (!keyConfigured) reason = `${KEY_ENV[s.provider]} is not set on the server.`;
  else if (!effectiveModel) reason = "No model is configured for the selected provider.";
  return { ...s, keyConfigured, effectiveModel: effectiveModel || null, ready: reason === null, reason };
}

/** Saving with `enabled: true` records who approved sending data to the provider, and when. */
export async function updateAiSettings(raw: AiSettingsInput, actor: SessionUser): Promise<AiStatus> {
  const input = aiSettingsSchema.parse(raw);
  const current = await getAiSettings();
  const newlyApproved = input.enabled && (!current.enabled || current.provider !== input.provider);
  const { settings } = await collections();
  await settings.updateOne(
    { _id: "ai" },
    {
      $set: {
        enabled: input.enabled,
        provider: input.provider,
        model: input.model,
        redactContactDetails: input.redactContactDetails,
        approvedAt: input.enabled ? (newlyApproved ? new Date() : current.approvedAt) : null,
        approvedBy: input.enabled
          ? newlyApproved
            ? toObjectId(actor.id, "User")
            : current.approvedBy
              ? toObjectId(current.approvedBy, "User")
              : null
          : null,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
  return getAiStatus();
}
