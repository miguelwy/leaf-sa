import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/token";

const PUBLIC_PAGES = ["/login", "/setup"];
const PUBLIC_API = ["/api/auth/login", "/api/auth/setup", "/api/auth/logout", "/api/health"];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Request interceptor: requires a valid session for every page and API route except
 * login/setup, and rejects cross-origin mutations (CSRF defence on top of SameSite=Lax).
 * Route handlers re-check the session, so this is defence in depth, not the only gate.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && originHost(origin) !== host) {
      return NextResponse.json({ error: { code: "forbidden", message: "Cross-origin request blocked" } }, { status: 403 });
    }
  }

  if (PUBLIC_PAGES.includes(pathname) || PUBLIC_API.includes(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token && secret ? await verifySessionToken(token, secret) : null;
  if (user) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Authentication required" } }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
