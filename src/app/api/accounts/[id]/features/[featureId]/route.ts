import type { FeatureInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { removeFeature, updateFeature } from "@/server/services/accounts";

type Params = { id: string; featureId: string };

export const PATCH = route<Params>(async (req, { params, user }) =>
  updateFeature(params.id, params.featureId, await readJson<Partial<FeatureInput>>(req), user),
);

export const DELETE = route<Params>(async (_req, { params, user }) => removeFeature(params.id, params.featureId, user));
