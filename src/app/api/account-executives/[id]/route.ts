import type { AccountExecutiveInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import {
  deleteAccountExecutive,
  getAccountExecutive,
  updateAccountExecutive,
} from "@/server/services/account-executives";

type Params = { id: string };

export const GET = route<Params>(async (_req, { params }) => getAccountExecutive(params.id));

export const PATCH = route<Params>(async (req, { params }) =>
  updateAccountExecutive(params.id, await readJson<Partial<AccountExecutiveInput>>(req)),
);

export const DELETE = route<Params>(async (_req, { params, user }) => {
  await deleteAccountExecutive(params.id, user);
  return { ok: true };
});
