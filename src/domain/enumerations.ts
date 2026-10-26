import { z } from "zod";
import { requiredText } from "./common";

/**
 * Configurable enumerations. None of these encode MongoDB internal sales rules:
 * the defaults are editable starting points and classification is always manual
 * (or an AI suggestion that the SA approves, from Phase 2).
 */
export const ENUMERATION_KINDS = [
  "salesMotions",
  "tigerRoutes",
  "opportunityStages",
  "closedStages",
  "accountStatuses",
  "priorities",
  "complexities",
  "contactPersonas",
  "mongodbCapabilities",
  "meetingTypes",
] as const;

export type EnumerationKind = (typeof ENUMERATION_KINDS)[number];

export type Enumerations = Record<EnumerationKind, string[]>;

export const ENUMERATION_META: Record<EnumerationKind, { label: string; description: string }> = {
  salesMotions: {
    label: "Sales motions",
    description: "Classification of an opportunity's sales motion.",
  },
  tigerRoutes: {
    label: "Tiger routes",
    description: "Route classification for an opportunity.",
  },
  opportunityStages: {
    label: "Opportunity stages",
    description: "Generic pipeline stages. Replace them with the stages you actually use.",
  },
  closedStages: {
    label: "Closed stages",
    description: "Stages treated as closed. Opportunities in these stages are excluded from active counts.",
  },
  accountStatuses: {
    label: "Account statuses",
    description: "Lifecycle status of an account in your book.",
  },
  priorities: {
    label: "Priorities",
    description: "Used for business priority and action item priority.",
  },
  complexities: {
    label: "Technical complexity",
    description: "Relative technical complexity of an opportunity.",
  },
  contactPersonas: {
    label: "Contact personas",
    description: "Persona of a customer contact; also used to organise discovery questions.",
  },
  mongodbCapabilities: {
    label: "MongoDB capabilities",
    description: "Products and capabilities that can be evaluated in Solution Fit.",
  },
  meetingTypes: {
    label: "Meeting types",
    description: "Types of customer and internal meetings (used from Phase 2).",
  },
};

export const DEFAULT_ENUMERATIONS: Enumerations = {
  salesMotions: ["Select", "Launch", "Replace", "Migrate"],
  tigerRoutes: ["Classic", "Fast", "Sprint"],
  opportunityStages: ["Qualification", "Discovery", "Technical Validation", "Proposal", "Closed Won", "Closed Lost"],
  closedStages: ["Closed Won", "Closed Lost"],
  accountStatuses: ["Prospect", "Active", "On Hold", "Inactive"],
  priorities: ["Low", "Medium", "High", "Critical"],
  complexities: ["Low", "Medium", "High"],
  contactPersonas: [
    "Executive / Business",
    "Engineering Leadership",
    "Architect",
    "Developer",
    "Database Administrator",
    "Security / Operations",
    "Procurement",
    "Other",
  ],
  mongodbCapabilities: [
    "MongoDB Atlas",
    "Atlas Search",
    "Atlas Vector Search",
    "Atlas Stream Processing",
    "Atlas Triggers",
    "Atlas Data Federation",
    "Change Streams",
    "Sharding",
    "Replication",
    "Atlas Kubernetes Operator",
  ],
  meetingTypes: [
    "Initial Discovery",
    "Technical Discovery",
    "Architecture Review",
    "Demo",
    "PoC Planning",
    "PoC Review",
    "Follow-up",
    "Internal Account Sync",
    "Other",
  ],
};

/** Kinds that may legitimately be empty. */
const OPTIONAL_KINDS: ReadonlySet<EnumerationKind> = new Set(["closedStages"]);

export const enumerationValuesSchema = z
  .array(requiredText(80))
  .max(100)
  .refine(
    (values) => new Set(values.map((v) => v.toLowerCase())).size === values.length,
    "Values must be unique",
  );

export const enumerationUpdateSchema = z
  .object({
    kind: z.enum(ENUMERATION_KINDS),
    values: enumerationValuesSchema,
  })
  .refine((v) => OPTIONAL_KINDS.has(v.kind) || v.values.length > 0, {
    path: ["values"],
    message: "Keep at least one value",
  });
export type EnumerationUpdate = z.infer<typeof enumerationUpdateSchema>;

/** Action item statuses are fixed by the product specification. */
export const ACTION_ITEM_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];
export const ACTION_ITEM_STATUS_LABELS: Record<ActionItemStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

/** Solution fit statuses are fixed by the product specification. */
export const SOLUTION_FIT_STATUSES = ["Identified", "Proposed", "Validated", "Rejected"] as const;
export type SolutionFitStatus = (typeof SOLUTION_FIT_STATUSES)[number];
