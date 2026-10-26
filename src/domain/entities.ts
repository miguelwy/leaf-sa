import { z } from "zod";
import {
  optionalDate,
  optionalEmail,
  optionalObjectId,
  optionalText,
  optionalUrl,
  requiredText,
  tagsSchema,
  type Timestamps,
} from "./common";
import type { DiscoveryValues } from "./discovery";
import { ACTION_ITEM_STATUSES, SOLUTION_FIT_STATUSES, type ActionItemStatus, type SolutionFitStatus } from "./enumerations";

// ---------------------------------------------------------------------------
// Account executives
// ---------------------------------------------------------------------------

export const accountExecutiveInputSchema = z.object({
  name: requiredText(120),
  email: optionalEmail,
  territory: optionalText(120),
  region: optionalText(120),
  notes: optionalText(10000),
});
export type AccountExecutiveInput = z.input<typeof accountExecutiveInputSchema>;

export interface AccountExecutive extends Timestamps {
  id: string;
  name: string;
  email: string | null;
  territory: string | null;
  region: string | null;
  notes: string | null;
}

export interface AccountExecutiveSummary extends AccountExecutive {
  accountCount: number;
  activeOpportunityCount: number;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const accountInputSchema = z.object({
  name: requiredText(200),
  industry: optionalText(120),
  website: optionalUrl,
  region: optionalText(120),
  aeId: optionalObjectId,
  status: requiredText(80),
  description: optionalText(5000),
  internalNotes: optionalText(20000),
  lastInteractionAt: optionalDate,
  nextMeetingAt: optionalDate,
});
export type AccountInput = z.input<typeof accountInputSchema>;
export const accountPatchSchema = accountInputSchema.partial();

export interface Account extends Timestamps {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  region: string | null;
  aeId: string | null;
  status: string;
  description: string | null;
  internalNotes: string | null;
  lastInteractionAt: Date | null;
  nextMeetingAt: Date | null;
  techStack: DiscoveryValues;
}

export interface AccountListItem extends Account {
  aeName: string | null;
  opportunityCount: number;
  salesMotions: string[];
  openActionItems: number;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

// Note: Zod 4 applies `.default()` even inside `.partial()`, so patch schemas are built
// from default-free field sets; defaults are added only to the create schemas.
const contactFields = {
  name: requiredText(120),
  title: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  persona: optionalText(80),
  isPrimary: z.boolean(),
  notes: optionalText(2000),
};
export const contactInputSchema = z.object({ ...contactFields, isPrimary: contactFields.isPrimary.default(false) });
export const contactPatchSchema = z.object(contactFields).partial();
export type ContactInput = z.input<typeof contactInputSchema>;

export interface Contact extends Timestamps {
  id: string;
  accountId: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  persona: string | null;
  isPrimary: boolean;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export const opportunityInputSchema = z.object({
  name: requiredText(200),
  aeId: optionalObjectId,
  salesMotion: optionalText(80),
  tigerRoute: optionalText(80),
  stage: optionalText(80),
  estimatedTimeline: optionalText(200),
  expectedWorkload: optionalText(500),
  description: optionalText(10000),
  businessPriority: optionalText(80),
  technicalComplexity: optionalText(80),
  nextMilestoneTitle: optionalText(200),
  nextMilestoneDate: optionalDate,
});
export type OpportunityInput = z.input<typeof opportunityInputSchema>;
export const opportunityCreateSchema = opportunityInputSchema.extend({ accountId: z.string().regex(/^[a-f\d]{24}$/i) });
export const opportunityPatchSchema = opportunityInputSchema.partial();

export interface SolutionFitEntry {
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

const solutionFitFields = {
  capability: requiredText(120),
  // Required: a capability is only recorded against a discovered customer problem.
  problem: requiredText(5000),
  proposedSolution: optionalText(5000),
  justification: optionalText(5000),
  businessValue: optionalText(5000),
  limitations: optionalText(5000),
  validation: optionalText(5000),
  status: z.enum(SOLUTION_FIT_STATUSES),
};
export const solutionFitInputSchema = z.object({
  ...solutionFitFields,
  status: solutionFitFields.status.default("Identified"),
});
export const solutionFitPatchSchema = z.object(solutionFitFields).partial();
export type SolutionFitInput = z.input<typeof solutionFitInputSchema>;

export const MAX_SOLUTION_FIT_ENTRIES = 50;

export interface Opportunity extends Timestamps {
  id: string;
  accountId: string;
  name: string;
  aeId: string | null;
  salesMotion: string | null;
  tigerRoute: string | null;
  stage: string | null;
  estimatedTimeline: string | null;
  expectedWorkload: string | null;
  description: string | null;
  businessPriority: string | null;
  technicalComplexity: string | null;
  nextMilestone: { title: string | null; dueDate: Date | null };
  discovery: DiscoveryValues;
  solutionFit: SolutionFitEntry[];
}

export interface OpportunityListItem extends Opportunity {
  accountName: string;
  aeName: string | null;
}

// ---------------------------------------------------------------------------
// Workloads
// ---------------------------------------------------------------------------

export const workloadInputSchema = z.object({
  name: requiredText(200),
  description: optionalText(5000),
  useCase: optionalText(2000),
  dataVolume: optionalText(500),
  expectedGrowth: optionalText(500),
  readWritePattern: optionalText(1000),
  latency: optionalText(500),
  availability: optionalText(500),
  disasterRecovery: optionalText(500),
  security: optionalText(1000),
  compliance: optionalText(1000),
  notes: optionalText(5000),
});
export type WorkloadInput = z.input<typeof workloadInputSchema>;
export const workloadCreateSchema = workloadInputSchema.extend({
  opportunityId: z.string().regex(/^[a-f\d]{24}$/i),
});

export const WORKLOAD_REQUIREMENT_FIELDS = [
  ["useCase", "Use case"],
  ["dataVolume", "Data volume"],
  ["expectedGrowth", "Expected growth"],
  ["readWritePattern", "Read/write pattern"],
  ["latency", "Latency"],
  ["availability", "Availability"],
  ["disasterRecovery", "Disaster recovery"],
  ["security", "Security"],
  ["compliance", "Compliance"],
] as const;

export interface Workload extends Timestamps {
  id: string;
  accountId: string;
  opportunityId: string;
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

// ---------------------------------------------------------------------------
// SA notes
// ---------------------------------------------------------------------------

const noteFields = {
  title: requiredText(200),
  body: z.string().max(200000),
  tags: tagsSchema,
  pinned: z.boolean(),
  opportunityId: optionalObjectId,
};
export const noteInputSchema = z.object({
  ...noteFields,
  body: noteFields.body.default(""),
  tags: noteFields.tags.default([]),
  pinned: noteFields.pinned.default(false),
});
export type NoteInput = z.input<typeof noteInputSchema>;
export const noteCreateSchema = noteInputSchema.extend({ accountId: z.string().regex(/^[a-f\d]{24}$/i) });
export const notePatchSchema = z.object(noteFields).partial();

export interface Note extends Timestamps {
  id: string;
  accountId: string;
  opportunityId: string | null;
  meetingId: string | null;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  revision: number;
}

export interface NoteRevision {
  id: string;
  noteId: string;
  revision: number;
  title: string;
  body: string;
  tags: string[];
  editedAt: Date;
}

// ---------------------------------------------------------------------------
// Action items
// ---------------------------------------------------------------------------

const actionItemFields = {
  title: requiredText(300),
  description: optionalText(10000),
  accountId: optionalObjectId,
  opportunityId: optionalObjectId,
  owner: optionalText(120),
  dueDate: optionalDate,
  priority: optionalText(80),
  status: z.enum(ACTION_ITEM_STATUSES),
};
export const actionItemInputSchema = z.object({ ...actionItemFields, status: actionItemFields.status.default("todo") });
export type ActionItemInput = z.input<typeof actionItemInputSchema>;
export const actionItemPatchSchema = z.object(actionItemFields).partial();

export type ActionItemSource =
  | { kind: "manual" }
  | { kind: "meeting"; meetingId: string; excerpt?: string | null };

export interface ActionItem extends Timestamps {
  id: string;
  title: string;
  description: string | null;
  accountId: string | null;
  opportunityId: string | null;
  meetingId: string | null;
  owner: string | null;
  dueDate: Date | null;
  priority: string | null;
  status: ActionItemStatus;
  source: ActionItemSource;
  completedAt: Date | null;
}

export interface ActionItemListItem extends ActionItem {
  accountName: string | null;
  opportunityName: string | null;
}

export const actionItemFilterSchema = z.object({
  status: z.enum([...ACTION_ITEM_STATUSES, "open", "all"]).default("open"),
  accountId: optionalObjectId,
  aeId: optionalObjectId,
  due: z.enum(["overdue", "week", "any"]).default("any"),
});
export type ActionItemFilter = z.infer<typeof actionItemFilterSchema>;

// ---------------------------------------------------------------------------
// Change history
// ---------------------------------------------------------------------------

export type HistoryEntityType =
  | "account"
  | "contact"
  | "opportunity"
  | "workload"
  | "note"
  | "action_item"
  | "meeting";

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ChangeHistoryEntry {
  id: string;
  accountId: string;
  entityType: HistoryEntityType;
  entityId: string;
  entityLabel: string;
  action: "create" | "update" | "delete";
  changes: FieldChange[];
  actor: { kind: "user" | "ai-approved"; userId: string | null; name: string | null };
  at: Date;
}
