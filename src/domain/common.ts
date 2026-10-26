import { z } from "zod";

/** Hex string form of a MongoDB ObjectId, as exposed by the API. */
export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN, "Invalid id");

export const requiredText = (max = 200) =>
  z.string().trim().min(1, "Required").max(max, `Must be at most ${max} characters`);

/**
 * Optional free text. Empty strings become `null` so "unknown" is stored explicitly
 * as null rather than as an empty string. Idempotent: null in, null out.
 */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

export const optionalEmail = optionalText(254)
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || z.email().safeParse(v).success, "Invalid email address");

/** Accepts "example.com" and normalises it to "https://example.com". */
export const optionalUrl = optionalText(500)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .refine((v) => {
    if (v === null) return true;
    try {
      const url = new URL(v);
      return url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Invalid URL");

export const optionalObjectId = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || OBJECT_ID_PATTERN.test(v), "Invalid id");

/**
 * Optional date. Accepts Date objects, ISO strings and `<input type="date|datetime-local">`
 * values. Date-only strings ("2026-10-30") are interpreted as UTC midnight.
 */
export const optionalDate = z
  .union([z.string(), z.date()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });

export const tagsSchema = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(20, "At most 20 tags")
  .transform((tags) => Array.from(new Set(tags)));

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}
