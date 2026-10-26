import { format, formatDistanceToNowStrict } from "date-fns";

type DateLike = Date | string | null | undefined;

function toDate(value: DateLike): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Date-only values (due dates, milestones) are stored as UTC midnight; format them
 * in UTC so they show the same calendar day for every viewer.
 */
export function formatDateOnly(value: DateLike, pattern = "MMM d, yyyy"): string {
  const d = toDate(value);
  if (!d) return "—";
  return format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), pattern);
}

/** `<input type="date">` value for a date-only field. */
export function toDateInput(value: DateLike): string {
  const d = toDate(value);
  return d ? d.toISOString().slice(0, 10) : "";
}

/** `<input type="datetime-local">` value in the viewer's local time. */
export function toDateTimeInput(value: DateLike): string {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
}

export function formatDateTime(value: DateLike, pattern = "MMM d, yyyy · HH:mm"): string {
  const d = toDate(value);
  return d ? format(d, pattern) : "—";
}

export function formatRelative(value: DateLike): string {
  const d = toDate(value);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : "—";
}

/** Days from today (UTC calendar) to a date-only value; negative when overdue. */
export function daysUntil(value: DateLike, now = new Date()): number | null {
  const d = toDate(value);
  if (!d) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d.getTime() - today) / 86400000);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function hostname(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
