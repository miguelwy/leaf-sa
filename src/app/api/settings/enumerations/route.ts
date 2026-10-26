import { enumerationUpdateSchema } from "@/domain/enumerations";
import { parseBody, route } from "@/server/http/handler";
import { getEnumerations, updateEnumeration } from "@/server/services/settings";

export const GET = route(async () => getEnumerations());

export const PUT = route(async (req) => updateEnumeration(await parseBody(req, enumerationUpdateSchema)));
