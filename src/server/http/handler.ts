import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import type { SessionUser } from "@/domain/auth";
import { requireApiUser } from "@/server/auth/session";
import { AppError, ValidationError, type ApiErrorBody } from "./errors";

interface HandlerContext<P> {
  params: P;
  user: SessionUser;
}

interface PublicHandlerContext<P> {
  params: P;
}

type RouteContext<P> = { params: Promise<P> };

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Validation failed", details: z.flattenError(error) } },
      { status: 422 },
    );
  }
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  // MongoDB duplicate key
  if (typeof error === "object" && error !== null && (error as { code?: number }).code === 11000) {
    return NextResponse.json(
      { error: { code: "conflict", message: "A record with the same unique value already exists" } },
      { status: 409 },
    );
  }
  console.error("[api] unhandled error", error);
  return NextResponse.json({ error: { code: "internal_error", message: "Unexpected server error" } }, { status: 500 });
}

function toResponse(result: unknown, status = 200): Response {
  if (result instanceof Response) return result;
  return NextResponse.json({ data: result ?? null }, { status });
}

/** Authenticated route handler: resolves params, checks the session, maps errors. */
export function route<P = Record<string, never>>(
  fn: (req: NextRequest, ctx: HandlerContext<P>) => Promise<unknown>,
  options: { status?: number } = {},
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      const user = await requireApiUser();
      const params = await ctx.params;
      return toResponse(await fn(req, { params, user }), options.status);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Route handler that does not require a session (login, setup). */
export function publicRoute<P = Record<string, never>>(fn: (req: NextRequest, ctx: PublicHandlerContext<P>) => Promise<unknown>) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      return toResponse(await fn(req, { params: await ctx.params }));
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/**
 * Reads a JSON body without validating it; use when the service layer owns the
 * Zod schema (it throws ZodError, which `route` maps to a 422).
 */
export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

export async function parseBody<S extends ZodType>(req: NextRequest, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Validation failed", z.flattenError(parsed.error));
  return parsed.data;
}

export function parseQuery<S extends ZodType>(req: NextRequest, schema: S): z.output<S> {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Invalid query parameters", z.flattenError(parsed.error));
  return parsed.data;
}
