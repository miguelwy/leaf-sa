import type { LoginInput } from "@/domain/auth";
import { clearFailures, isRateLimited, recordFailure } from "@/server/auth/rate-limit";
import { startSession } from "@/server/auth/session";
import { RateLimitError, UnauthorizedError } from "@/server/http/errors";
import { publicRoute, readJson } from "@/server/http/handler";
import { authenticate } from "@/server/services/users";

export const POST = publicRoute(async (req) => {
  const body = await readJson<LoginInput>(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${ip}:${String(body?.email ?? "").toLowerCase()}`;
  if (isRateLimited(key)) throw new RateLimitError();
  try {
    const user = await authenticate(body);
    clearFailures(key);
    await startSession(user);
    return { user };
  } catch (error) {
    if (error instanceof UnauthorizedError) recordFailure(key);
    throw error;
  }
});
