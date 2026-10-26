import type { AiSettingsInput } from "@/domain/meetings";
import { getAiStatus, updateAiSettings } from "@/server/ai/settings";
import { readJson, route } from "@/server/http/handler";

export const GET = route(async () => getAiStatus());

export const PUT = route(async (req, { user }) => updateAiSettings(await readJson<AiSettingsInput>(req), user));
