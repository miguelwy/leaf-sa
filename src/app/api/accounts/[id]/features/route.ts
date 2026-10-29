import type { FeatureInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { addFeature } from "@/server/services/accounts";

type Params = { id: string };

export const POST = route<Params>(async (req, { params, user }) => addFeature(params.id, await readJson<FeatureInput>(req), user), { status: 201 });
