import type { LucideIcon } from "lucide-react";
import { Pill } from "./badges";

/**
 * Honest placeholder for modules scheduled in later phases. It explains what is
 * coming; it never shows mock data presented as real.
 */
export function PlannedFeature({
  icon: Icon,
  title,
  phase,
  summary,
  bullets,
}: {
  icon: LucideIcon;
  title: string;
  phase: string;
  summary: string;
  bullets: string[];
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-dashed bg-card p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{title}</h2>
            <Pill>Planned · {phase}</Pill>
          </div>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>
      </div>
      <ul className="mt-6 space-y-2 text-sm">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const MEETING_INTELLIGENCE_BULLETS = [
  "Meetings per account and opportunity, with participants and meeting type (types are already configurable in Settings).",
  "Transcript ingestion: paste, TXT, Markdown, DOCX and text-based PDF, preserving the original with speaker labels and timestamps.",
  "Schema-validated AI extraction with confidence, supporting excerpt and source meeting for every fact.",
  "AI Review: transcript on the left, suggestions on the right; approve, edit or reject with conflicts flagged.",
  "Approved facts land in Discovery with their meeting as source, and every change is recorded in History.",
  "“What changed since last meeting?” across requirements, decisions, questions and commitments.",
];

