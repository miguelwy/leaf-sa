import type { OpportunityInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { deleteOpportunity, getOpportunity, updateOpportunity } from "@/server/services/opportunities";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => getOpportunity(params.id));

export const PATCH = route<Params>(async (req, { params, user }) =>
  updateOpportunity(params.id, await readJson<Partial<OpportunityInput>>(req), user),
);

export const DELETE = route<Params>(async (_req, { params, user }) => {
  await deleteOpportunity(params.id, user);
  return { ok: true };
});
