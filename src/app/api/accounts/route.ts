import type { AccountInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { createAccount, listAccounts } from "@/server/services/accounts";

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  return listAccounts({ aeId: sp.get("aeId"), status: sp.get("status"), salesMotion: sp.get("salesMotion"), q: sp.get("q") });
});

export const POST = route(async (req, { user }) => createAccount(await readJson<AccountInput>(req), user), { status: 201 });
