"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime, formatRelative } from "@/lib/format";

const subscribe = () => () => {};

/** True after hydration; avoids server/browser timezone mismatches during SSR. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/** Date-time in the viewer's timezone (server render shows a neutral placeholder). */
export function LocalDateTime({ value, pattern, relative }: { value: Date | string | null; pattern?: string; relative?: boolean }) {
  const hydrated = useHydrated();
  if (!value) return <span className="text-muted-foreground">—</span>;
  const iso = typeof value === "string" ? value : value.toISOString();
  return (
    <time dateTime={iso} title={hydrated ? formatDateTime(value) : undefined}>
      {hydrated ? (relative ? formatRelative(value) : formatDateTime(value, pattern)) : "…"}
    </time>
  );
}
