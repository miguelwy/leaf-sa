import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import type { Enumerations } from "@/domain/enumerations";
import {
  meetingAnalysisOutputSchema,
  type AiProviderName,
  type MeetingAnalysis,
  type MeetingAnalysisOutput,
  type StoredAnalysisOutput,
  type SuggestionEvidence,
} from "@/domain/meetings";
import { getAiStatus } from "@/server/ai/settings";
import { estimateCostUsd } from "@/server/ai/pricing";
import { AiOutputError, getProvider, type StructuredResult } from "@/server/ai/provider";
import { buildMeetingAnalysisPrompt, MEETING_ANALYSIS_PROMPT_VERSION, MEETING_ANALYSIS_SYSTEM, type MeetingContextInput } from "@/server/ai/prompts/meeting-analysis";
import { redactContactDetails } from "@/server/ai/redact";
import { collections } from "@/server/db/collections";
import { idString, toObjectId } from "@/server/db/ids";
import type { AccountDoc, MeetingAnalysisDoc, MeetingDoc, OpportunityDoc, SuggestionDoc } from "@/server/db/types";
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

export interface AnalysisData {
  meeting: MeetingDoc;
  account: AccountDoc;
  opportunities: OpportunityDoc[];
  contactNames: string[];
  championNames: string[];
  enums: Enumerations;
}

export async function loadAnalysisData(meeting: MeetingDoc): Promise<AnalysisData> {
  const c = await collections();
  const [account, opportunities, contacts, enums] = await Promise.all([
    c.accounts.findOne({ _id: meeting.accountId }),
    c.opportunities.find({ accountId: meeting.accountId }, { projection: { name: 1 } }).toArray(),
    c.contacts.find({ accountId: meeting.accountId }, { projection: { name: 1, isChampion: 1 } }).toArray(),
    getEnumerations(),
  ]);
  if (!account) throw new NotFoundError("Account");
  return {
    meeting,
    account,
    opportunities: opportunities as OpportunityDoc[],
    contactNames: contacts.map((x) => x.name),
    championNames: contacts.filter((x) => x.isChampion).map((x) => x.name),
    enums,
  };
}

export async function buildContext(data: AnalysisData, transcript: string): Promise<MeetingContextInput> {
  const c = await collections();
  const { meeting, account, enums } = data;
  const openTasks = await c.actionItems
    .find({ accountId: account._id, status: { $ne: "done" } }, { projection: { title: 1 } })
    .limit(50)
    .toArray();
  return {
    meeting: { title: meeting.title, date: meeting.startsAt.toISOString().slice(0, 10), type: meeting.type, participants: meeting.participants },
    account: { name: account.name, industry: account.industry },
    opportunities: data.opportunities.map((o) => o.name),
    knownContacts: data.contactNames.map((n) => (data.championNames.includes(n) ? `${n} (champion)` : n)),
    currentFeatures: (account.features ?? []).map((f) => f.capability),
    openActionItems: openTasks.map((t) => t.title),
    configuredCapabilities: enums.mongodbCapabilities,
    transcript,
  };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/** Turns model output into reviewable suggestions, skipping what the account already has. */
export function buildSuggestions(output: MeetingAnalysisOutput, data: AnalysisData, raw: string): SuggestionDoc[] {
  const { meeting, account, enums } = data;
  type Defaulted = "id" | "status" | "editedValue" | "resolution" | "reviewedAt" | "relation" | "relatedItemId" | "kind" | "conflict" | "scope" | "fieldKey";
  const base = (partial: Omit<SuggestionDoc, Defaulted> & Partial<Pick<SuggestionDoc, Defaulted>>): SuggestionDoc => ({
    id: randomUUID(),
    status: "pending",
    editedValue: null,
    resolution: null,
    reviewedAt: null,
    relation: "new",
    relatedItemId: null,
    kind: "fact",
    conflict: false,
    scope: "account",
    fieldKey: null,
    ...partial,
  });

  const suggestions: SuggestionDoc[] = [];
  const openTitles = new Set<string>();

  for (const a of output.actionItems) {
    const title = a.title.trim();
    if (!title || openTitles.has(title.toLowerCase())) continue;
    openTitles.add(title.toLowerCase());
    const due = a.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate) && !Number.isNaN(Date.parse(a.dueDate)) ? a.dueDate : null;
    suggestions.push(
      base({
        type: "action_item",
        label: "Action item",
        opportunityId: meeting.opportunityId,
        value: title,
        details: { owner: a.owner, dueDate: due },
        confidence: "high",
        existingValue: null,
        blocker: null,
        evidence: evidenceOf(raw, a.evidence),
      }),
    );
  }

  const known = new Map(data.contactNames.map((n) => [n.trim().toLowerCase(), n]));
  const champions = new Set(data.championNames.map((n) => n.trim().toLowerCase()));
  const seenPeople = new Set<string>();
  for (const p of output.champions) {
    const name = p.name.trim();
    const key = name.toLowerCase();
    if (!name || champions.has(key) || seenPeople.has(key)) continue;
    seenPeople.add(key);
    suggestions.push(
      base({
        type: "champion",
        label: "Technical champion",
        opportunityId: null,
        value: name,
        details: { title: p.title, role: p.role },
        confidence: "high",
        // An existing contact is promoted to champion instead of being duplicated.
        existingValue: known.has(key) ? `${known.get(key)} (existing contact)` : null,
        blocker: null,
        evidence: evidenceOf(raw, p.evidence),
      }),
    );
  }

  const current = new Set((account.features ?? []).map((f) => f.capability.toLowerCase()));
  const seenFeatures = new Set<string>();
  for (const f of output.features) {
    const configured = enums.mongodbCapabilities.find((c) => c.toLowerCase() === f.capability.trim().toLowerCase());
    const capability = configured ?? f.capability.trim();
    const key = capability.toLowerCase();
    if (!capability || current.has(key) || seenFeatures.has(key)) continue;
    seenFeatures.add(key);
    suggestions.push(
      base({
        type: "feature",
        label: "MongoDB feature",
        opportunityId: null,
        value: capability,
        details: { why: f.why },
        kind: "recommendation",
        confidence: "medium",
        existingValue: null,
        blocker: configured ? null : `"${capability}" is not a configured capability — edit it or reject`,
        evidence: evidenceOf(raw, f.evidence),
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
    output: doc.output as StoredAnalysisOutput,
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
    const provider = await getProvider(job.provider as AiProviderName);

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
