import { actionItemFilterSchema, type ActionItemInput } from "@/domain/entities";
import { parseQuery, readJson, route } from "@/server/http/handler";
import { createActionItem, listActionItems } from "@/server/services/action-items";

export const GET = route(async (req) => listActionItems(parseQuery(req, actionItemFilterSchema)));

export const POST = route(async (req, { user }) => createActionItem(await readJson<ActionItemInput>(req), user), { status: 201 });
