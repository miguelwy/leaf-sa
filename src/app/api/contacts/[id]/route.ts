import type { ContactInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { deleteContact, updateContact } from "@/server/services/contacts";

type Params = { id: string };

export const PATCH = route<Params>(async (req, { params, user }) =>
  updateContact(params.id, await readJson<Partial<ContactInput>>(req), user),
);

export const DELETE = route<Params>(async (_req, { params, user }) => {
  await deleteContact(params.id, user);
  return { ok: true };
});
