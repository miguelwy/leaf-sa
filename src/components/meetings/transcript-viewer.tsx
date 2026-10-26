"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Highlight {
  id: string;
  start: number;
  end: number;
  tone: "pending" | "approved" | "rejected";
}

interface Slice {
  text: string;
  ids: string[];
}

/** Splits text at every highlight boundary so overlapping evidence renders correctly. */
function slice(raw: string, highlights: Highlight[]): Slice[] {
  const valid = highlights.filter((h) => h.start >= 0 && h.end > h.start && h.end <= raw.length);
  const points = new Set<number>([0, raw.length]);
  for (const h of valid) {
    points.add(h.start);
    points.add(h.end);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const out: Slice[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    const ids = valid.filter((h) => h.start <= a && h.end >= b).map((h) => h.id);
    const prev = out.at(-1);
    if (prev && prev.ids.length === 0 && ids.length === 0) prev.text += raw.slice(a, b);
    else out.push({ text: raw.slice(a, b), ids });
  }
  return out;
}

const SPEAKER_PREFIX = /^(\s*(?:[\[(][\d:.,]+[\])]\s*)?[A-ZÀ-ɏ][^:\n]{0,40}:)/gm;

/** Emphasises "[00:01] Name:" prefixes inside a plain text run. */
function withSpeakers(text: string, keyBase: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(SPEAKER_PREFIX)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(
      <span key={`${keyBase}-${idx}`} className="font-semibold text-foreground">
        {m[0]}
      </span>,
    );
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function TranscriptViewer({
  raw,
  highlights,
  activeId,
  onSelect,
  className,
}: {
  raw: string;
  highlights: Highlight[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const container = React.useRef<HTMLDivElement>(null);
  const slices = React.useMemo(() => slice(raw, highlights), [raw, highlights]);
  const toneById = React.useMemo(() => new Map(highlights.map((h) => [h.id, h.tone])), [highlights]);

  React.useEffect(() => {
    if (!activeId) return;
    const el = container.current?.querySelector<HTMLElement>(`[data-ev~="${CSS.escape(activeId)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeId]);

  return (
    <div ref={container} className={cn("overflow-y-auto px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/85", className)}>
      {slices.map((s, i) =>
        s.ids.length === 0 ? (
          <React.Fragment key={i}>{withSpeakers(s.text, String(i))}</React.Fragment>
        ) : (
          <mark
            key={i}
            data-ev={s.ids.join(" ")}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(s.ids[0])}
            onKeyDown={(e) => e.key === "Enter" && onSelect(s.ids[0])}
            className={cn(
              "cursor-pointer rounded-sm px-0.5 text-foreground transition-colors",
              s.ids.includes(activeId ?? "")
                ? "bg-brand/35 ring-1 ring-brand"
                : toneById.get(s.ids[0]) === "approved"
                  ? "bg-success/15 hover:bg-success/25"
                  : toneById.get(s.ids[0]) === "rejected"
                    ? "bg-muted hover:bg-muted/80"
                    : "bg-warning/20 hover:bg-warning/30",
            )}
          >
            {s.text}
          </mark>
        ),
      )}
    </div>
  );
}
