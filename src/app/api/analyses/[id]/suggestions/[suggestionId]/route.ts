import type { SuggestionDecision } from "@/domain/meetings";
import { readJson, route } from "@/server/http/handler";
import { decideSuggestion } from "@/server/services/meeting-review";

type Params = { id: string; suggestionId: string };

/** Approve (optionally edited), reject or reopen one suggestion. */
export const POST = route<Params>(async (req, { params, user }) =>
  decideSuggestion(params.id, params.suggestionId, await readJson<SuggestionDecision>(req), user),
);
