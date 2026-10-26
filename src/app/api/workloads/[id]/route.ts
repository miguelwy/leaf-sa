import type { WorkloadInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { deleteWorkload, updateWorkload } from "@/server/services/workloads";

type Params = { id: string };

export const PATCH = route<Params>(async (req, { params, user }) =>
  updateWorkload(params.id, await readJson<Partial<WorkloadInput>>(req), user),
);

export const DELETE = route<Params>(async (_req, { params, user }) => {
  await deleteWorkload(params.id, user);
  return { ok: true };
});
