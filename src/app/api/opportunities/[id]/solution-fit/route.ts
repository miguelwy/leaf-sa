import type { SolutionFitInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { addSolutionFit } from "@/server/services/opportunities";

type Params = { id: string };

export const POST = route<Params>(
  async (req, { params, user }) => addSolutionFit(params.id, await readJson<SolutionFitInput>(req), user),
  { status: 201 },
);
