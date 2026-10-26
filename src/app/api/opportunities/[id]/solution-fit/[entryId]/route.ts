import type { SolutionFitInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { removeSolutionFit, updateSolutionFit } from "@/server/services/opportunities";

type Params = { id: string; entryId: string };

export const PATCH = route<Params>(async (req, { params, user }) =>
  updateSolutionFit(params.id, params.entryId, await readJson<Partial<SolutionFitInput>>(req), user),
);

export const DELETE = route<Params>(async (_req, { params, user }) => removeSolutionFit(params.id, params.entryId, user));
