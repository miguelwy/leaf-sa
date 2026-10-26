import type { AccountExecutiveInput } from "@/domain/entities";
import { readJson, route } from "@/server/http/handler";
import { createAccountExecutive, listAccountExecutives } from "@/server/services/account-executives";

export const GET = route(async () => listAccountExecutives());

export const POST = route(async (req) => createAccountExecutive(await readJson<AccountExecutiveInput>(req)), { status: 201 });
