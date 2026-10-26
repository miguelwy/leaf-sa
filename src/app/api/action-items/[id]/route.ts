import type { ActionItemInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { deleteActionItem, updateActionItem } from "@/server/services/action-items";

type Params = { id: string };

export const PATCH = route<Params>(async (req, { params, user }) =>
  updateActionItem(params.id, await readJson<Partial<ActionItemInput>>(req), user),
);

export const DELETE = route<Params>(async (_req, { params, user }) => {
  await deleteActionItem(params.id, user);
  return { ok: true };
});
