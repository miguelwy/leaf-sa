import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/domain/auth";
import { authSecret, env } from "@/server/env";
import { UnauthorizedError } from "@/server/http/errors";
import { SESSION_COOKIE, signSessionToken, verifySessionToken } from "./token";

export async function startSession(user: SessionUser): Promise<void> {
  const { SESSION_TTL_HOURS, NODE_ENV } = env();
  const token = await signSessionToken(user, authSecret(), SESSION_TTL_HOURS);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token, authSecret());
}

/** For Server Components: redirects to the login page when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** For Route Handlers: throws a 401 when there is no session. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
