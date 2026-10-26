import type { OpportunityInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { createOpportunity, listOpportunities } from "@/server/services/opportunities";

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  return listOpportunities({ accountId: sp.get("accountId"), aeId: sp.get("aeId"), salesMotion: sp.get("salesMotion") });
});

export const POST = route(
  async (req, { user }) => createOpportunity(await readJson<OpportunityInput & { accountId: string }>(req), user),
  { status: 201 },
);
