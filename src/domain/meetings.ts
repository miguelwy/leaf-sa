import { z } from "zod";
import { objectIdSchema, optionalDate, optionalObjectId, optionalText, requiredText, type Timestamps } from "./common";

// ---------------------------------------------------------------------------
// Meetings and transcripts
// ---------------------------------------------------------------------------

/** How a transcript entered the system. Audio transcription can be added as another source later. */
export const TRANSCRIPT_FORMATS = ["paste", "txt", "md", "docx", "pdf"] as const;
export type TranscriptFormat = (typeof TRANSCRIPT_FORMATS)[number];

export const MAX_TRANSCRIPT_CHARS = 400_000;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_UPLOAD_EXTENSIONS = [".txt", ".md", ".markdown", ".docx", ".pdf"] as const;

export interface TranscriptSegment {
  speaker: string | null;
  timestamp: string | null;
  text: string;
  /** Character offset of the segment's text within `raw`. */
  start: number;
}

export interface Transcript {
  raw: string;
  format: TranscriptFormat;
  fileName: string | null;
  segments: TranscriptSegment[];
  charCount: number;
  ingestedAt: Date;
}

export const ANALYSIS_STATUSES = ["not_analyzed", "analyzing", "analyzed", "failed"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

const participantsSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(50)
  .transform((p) => Array.from(new Set(p)));

const meetingFields = {
  accountId: objectIdSchema,
  opportunityId: optionalObjectId,
  title: requiredText(200),
  startsAt: optionalDate.refine((d) => d !== null, "Required"),
  type: optionalText(80),
  participants: participantsSchema,
};

export const meetingCreateSchema = z.object({
  ...meetingFields,
  participants: participantsSchema.default([]),
  transcriptText: z.string().max(MAX_TRANSCRIPT_CHARS, "Transcript is too long").optional(),
});
export type MeetingCreateInput = z.input<typeof meetingCreateSchema>;

export const meetingPatchSchema = z.object(meetingFields).omit({ accountId: true }).partial().extend({
  summary: optionalText(20000).optional(),
});
export type MeetingPatchInput = z.input<typeof meetingPatchSchema>;

export interface Meeting extends Timestamps {
  id: string;
  accountId: string;
  opportunityId: string | null;
  title: string;
  startsAt: Date;
  type: string | null;
  participants: string[];
  transcript: Transcript | null;
  summary: string | null;
  analysisStatus: AnalysisStatus;
  latestAnalysisId: string | null;
  analysisError: string | null;
}

export interface MeetingListItem extends Omit<Meeting, "transcript"> {
  accountName: string;
  opportunityName: string | null;
  hasTranscript: boolean;
  pendingSuggestions: number;
}

// ---------------------------------------------------------------------------
// AI extraction output (schema-validated structured output)
// ---------------------------------------------------------------------------

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** Explicitly stated fact vs reasonable interpretation vs recommendation. */
export const STATEMENT_KINDS = ["fact", "interpretation", "recommendation"] as const;
export type StatementKind = (typeof STATEMENT_KINDS)[number];

/** How a discovered value relates to what the account already holds. */
export const RELATIONS = ["new", "confirms", "updates", "conflicts", "resolves"] as const;
export type Relation = (typeof RELATIONS)[number];

export const CLASSIFICATION_FIELDS = ["salesMotion", "tigerRoute", "stage", "businessPriority", "technicalComplexity"] as const;
export type ClassificationField = (typeof CLASSIFICATION_FIELDS)[number];
export const CLASSIFICATION_LABELS: Record<ClassificationField, string> = {
  salesMotion: "Sales motion",
  tigerRoute: "Tiger route",
  stage: "Stage",
  businessPriority: "Business priority",
  technicalComplexity: "Technical complexity",
};

const evidence = z
  .object({
    excerpt: z.string().describe("Short verbatim quote copied exactly from the transcript (max ~300 characters)."),
    speaker: z.string().nullable().describe("Speaker of the quote if the transcript labels speakers, else null."),
  })
  .describe("Supporting transcript evidence.");

/**
 * Structured output requested from the model (v2, simplified): summary, action items,
 * technical champions and related MongoDB features. Kept to constructs supported by both
 * providers' structured-output modes (objects, arrays, strings, nullable).
 */
export const meetingAnalysisOutputSchema = z.object({
  summary: z.string().describe("Concise summary of the meeting in 3-5 sentences."),
  actionItems: z
    .array(
      z.object({
        title: z.string().describe("Short imperative task, e.g. 'Send sizing worksheet'."),
        owner: z.string().nullable().describe("Only if explicitly stated."),
        dueDate: z.string().nullable().describe("YYYY-MM-DD only if a concrete date was explicitly stated, else null."),
        evidence,
      }),
    )
    .describe("Tasks or commitments explicitly made in the meeting."),
  champions: z
    .array(
      z.object({
        name: z.string(),
        title: z.string().nullable().describe("Job title if stated."),
        role: z.string().describe("Why this person matters technically (e.g. 'owns the catalog platform, pushing for the PoC')."),
        evidence,
      }),
    )
    .describe("Customer-side people who drive or strongly influence the technical evaluation."),
  features: z
    .array(
      z.object({
        capability: z.string().describe("One of the configured MongoDB capabilities."),
        why: z.string().describe("The customer need from the meeting that this feature addresses."),
        evidence,
      }),
    )
    .describe("MongoDB features related to needs actually discussed in the meeting."),
});
export type MeetingAnalysisOutput = z.infer<typeof meetingAnalysisOutputSchema>;

/** Analyses stored before the simplification have a richer shape; only `summary` is guaranteed. */
export type StoredAnalysisOutput = { summary: string } & Record<string, unknown>;

// ---------------------------------------------------------------------------
// Reviewable suggestions derived from an analysis
// ---------------------------------------------------------------------------

/** `champion` and `feature` are current; the others come from analyses made before the simplification. */
export const SUGGESTION_TYPES = ["action_item", "champion", "feature", "discovery", "classification", "solution_fit", "contact"] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface SuggestionEvidence {
  excerpt: string;
  speaker: string | null;
  /** Character range in the transcript; null when the quote could not be located. */
  start: number | null;
  end: number | null;
}

export interface Suggestion {
  id: string;
  type: SuggestionType;
  /** Human label of the target, e.g. "Business pain points". */
  label: string;
  scope: "opportunity" | "account";
  fieldKey: string | null;
  opportunityId: string | null;
  value: string;
  /** Extra structured data: owner/dueDate (action items), problem/justification (solution fit), title/persona (contacts), rationale. */
  details: Record<string, string | null>;
  kind: StatementKind;
  confidence: Confidence;
  relation: Relation;
  relatedItemId: string | null;
  /** Current value(s) at analysis time, for side-by-side review. */
  existingValue: string | null;
  /** Needs an explicit decision: never applied by bulk approval. */
  conflict: boolean;
  /** Validation problem that blocks approval until edited (e.g. value not configured). */
  blocker: string | null;
  evidence: SuggestionEvidence;
  status: ReviewStatus;
  editedValue: string | null;
  resolution: "added" | "replaced" | "confirmed" | null;
  reviewedAt: Date | null;
}

export interface MeetingAnalysis {
  id: string;
  meetingId: string;
  accountId: string;
  jobId: string;
  provider: string;
  model: string;
  promptVersion: string;
  output: StoredAnalysisOutput;
  suggestions: Suggestion[];
  createdAt: Date;
}

export const suggestionDecisionSchema = z.object({
  action: z.enum(["approve", "reject", "reset"]),
  /** Edited value to apply instead of the suggested one. */
  value: z.string().trim().min(1).max(20000).optional(),
  /** For conflicts on list fields: replace the related item, or add alongside it. */
  resolution: z.enum(["replace", "add"]).optional(),
  /** Pick the opportunity for opportunity-scoped suggestions the AI could not attribute. */
  opportunityId: optionalObjectId.optional(),
});
export type SuggestionDecision = z.infer<typeof suggestionDecisionSchema>;

export const bulkDecisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  suggestionIds: z.array(z.string()).min(1).max(500),
});

// ---------------------------------------------------------------------------
// AI settings
// ---------------------------------------------------------------------------

export const AI_PROVIDERS = ["anthropic", "openai"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];
export const AI_PROVIDER_LABELS: Record<AiProviderName, string> = { anthropic: "Anthropic (Claude)", openai: "OpenAI" };

/** Where an analysis came from: a configured provider, or a result imported from an external tool (e.g. Glean). */
export type AnalysisSource = AiProviderName | "import";

export const importAnalysisSchema = z.object({
  /** Raw text returned by the external tool; may include ```json fences or surrounding prose. */
  result: z.string().trim().min(2, "Paste the JSON result").max(500_000),
  /** Free label shown on the analysis, e.g. "Glean". */
  sourceLabel: z.string().trim().max(60).optional(),
});
export type ImportAnalysisInput = z.infer<typeof importAnalysisSchema>;

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(AI_PROVIDERS),
  model: z.string().trim().max(100).nullish().transform((v) => (v ? v : null)),
  redactContactDetails: z.boolean(),
});
export type AiSettingsInput = z.input<typeof aiSettingsSchema>;

export interface AiSettings {
  enabled: boolean;
  provider: AiProviderName;
  model: string | null;
  redactContactDetails: boolean;
  approvedAt: Date | null;
  approvedBy: string | null;
}

export interface AiStatus extends AiSettings {
  /** Server-side key present for the selected provider (the key itself is never exposed). */
  keyConfigured: boolean;
  effectiveModel: string | null;
  ready: boolean;
  reason: string | null;
}
