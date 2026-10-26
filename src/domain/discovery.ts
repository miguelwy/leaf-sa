import { z } from "zod";

/**
 * Discovery values are stored as items with provenance rather than plain strings, so
 * AI-extracted facts (Phase 2) and manual entries share one shape and every value can
 * be traced back to where it came from.
 */
export const DISCOVERY_ITEM_STATUSES = ["confirmed", "tentative"] as const;
export type DiscoveryItemStatus = (typeof DISCOVERY_ITEM_STATUSES)[number];

export type DiscoverySource =
  | { kind: "manual" }
  | { kind: "meeting"; meetingId: string; excerpt?: string | null };

export interface DiscoveryItem {
  id: string;
  text: string;
  status: DiscoveryItemStatus;
  source: DiscoverySource;
  createdAt: Date;
  updatedAt: Date;
}

export type DiscoveryValues = Partial<Record<string, DiscoveryItem[]>>;

export type DiscoveryScope = "opportunity" | "account";
export type DiscoveryFieldKind = "list" | "text" | "mermaid";

export const DISCOVERY_GROUPS = {
  business: { label: "Business Discovery", scope: "opportunity" },
  technical: { label: "Technical Discovery", scope: "opportunity" },
  competitive: { label: "Competitive Landscape", scope: "opportunity" },
  architecture: { label: "Architecture", scope: "opportunity" },
  stack: { label: "Technology Stack", scope: "account" },
} as const satisfies Record<string, { label: string; scope: DiscoveryScope }>;

export type DiscoveryGroup = keyof typeof DISCOVERY_GROUPS;

export interface DiscoveryFieldDef {
  key: string;
  label: string;
  group: DiscoveryGroup;
  kind: DiscoveryFieldKind;
  hint?: string;
}

const f = (
  group: DiscoveryGroup,
  key: string,
  label: string,
  kind: DiscoveryFieldKind = "list",
  hint?: string,
): DiscoveryFieldDef => ({ group, key, label, kind, hint });

export const DISCOVERY_FIELDS: DiscoveryFieldDef[] = [
  // Business discovery (per opportunity)
  f("business", "businessObjectives", "Business objectives"),
  f("business", "businessDrivers", "Business drivers", "list", "Why now? What is forcing the change?"),
  f("business", "painPoints", "Business pain points"),
  f("business", "businessImpact", "Business impact", "list", "Quantify where possible: revenue, cost, risk."),
  f("business", "operationalChallenges", "Current operational challenges"),
  f("business", "desiredOutcomes", "Desired outcomes"),
  f("business", "successCriteria", "Success criteria"),
  f("business", "decisionTimeline", "Decision timeline"),
  f("business", "budget", "Budget considerations"),
  f("business", "businessStakeholders", "Business stakeholders"),
  f("business", "decisionProcess", "Decision-making process"),
  f("business", "keyRisks", "Key risks"),
  f("business", "openQuestions", "Open questions"),

  // Technical discovery (per opportunity)
  f("technical", "currentArchitecture", "Current application architecture", "text"),
  f("technical", "currentWorkloads", "Current workloads"),
  f("technical", "dataVolumes", "Data volumes"),
  f("technical", "expectedGrowth", "Expected growth"),
  f("technical", "readWritePatterns", "Read/write patterns"),
  f("technical", "latencyRequirements", "Latency requirements"),
  f("technical", "availabilityRequirements", "Availability requirements"),
  f("technical", "drRequirements", "Disaster recovery requirements"),
  f("technical", "securityRequirements", "Security requirements"),
  f("technical", "complianceRequirements", "Compliance requirements"),
  f("technical", "scalabilityChallenges", "Scalability challenges"),
  f("technical", "architecturalLimitations", "Existing architectural limitations"),
  f("technical", "migrationConstraints", "Migration constraints"),
  f("technical", "technicalOpenQuestions", "Open technical questions"),

  // Competitive landscape (per opportunity)
  f("competitive", "existingVendors", "Existing database vendors"),
  f("competitive", "competingTechnologies", "Competing technologies"),
  f("competitive", "solutionsEvaluated", "Solutions being evaluated"),
  f("competitive", "replacementReasons", "Reasons for considering replacement"),
  f("competitive", "migrationComplexity", "Migration complexity"),
  f("competitive", "technicalObjections", "Technical objections"),
  f("competitive", "risksAndBlockers", "Risks and blockers"),
  f("competitive", "differentiators", "Differentiators supported by evidence", "list", "Only record differentiators backed by customer evidence."),

  // Architecture (per opportunity)
  f("architecture", "currentState", "Current-state architecture", "text"),
  f("architecture", "targetState", "Target-state architecture", "text"),
  f("architecture", "diagram", "Architecture diagram (Mermaid)", "mermaid"),
  f("architecture", "architectureDecisions", "Architecture decisions"),
  f("architecture", "technicalAssumptions", "Technical assumptions"),
  f("architecture", "architectureQuestions", "Open architectural questions"),
  f("architecture", "tradeoffs", "Risks and tradeoffs"),
  f("architecture", "proposedComponents", "Proposed MongoDB components"),
  f("architecture", "externalIntegrations", "External integrations"),
  f("architecture", "documentationLinks", "Links to technical documentation"),

  // Technology stack (per account)
  f("stack", "currentDatabases", "Current databases"),
  f("stack", "cloudProviders", "Cloud providers"),
  f("stack", "programmingLanguages", "Programming languages"),
  f("stack", "backendFrameworks", "Backend frameworks"),
  f("stack", "dataPipelines", "Data pipelines"),
  f("stack", "integrationTechnologies", "Integration technologies"),
  f("stack", "stackNotes", "Stack notes", "text"),
];

export const DISCOVERY_FIELD_MAP = new Map(DISCOVERY_FIELDS.map((d) => [d.key, d]));

export function fieldsForGroup(group: DiscoveryGroup): DiscoveryFieldDef[] {
  return DISCOVERY_FIELDS.filter((d) => d.group === group);
}

export function fieldsForScope(scope: DiscoveryScope): DiscoveryFieldDef[] {
  return DISCOVERY_FIELDS.filter((d) => DISCOVERY_GROUPS[d.group].scope === scope);
}

export function getFieldDef(key: string, scope: DiscoveryScope): DiscoveryFieldDef | null {
  const def = DISCOVERY_FIELD_MAP.get(key);
  return def && DISCOVERY_GROUPS[def.group].scope === scope ? def : null;
}

/** Keeps embedded arrays bounded so opportunity/account documents stay small. */
export const MAX_ITEMS_PER_FIELD = 100;

export const discoveryItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1, "Required").max(20000),
  status: z.enum(DISCOVERY_ITEM_STATUSES).default("confirmed"),
});
export type DiscoveryItemInput = z.input<typeof discoveryItemInputSchema>;

export const discoveryFieldUpdateSchema = z.object({
  items: z.array(discoveryItemInputSchema).max(MAX_ITEMS_PER_FIELD),
});
export type DiscoveryFieldUpdate = z.infer<typeof discoveryFieldUpdateSchema>;

/** Share of fields in a group that have at least one confirmed item. */
export function completeness(values: DiscoveryValues | undefined, groups: DiscoveryGroup[]) {
  const defs = DISCOVERY_FIELDS.filter((d) => groups.includes(d.group) && d.kind !== "mermaid");
  const filled = defs.filter((d) => (values?.[d.key] ?? []).some((i) => i.status === "confirmed")).length;
  return { filled, total: defs.length, ratio: defs.length ? filled / defs.length : 0 };
}
