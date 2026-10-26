import { readJson, route } from "@/server/http/handler";
import { bulkDecide } from "@/server/services/meeting-review";

type Params = { id: string };

export const POST = route<Params>(async (req, { params, user }) =>
  bulkDecide(params.id, await readJson<{ action: "approve" | "reject"; suggestionIds: string[] }>(req), user),
);
