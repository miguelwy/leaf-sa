import type { ObjectId } from "mongodb";
import type { DiscoveryItemStatus } from "@/domain/discovery";
import type { ActionItemStatus, Enumerations, SolutionFitStatus } from "@/domain/enumerations";
import type { FieldChange, HistoryEntityType } from "@/domain/entities";
import type {
  AiProviderName,
  AnalysisStatus,
  MeetingAnalysisOutput,
  Suggestion,
  TranscriptFormat,
  TranscriptSegment,
} from "@/domain/meetings";

interface Stamped {
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDoc extends Stamped {
  _id: ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  role: "owner" | "member";
  lastLoginAt: Date | null;
}

export interface AiSettingsDoc {
  _id: "ai";
  enabled: boolean;
  provider: AiProviderName;
  model: string | null;
  redactContactDetails: boolean;
  approvedAt: Date | null;
  approvedBy: ObjectId | null;
  updatedAt: Date;
}

export type SettingsDoc =
  | { _id: "enumerations"; values: Enumerations; updatedAt: Date }
  | { _id: "setup"; completedAt: Date; ownerId: ObjectId }
  | AiSettingsDoc;

export interface AccountExecutiveDoc extends Stamped {
  _id: ObjectId;
  name: string;
  email: string | null;
  territory: string | null;
  region: string | null;
  notes: string | null;
}

export type SourceDoc = { kind: "manual" } | { kind: "meeting"; meetingId: ObjectId; excerpt?: string | null };

export interface DiscoveryItemDoc {
  id: string;
  text: string;
  status: DiscoveryItemStatus;
  source: SourceDoc;
  createdAt: Date;
  updatedAt: Date;
}

export type DiscoveryValuesDoc = Record<string, DiscoveryItemDoc[]>;

export interface AccountDoc extends Stamped {
  _id: ObjectId;
  name: string;
  nameLower: string;
  industry: string | null;
  website: string | null;
  region: string | null;
  aeId: ObjectId | null;
  status: string;
  description: string | null;
  internalNotes: string | null;
  lastInteractionAt: Date | null;
  nextMeetingAt: Date | null;
  techStack: DiscoveryValuesDoc;
}

export interface ContactDoc extends Stamped {
  _id: ObjectId;
  accountId: ObjectId;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  persona: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface SolutionFitDoc {
  id: string;
  capability: string;
  problem: string;
  proposedSolution: string | null;
  justification: string | null;
  businessValue: string | null;
  limitations: string | null;
  validation: string | null;
  status: SolutionFitStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpportunityDoc extends Stamped {
  _id: ObjectId;
  accountId: ObjectId;
  name: string;
  aeId: ObjectId | null;
  salesMotion: string | null;
  tigerRoute: string | null;
  stage: string | null;
  estimatedTimeline: string | null;
  expectedWorkload: string | null;
  description: string | null;
  businessPriority: string | null;
  technicalComplexity: string | null;
  nextMilestone: { title: string | null; dueDate: Date | null };
  discovery: DiscoveryValuesDoc;
  solutionFit: SolutionFitDoc[];
}

export interface WorkloadDoc extends Stamped {
  _id: ObjectId;
  accountId: ObjectId;
  opportunityId: ObjectId;
  name: string;
  description: string | null;
  useCase: string | null;
  dataVolume: string | null;
  expectedGrowth: string | null;
  readWritePattern: string | null;
  latency: string | null;
  availability: string | null;
  disasterRecovery: string | null;
  security: string | null;
  compliance: string | null;
  notes: string | null;
}

export interface NoteDoc extends Stamped {
  _id: ObjectId;
  accountId: ObjectId;
  opportunityId: ObjectId | null;
  meetingId: ObjectId | null;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  revision: number;
  createdBy: ObjectId | null;
}

export interface NoteRevisionDoc {
  _id: ObjectId;
  noteId: ObjectId;
  accountId: ObjectId;
  revision: number;
  title: string;
  body: string;
  tags: string[];
  editedAt: Date;
  editedBy: ObjectId | null;
}

export interface ActionItemDoc extends Stamped {
  _id: ObjectId;
  title: string;
  description: string | null;
  accountId: ObjectId | null;
  opportunityId: ObjectId | null;
  meetingId: ObjectId | null;
  owner: string | null;
  dueDate: Date | null;
  priority: string | null;
  status: ActionItemStatus;
  source: SourceDoc;
  completedAt: Date | null;
}

export interface ChangeHistoryDoc {
  _id: ObjectId;
  accountId: ObjectId;
  entityType: HistoryEntityType;
  entityId: ObjectId;
  entityLabel: string;
  action: "create" | "update" | "delete";
  changes: FieldChange[];
  actor: { kind: "user" | "ai-approved"; userId: ObjectId | null; name: string | null };
  at: Date;
}

export interface MeetingDoc extends Stamped {
  _id: ObjectId;
  accountId: ObjectId;
  opportunityId: ObjectId | null;
  title: string;
  startsAt: Date;
  type: string | null;
  participants: string[];
  transcript: {
    raw: string;
    format: TranscriptFormat;
    fileName: string | null;
    segments: TranscriptSegment[];
    charCount: number;
    ingestedAt: Date;
  } | null;
  summary: string | null;
  analysisStatus: AnalysisStatus;
  latestAnalysisId: ObjectId | null;
  analysisError: string | null;
  createdBy: ObjectId | null;
}

export interface SuggestionDoc extends Omit<Suggestion, "opportunityId"> {
  opportunityId: ObjectId | null;
}

export interface MeetingAnalysisDoc {
  _id: ObjectId;
  meetingId: ObjectId;
  accountId: ObjectId;
  jobId: ObjectId;
  provider: AiProviderName;
  model: string;
  promptVersion: string;
  output: MeetingAnalysisOutput;
  suggestions: SuggestionDoc[];
  createdAt: Date;
}

export interface AiJobDoc {
  _id: ObjectId;
  kind: "meeting_analysis";
  meetingId: ObjectId;
  accountId: ObjectId;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  provider: AiProviderName;
  model: string;
  promptVersion: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | null;
  costUsd: number | null;
  durationMs: number | null;
  error: string | null;
  createdBy: ObjectId | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}
