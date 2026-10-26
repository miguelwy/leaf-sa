/**
 * Typed client for the app's Route Handlers. Responses are `{ data }` on success
 * and `{ error: { code, message, details } }` on failure.
 */
export interface FieldErrors {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: FieldErrors,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** First message for a field, if the server reported one. */
  fieldError(field: string): string | undefined {
    return this.details?.fieldErrors?.[field]?.[0];
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function api<T = unknown>(method: Method, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    res = await fetch(url, {
      method,
      // FormData sets its own multipart boundary header.
      headers: body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0, "network_error");
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
      // Session expired: hard navigation drops client caches. Runs outside React, so no router.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    const err = payload?.error;
    throw new ApiError(err?.message ?? `Request failed (${res.status})`, res.status, err?.code ?? "unknown", err?.details);
  }
  return payload?.data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const firstField = error.details?.fieldErrors && Object.values(error.details.fieldErrors).find((v) => v?.length)?.[0];
    return firstField ? `${error.message}: ${firstField}` : error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}
