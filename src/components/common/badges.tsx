import * as React from "react";
import { ACTION_ITEM_STATUS_LABELS, type ActionItemStatus, type SolutionFitStatus } from "@/domain/enumerations";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-brand-subtle text-brand border-brand/20",
  success: "bg-success-subtle text-success border-success/20",
  warning: "bg-warning-subtle text-warning border-warning/25",
  danger: "bg-danger-subtle text-destructive border-destructive/20",
  info: "bg-info-subtle text-info border-info/20",
};

export function Pill({ tone = "neutral", className, children, title }: { tone?: Tone; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<ActionItemStatus, Tone> = {
  todo: "neutral",
  in_progress: "info",
  blocked: "danger",
  done: "success",
};

export function ActionStatusPill({ status }: { status: ActionItemStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{ACTION_ITEM_STATUS_LABELS[status]}</Pill>;
}

/** Priority tones are positional so renamed/configured priorities still read sensibly. */
export function PriorityPill({ priority, priorities }: { priority: string | null; priorities: string[] }) {
  if (!priority) return null;
  const idx = priorities.indexOf(priority);
  const rank = idx < 0 ? 0 : idx / Math.max(1, priorities.length - 1);
  const tone: Tone = rank >= 0.99 ? "danger" : rank >= 0.6 ? "warning" : "neutral";
  return <Pill tone={tone}>{priority}</Pill>;
}

const FIT_TONE: Record<SolutionFitStatus, Tone> = {
  Identified: "neutral",
  Proposed: "info",
  Validated: "success",
  Rejected: "danger",
};

export function SolutionFitStatusPill({ status }: { status: SolutionFitStatus }) {
  return <Pill tone={FIT_TONE[status]}>{status}</Pill>;
}

/** Sales motion / Tiger route / stage chips shown in account and opportunity headers. */
export function ClassificationPills({
  salesMotion,
  tigerRoute,
  stage,
  className,
}: {
  salesMotion?: string | null;
  tigerRoute?: string | null;
  stage?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {salesMotion ? <Pill tone="brand" title="Sales motion">{salesMotion}</Pill> : <Pill title="Sales motion">No motion</Pill>}
      {tigerRoute && <Pill tone="info" title="Tiger route">{tigerRoute}</Pill>}
      {stage && <Pill title="Stage">{stage}</Pill>}
    </span>
  );
}
