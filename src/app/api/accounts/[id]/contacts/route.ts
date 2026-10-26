import type { ContactInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { createContact, listContacts } from "@/server/services/contacts";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => listContacts(params.id));

export const POST = route<Params>(
  async (req, { params, user }) => createContact(params.id, await readJson<ContactInput>(req), user),
  { status: 201 },
);
