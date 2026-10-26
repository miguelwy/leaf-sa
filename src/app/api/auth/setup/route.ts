import type { SetupInput } from "@/domain/auth";
import { startSession } from "@/server/auth/session";
import { publicRoute, readJson } from "@/server/http/handler";
import { setupOwner } from "@/server/services/users";

export const POST = publicRoute(async (req) => {
  const user = await setupOwner(await readJson<SetupInput>(req));
  await startSession(user);
  return { user };
});
