import type { AccountInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { deleteAccount, getAccount, updateAccount } from "@/server/services/accounts";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => getAccount(params.id));

export const PATCH = route<Params>(async (req, { params, user }) =>
  updateAccount(params.id, await readJson<Partial<AccountInput>>(req), user),
);

/** Permanent deletion of the account and all associated records. */
export const DELETE = route<Params>(async (_req, { params }) => {
  await deleteAccount(params.id);
  return { ok: true };
});
