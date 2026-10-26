import { z } from "zod";
import { objectIdSchema, optionalDate, optionalObjectId, optionalText, requiredText, type Timestamps } from "./common";
import { DISCOVERY_FIELDS } from "./discovery";

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

export const CHANGE_TYPES = [
  "new_requirement",
  "architecture_change",
  "new_technology",
  "resolved_question",
  "decision",
  "commitment",
  "contradiction",
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];
export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  new_requirement: "New requirement",
  architecture_change: "Architecture change",
  new_technology: "New technology",
  resolved_question: "Resolved question",
  decision: "Decision",
  commitment: "Commitment",
  contradiction: "Contradiction",
};

const DISCOVERY_KEYS = DISCOVERY_FIELDS.map((f) => f.key) as [string, ...string[]];

const evidence = z
  .object({
    excerpt: z.string().describe("Short verbatim quote copied exactly from the transcript (max ~300 characters)."),
    speaker: z.string().nullable().describe("Speaker of the quote if the transcript labels speakers, else null."),
  })
  .describe("Supporting transcript evidence.");

const insight = z.object({
  text: z.string(),
  kind: z.enum(STATEMENT_KINDS),
  confidence: z.enum(CONFIDENCE_LEVELS),
  evidence,
});

/**
 * Structured output requested from the model. Kept to constructs supported by both
 * providers' structured-output modes (objects, arrays, enums, strings, nullable).
 */
export const meetingAnalysisOutputSchema = z.object({
  summary: z.string().describe("Concise executive summary of the discussion (3-6 sentences)."),
  businessInsights: z.array(insight).describe("Business objectives, drivers, pain points and impact."),
  technicalInsights: z.array(insight).describe("Technologies, workloads, requirements, constraints, architecture observations."),
  decisions: z.array(z.object({ text: z.string(), evidence })).describe("Only decisions explicitly confirmed in the meeting."),
  actionItems: z
    .array(
      z.object({
        title: z.string(),
        owner: z.string().nullable().describe("Only if explicitly stated."),
        dueDate: z.string().nullable().describe("YYYY-MM-DD only if a concrete date was explicitly stated, else null."),
        opportunityId: z.string().nullable(),
        evidence,
      }),
    )
    .describe("Tasks or commitments explicitly made in the meeting."),
  openQuestions: z.array(z.object({ text: z.string(), evidence: evidence.nullable() })).describe("Information that still needs clarification."),
  missingInformation: z.array(z.string()).describe("Important discovery information that is still unknown after this meeting."),
  discoveryUpdates: z
    .array(
      z.object({
        scope: z.enum(["opportunity", "account"]),
        fieldKey: z.enum(DISCOVERY_KEYS),
        opportunityId: z.string().nullable().describe("Required for opportunity scope when known; one of the provided opportunity ids."),
        value: z.string().describe("The value to record, phrased as a concise standalone statement."),
        kind: z.enum(STATEMENT_KINDS),
        confidence: z.enum(CONFIDENCE_LEVELS),
        relation: z.enum(RELATIONS),
        relatedItemId: z.string().nullable().describe("Id of the existing item this confirms, updates, conflicts with or resolves."),
        evidence,
      }),
    )
    .describe("Proposed updates to the account/opportunity discovery profile."),
  classificationSuggestions: z
    .array(
      z.object({
        field: z.enum(CLASSIFICATION_FIELDS),
        opportunityId: z.string().nullable(),
        value: z.string().describe("Must be one of the configured values for this field."),
        rationale: z.string(),
        confidence: z.enum(CONFIDENCE_LEVELS),
        evidence,
      }),
    )
    .describe("Only when the transcript gives clear supporting evidence."),
  mongodbOpportunities: z
    .array(
      z.object({
        capability: z.string().describe("One of the configured MongoDB capabilities."),
        opportunityId: z.string().nullable(),
        problem: z.string().describe("The discovered customer problem this addresses."),
        justification: z.string(),
        confidence: z.enum(CONFIDENCE_LEVELS),
        evidence,
      }),
    )
    .describe("Only capabilities technically justified by requirements discussed in the meeting."),
  contacts: z
    .array(
      z.object({
        name: z.string(),
        title: z.string().nullable(),
        persona: z.string().nullable().describe("One of the configured personas, or null."),
        evidence,
      }),
    )
    .describe("Customer-side people who participated or were mentioned, not already in the contact list."),
  changesSinceLastMeeting: z
    .array(z.object({ type: z.enum(CHANGE_TYPES), text: z.string(), evidence: evidence.nullable() }))
    .describe("Differences versus the previous meeting and the current account profile. Empty if there is no prior context."),
});
export type MeetingAnalysisOutput = z.infer<typeof meetingAnalysisOutputSchema>;

// ---------------------------------------------------------------------------
// Reviewable suggestions derived from an analysis
// ---------------------------------------------------------------------------

export const SUGGESTION_TYPES = ["discovery", "classification", "action_item", "solution_fit", "contact"] as const;
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
  output: MeetingAnalysisOutput;
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
