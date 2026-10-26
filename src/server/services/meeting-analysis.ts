import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import { DISCOVERY_FIELD_MAP, getFieldDef, type DiscoveryScope } from "@/domain/discovery";
import type { EnumerationKind, Enumerations } from "@/domain/enumerations";
import {
  CLASSIFICATION_LABELS,
  meetingAnalysisOutputSchema,
  type ClassificationField,
  type MeetingAnalysis,
  type MeetingAnalysisOutput,
  type Relation,
  type SuggestionEvidence,
} from "@/domain/meetings";
import { getAiStatus } from "@/server/ai/settings";
import { estimateCostUsd } from "@/server/ai/pricing";
import { AiOutputError, getProvider, type StructuredResult } from "@/server/ai/provider";
import { buildMeetingAnalysisPrompt, MEETING_ANALYSIS_PROMPT_VERSION, MEETING_ANALYSIS_SYSTEM, type MeetingContextInput } from "@/server/ai/prompts/meeting-analysis";
import { redactContactDetails } from "@/server/ai/redact";
import { collections } from "@/server/db/collections";
import { idString, toObjectId } from "@/server/db/ids";
import type { AccountDoc, DiscoveryItemDoc, MeetingAnalysisDoc, MeetingDoc, OpportunityDoc, SuggestionDoc } from "@/server/db/types";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import { getEnumerations } from "./settings";

const MAX_OUTPUT_TOKENS = 16000;
const MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Evidence location
// ---------------------------------------------------------------------------

/**
 * Finds a quote in the transcript, tolerating differences in whitespace, case and
 * quote characters. Returns the character range in the original text, or null.
 */
export function locateExcerpt(raw: string, excerpt: string): { start: number; end: number } | null {
  const quote = excerpt.trim();
  if (!quote) return null;
  const exact = raw.indexOf(quote);
  if (exact >= 0) return { start: exact, end: exact + quote.length };

  const norm = (ch: string) => ch.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  // Normalised copy of raw with a map back to original indices.
  const chars: string[] = [];
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        chars.push(" ");
        map.push(i);
      }
      lastWasSpace = true;
    } else {
      chars.push(norm(ch));
      map.push(i);
      lastWasSpace = false;
    }
  }
  const haystack = chars.join("");
  const needle = norm(quote).replace(/\s+/g, " ").replace(/^["']|["'.…]+$/g, "").trim();
  for (const candidate of [needle, needle.slice(0, 80)]) {
    if (candidate.length < 12) continue;
    const idx = haystack.indexOf(candidate);
    if (idx >= 0) return { start: map[idx], end: map[Math.min(idx + candidate.length, map.length) - 1] + 1 };
  }
  return null;
}

function evidenceOf(raw: string, ev: { excerpt: string; speaker: string | null } | null): SuggestionEvidence {
  if (!ev) return { excerpt: "", speaker: null, start: null, end: null };
  const range = locateExcerpt(raw, ev.excerpt);
  return { excerpt: ev.excerpt.slice(0, 600), speaker: ev.speaker, start: range?.start ?? null, end: range?.end ?? null };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AnalysisData {
  meeting: MeetingDoc;
  account: AccountDoc;
  opportunities: OpportunityDoc[];
  contactNames: string[];
  enums: Enumerations;
}

async function loadAnalysisData(meeting: MeetingDoc): Promise<AnalysisData> {
  const c = await collections();
  const [account, opportunities, contacts, enums] = await Promise.all([
    c.accounts.findOne({ _id: meeting.accountId }),
    c.opportunities.find({ accountId: meeting.accountId }).sort({ updatedAt: -1 }).toArray(),
    c.contacts.find({ accountId: meeting.accountId }, { projection: { name: 1 } }).toArray(),
    getEnumerations(),
  ]);
  if (!account) throw new NotFoundError("Account");
  return { meeting, account, opportunities, contactNames: contacts.map((x) => x.name), enums };
}

const clip = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n)}…` : s);

async function buildContext(data: AnalysisData, transcript: string): Promise<MeetingContextInput> {
  const c = await collections();
  const { meeting, account, opportunities, enums } = data;

  const profile: MeetingContextInput["profile"] = [];
  for (const [fieldKey, items] of Object.entries(account.techStack ?? {})) {
    if (items.length) profile.push({ scope: "account", opportunityId: null, fieldKey, items: items.map((i) => ({ id: i.id, text: clip(i.text), status: i.status })) });
  }
  for (const opp of opportunities) {
    for (const [fieldKey, items] of Object.entries(opp.discovery ?? {})) {
      if (items.length && DISCOVERY_FIELD_MAP.get(fieldKey)?.kind !== "mermaid") {
        profile.push({
          scope: "opportunity",
          opportunityId: opp._id.toHexString(),
          fieldKey,
          items: items.map((i) => ({ id: i.id, text: clip(i.text), status: i.status })),
        });
      }
    }
  }

  const [openTasks, previous] = await Promise.all([
    c.actionItems.find({ accountId: account._id, status: { $ne: "done" } }, { projection: { title: 1 } }).limit(50).toArray(),
    c.meetings.findOne(
      { accountId: account._id, _id: { $ne: meeting._id }, startsAt: { $lte: meeting.startsAt }, latestAnalysisId: { $ne: null } },
      { sort: { startsAt: -1 }, projection: { title: 1, startsAt: 1, summary: 1, latestAnalysisId: 1 } },
    ),
  ]);
  let previousMeeting: MeetingContextInput["previousMeeting"] = null;
  if (previous?.latestAnalysisId) {
    const prevAnalysis = await c.meetingAnalyses.findOne({ _id: previous.latestAnalysisId }, { projection: { output: 1 } });
    previousMeeting = {
      title: previous.title,
      date: previous.startsAt.toISOString().slice(0, 10),
      summary: previous.summary ?? prevAnalysis?.output.summary ?? null,
      decisions: prevAnalysis?.output.decisions.map((d) => d.text) ?? [],
      openQuestions: prevAnalysis?.output.openQuestions.map((q) => q.text) ?? [],
    };
  }

  return {
    meeting: {
      title: meeting.title,
      date: meeting.startsAt.toISOString().slice(0, 10),
      type: meeting.type,
      participants: meeting.participants,
    },
    account: { name: account.name, industry: account.industry, region: account.region },
    opportunities: opportunities.map((o) => ({
      id: o._id.toHexString(),
      name: o.name,
      classification: {
        salesMotion: o.salesMotion,
        tigerRoute: o.tigerRoute,
        stage: o.stage,
        businessPriority: o.businessPriority,
        technicalComplexity: o.technicalComplexity,
      },
    })),
    focusOpportunityId: idString(meeting.opportunityId),
    profile,
    contacts: data.contactNames,
    openActionItems: openTasks.map((t) => t.title),
    configured: {
      salesMotions: enums.salesMotions,
      tigerRoutes: enums.tigerRoutes,
      stages: enums.opportunityStages,
      priorities: enums.priorities,
      complexities: enums.complexities,
      capabilities: enums.mongodbCapabilities,
      personas: enums.contactPersonas,
    },
    previousMeeting,
    transcript,
  };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

const CLASSIFICATION_ENUM: Record<ClassificationField, EnumerationKind> = {
  salesMotion: "salesMotions",
  tigerRoute: "tigerRoutes",
  stage: "opportunityStages",
  businessPriority: "priorities",
  technicalComplexity: "complexities",
};

function findItem(doc: { discovery?: Record<string, DiscoveryItemDoc[]>; techStack?: Record<string, DiscoveryItemDoc[]> }, id: string) {
  const values = doc.discovery ?? doc.techStack ?? {};
  for (const items of Object.values(values)) {
    const found = items.find((i) => i.id === id);
    if (found) return found;
  }
  return null;
}

/** Turns raw model output into reviewable suggestions with current values, conflicts and evidence ranges. */
export function buildSuggestions(output: MeetingAnalysisOutput, data: AnalysisData, raw: string): SuggestionDoc[] {
  const { meeting, account, opportunities, enums } = data;
  const oppById = new Map(opportunities.map((o) => [o._id.toHexString(), o]));
  const resolveOpp = (id: string | null): OpportunityDoc | null =>
    (id && oppById.get(id)) ||
    (meeting.opportunityId && oppById.get(meeting.opportunityId.toHexString())) ||
    (opportunities.length === 1 ? opportunities[0] : null);

  const base = (partial: Omit<SuggestionDoc, "id" | "status" | "editedValue" | "resolution" | "reviewedAt">): SuggestionDoc => ({
    id: randomUUID(),
    status: "pending",
    editedValue: null,
    resolution: null,
    reviewedAt: null,
    ...partial,
  });

  const suggestions: SuggestionDoc[] = [];

  for (const u of output.discoveryUpdates) {
    // Repair a wrong scope if the key exists in the other one.
    const scope: DiscoveryScope = getFieldDef(u.fieldKey, u.scope) ? u.scope : u.scope === "account" ? "opportunity" : "account";
    const def = getFieldDef(u.fieldKey, scope);
    if (!def || !u.value.trim()) continue;
    const opp = scope === "opportunity" ? resolveOpp(u.opportunityId) : null;
    const target = scope === "account" ? account : opp;
    const existing = target ? ((scope === "account" ? account.techStack : opp?.discovery)?.[def.key] ?? []) : [];
    const related = u.relatedItemId && target ? findItem(scope === "account" ? { techStack: account.techStack } : { discovery: opp!.discovery }, u.relatedItemId) : null;
    const relation: Relation = related ? u.relation : u.relation === "confirms" || u.relation === "resolves" ? "new" : u.relation;
    if (relation === "confirms" && related?.status === "confirmed" && related.text.trim() === u.value.trim()) continue;

    suggestions.push(
      base({
        type: "discovery",
        label: def.label,
        scope,
        fieldKey: def.key,
        opportunityId: opp?._id ?? null,
        value: u.value.trim(),
        details: {},
        kind: u.kind,
        confidence: u.confidence,
        relation,
        relatedItemId: related?.id ?? null,
        existingValue: related ? related.text : existing.length ? existing.map((i) => i.text).join("\n") : null,
        conflict: relation === "conflicts" || (def.kind !== "list" && existing.length > 0 && relation !== "confirms"),
        blocker: scope === "opportunity" && !opp ? "Choose the opportunity this belongs to" : null,
        evidence: evidenceOf(raw, u.evidence),
      }),
    );
  }

  for (const s of output.classificationSuggestions) {
    const opp = resolveOpp(s.opportunityId);
    const current = opp ? opp[s.field] : null;
    if (current && current === s.value) continue;
    const configured = enums[CLASSIFICATION_ENUM[s.field]].includes(s.value);
    suggestions.push(
      base({
        type: "classification",
        label: CLASSIFICATION_LABELS[s.field],
        scope: "opportunity",
        fieldKey: s.field,
        opportunityId: opp?._id ?? null,
        value: s.value,
        details: { rationale: s.rationale },
        kind: "recommendation",
        confidence: s.confidence,
        relation: current ? "updates" : "new",
        relatedItemId: null,
        existingValue: current,
        conflict: !!current,
        blocker: !opp ? "Choose the opportunity this belongs to" : !configured ? `"${s.value}" is not a configured value — edit it or reject` : null,
        evidence: evidenceOf(raw, s.evidence),
      }),
    );
  }

  for (const a of output.actionItems) {
    if (!a.title.trim()) continue;
    const opp = a.opportunityId ? oppById.get(a.opportunityId) ?? null : meeting.opportunityId ? oppById.get(meeting.opportunityId.toHexString()) ?? null : null;
    const due = a.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate) && !Number.isNaN(Date.parse(a.dueDate)) ? a.dueDate : null;
    suggestions.push(
      base({
        type: "action_item",
        label: "Action item",
        scope: opp ? "opportunity" : "account",
        fieldKey: null,
        opportunityId: opp?._id ?? null,
        value: a.title.trim(),
        details: { owner: a.owner, dueDate: due },
        kind: "fact",
        confidence: "high",
        relation: "new",
        relatedItemId: null,
        existingValue: null,
        conflict: false,
        blocker: null,
        evidence: evidenceOf(raw, a.evidence),
      }),
    );
  }

  for (const m of output.mongodbOpportunities) {
    const opp = resolveOpp(m.opportunityId);
    const already = opp?.solutionFit?.find((e) => e.capability.toLowerCase() === m.capability.toLowerCase());
    if (already) continue;
    const configured = enums.mongodbCapabilities.includes(m.capability);
    suggestions.push(
      base({
        type: "solution_fit",
        label: "Solution fit",
        scope: "opportunity",
        fieldKey: null,
        opportunityId: opp?._id ?? null,
        value: m.capability,
        details: { problem: m.problem, justification: m.justification },
        kind: "recommendation",
        confidence: m.confidence,
        relation: "new",
        relatedItemId: null,
        existingValue: null,
        conflict: false,
        blocker: !opp ? "Choose the opportunity this belongs to" : !configured ? `"${m.capability}" is not a configured capability — edit it or reject` : null,
        evidence: evidenceOf(raw, m.evidence),
      }),
    );
  }

  const known = new Set(data.contactNames.map((n) => n.toLowerCase()));
  for (const p of output.contacts) {
    if (!p.name.trim() || known.has(p.name.trim().toLowerCase())) continue;
    known.add(p.name.trim().toLowerCase());
    suggestions.push(
      base({
        type: "contact",
        label: "Contact",
        scope: "account",
        fieldKey: null,
        opportunityId: null,
        value: p.name.trim(),
        details: { title: p.title, persona: p.persona && enums.contactPersonas.includes(p.persona) ? p.persona : null },
        kind: "fact",
        confidence: "high",
        relation: "new",
        relatedItemId: null,
        existingValue: null,
        conflict: false,
        blocker: null,
        evidence: evidenceOf(raw, p.evidence),
      }),
    );
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export function mapAnalysis(doc: MeetingAnalysisDoc): MeetingAnalysis {
  return {
    id: doc._id.toHexString(),
    meetingId: doc.meetingId.toHexString(),
    accountId: doc.accountId.toHexString(),
    jobId: doc.jobId.toHexString(),
    provider: doc.provider,
    model: doc.model,
    promptVersion: doc.promptVersion,
    output: doc.output,
    suggestions: doc.suggestions.map((s) => ({ ...s, opportunityId: idString(s.opportunityId) })),
    createdAt: doc.createdAt,
  };
}

export async function getAnalysis(analysisId: string): Promise<MeetingAnalysis> {
  const { meetingAnalyses } = await collections();
  const doc = await meetingAnalyses.findOne({ _id: toObjectId(analysisId, "Analysis") });
  if (!doc) throw new NotFoundError("Analysis");
  return mapAnalysis(doc);
}

/**
 * Validates preconditions and queues an analysis. Returns a runner the route
 * executes after responding (`after()`), so the request does not wait on the model.
 */
export async function startMeetingAnalysis(meetingId: string, actor: SessionUser): Promise<{ jobId: string; run: () => Promise<void> }> {
  const status = await getAiStatus();
  if (!status.ready) throw new ValidationError(status.reason ?? "AI processing is not configured");
  const _id = toObjectId(meetingId, "Meeting");
  const c = await collections();
  const meeting = await c.meetings.findOne({ _id }, { projection: { transcript: 1, accountId: 1, analysisStatus: 1 } });
  if (!meeting) throw new NotFoundError("Meeting");
  if (!meeting.transcript?.raw) throw new ValidationError("Add a transcript before running the analysis");

  // Atomic claim: only one analysis per meeting at a time.
  const claimed = await c.meetings.updateOne(
    { _id, analysisStatus: { $ne: "analyzing" } },
    { $set: { analysisStatus: "analyzing", analysisError: null, updatedAt: new Date() } },
  );
  if (!claimed.modifiedCount) throw new ValidationError("An analysis is already running for this meeting");

  const jobId = new ObjectId();
  await c.aiJobs.insertOne({
    _id: jobId,
    kind: "meeting_analysis",
    meetingId: _id,
    accountId: meeting.accountId,
    status: "queued",
    attempts: 0,
    provider: status.provider,
    model: status.effectiveModel!,
    promptVersion: MEETING_ANALYSIS_PROMPT_VERSION,
    usage: null,
    costUsd: null,
    durationMs: null,
    error: null,
    createdBy: toObjectId(actor.id, "User"),
    createdAt: new Date(),
    startedAt: null,
    finishedAt: null,
  });
  return { jobId: jobId.toHexString(), run: () => runMeetingAnalysis(jobId.toHexString()) };
}

function friendlyError(error: unknown): string {
  if (error instanceof AiOutputError) return error.message;
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403) return "The AI provider rejected the API key. Check the server configuration.";
  if (status === 429) return "The AI provider is rate limiting requests. Try again in a minute.";
  if (status && status >= 500) return "The AI provider is temporarily unavailable. Try again later.";
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300) || "The analysis failed";
}

export async function runMeetingAnalysis(jobId: string): Promise<void> {
  const c = await collections();
  const _id = toObjectId(jobId, "Job");
  const job = await c.aiJobs.findOneAndUpdate(
    { _id, status: "queued" },
    { $set: { status: "running", startedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!job) return;
  const started = Date.now();

  try {
    const meeting = await c.meetings.findOne({ _id: job.meetingId });
    if (!meeting?.transcript?.raw) throw new Error("The meeting or its transcript no longer exists");
    const settings = await getAiStatus();
    const data = await loadAnalysisData(meeting);
    const transcriptForAi = settings.redactContactDetails ? redactContactDetails(meeting.transcript.raw) : meeting.transcript.raw;
    const prompt = buildMeetingAnalysisPrompt(await buildContext(data, transcriptForAi));
    const provider = await getProvider(job.provider);

    let result: StructuredResult<MeetingAnalysisOutput> | null = null;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !result; attempt++) {
      await c.aiJobs.updateOne({ _id }, { $set: { attempts: attempt } });
      try {
        result = await provider.generateStructured({
          model: job.model,
          system: MEETING_ANALYSIS_SYSTEM,
          prompt,
          schema: meetingAnalysisOutputSchema,
          schemaName: "meeting_analysis",
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        });
        // Defence in depth: the provider parsed it, but validate against our schema too.
        result.output = meetingAnalysisOutputSchema.parse(result.output);
      } catch (error) {
        lastError = error;
        result = null;
        if (!(error instanceof AiOutputError && error.retryable)) break;
      }
    }
    if (!result) throw lastError ?? new Error("The analysis failed");

    const analysisId = new ObjectId();
    const suggestions = buildSuggestions(result.output, data, meeting.transcript.raw);
    await c.meetingAnalyses.insertOne({
      _id: analysisId,
      meetingId: meeting._id,
      accountId: meeting.accountId,
      jobId: _id,
      provider: job.provider,
      model: result.model || job.model,
      promptVersion: job.promptVersion,
      output: result.output,
      suggestions,
      createdAt: new Date(),
    });
    await c.meetings.updateOne(
      { _id: meeting._id },
      {
        $set: {
          analysisStatus: "analyzed",
          analysisError: null,
          latestAnalysisId: analysisId,
          // Keep a summary the SA has written or edited.
          summary: meeting.summary ?? result.output.summary,
          updatedAt: new Date(),
        },
      },
    );
    await c.aiJobs.updateOne(
      { _id },
      {
        $set: {
          status: "succeeded",
          usage: result.usage,
          costUsd: estimateCostUsd(result.model || job.model, result.usage),
          durationMs: Date.now() - started,
          finishedAt: new Date(),
        },
      },
    );
  } catch (error) {
    const message = friendlyError(error);
    console.error("[ai] meeting analysis failed", { jobId, error });
    await c.aiJobs.updateOne({ _id }, { $set: { status: "failed", error: message, durationMs: Date.now() - started, finishedAt: new Date() } });
    await c.meetings.updateOne({ _id: job.meetingId }, { $set: { analysisStatus: "failed", analysisError: message, updatedAt: new Date() } });
  }
}

export interface AiUsageSummary {
  analyses: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

/** Token and cost totals across succeeded jobs (Settings page). */
export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  const { aiJobs } = await collections();
  const [row] = await aiJobs
    .aggregate<{ analyses: number; inputTokens: number; outputTokens: number; costUsd: number; costKnown: number }>([
      { $match: { status: "succeeded" } },
      {
        $group: {
          _id: null,
          analyses: { $sum: 1 },
          inputTokens: { $sum: { $ifNull: ["$usage.inputTokens", 0] } },
          outputTokens: { $sum: { $ifNull: ["$usage.outputTokens", 0] } },
          costUsd: { $sum: { $ifNull: ["$costUsd", 0] } },
          costKnown: { $sum: { $cond: [{ $ne: ["$costUsd", null] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  if (!row) return { analyses: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  return { analyses: row.analyses, inputTokens: row.inputTokens, outputTokens: row.outputTokens, costUsd: row.costKnown ? row.costUsd : null };
}

export async function getLatestJob(meetingId: string) {
  const { aiJobs } = await collections();
  const job = await aiJobs.findOne({ meetingId: toObjectId(meetingId, "Meeting") }, { sort: { createdAt: -1 } });
  if (!job) return null;
  return {
    id: job._id.toHexString(),
    status: job.status,
    provider: job.provider,
    model: job.model,
    promptVersion: job.promptVersion,
    attempts: job.attempts,
    usage: job.usage,
    costUsd: job.costUsd,
    durationMs: job.durationMs,
    error: job.error,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  };
}
