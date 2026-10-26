import { discoveryFieldUpdateSchema } from "@/domain/discovery";
import { parseBody, route } from "@/server/http/handler";
import { updateDiscoveryField } from "@/server/services/opportunities";

type Params = { id: string; field: string };

export const PUT = route<Params>(async (req, { params, user }) => {
  const { items } = await parseBody(req, discoveryFieldUpdateSchema);
  return updateDiscoveryField(params.id, params.field, items, user);
});
