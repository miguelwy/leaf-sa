import type { WorkloadInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { createWorkload, listWorkloads } from "@/server/services/workloads";

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  return listWorkloads({ accountId: sp.get("accountId") ?? undefined, opportunityId: sp.get("opportunityId") ?? undefined });
});

export const POST = route(
  async (req, { user }) => createWorkload(await readJson<WorkloadInput & { opportunityId: string }>(req), user),
  { status: 201 },
);
