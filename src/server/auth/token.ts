import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "@/domain/auth";

/**
 * Session token helpers. Kept free of `server-only`/`next/headers` imports so the
 * proxy (request interceptor) can verify tokens too.
 */
export const SESSION_COOKIE = "saw_session";

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(user: SessionUser, secret: string, ttlHours: number): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .setIssuer("sa-workspace")
    .sign(key(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: "sa-workspace", algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.name !== "string") {
      return null;
    }
    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}
