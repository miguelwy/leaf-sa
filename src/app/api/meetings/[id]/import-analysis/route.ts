import type { ImportAnalysisInput } from "@/domain/meetings";
import { readJson, route } from "@/server/http/handler";
import { importMeetingAnalysis } from "@/server/services/external-analysis";

type Params = { id: string };

/** Imports a JSON analysis produced by an external assistant; no AI provider is called. */
export const POST = route<Params>(
  async (req, { params, user }) => importMeetingAnalysis(params.id, await readJson<ImportAnalysisInput>(req), user),
  { status: 201 },
);
