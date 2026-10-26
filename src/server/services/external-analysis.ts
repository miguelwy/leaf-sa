import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { SessionUser } from "@/domain/auth";
import { importAnalysisSchema, meetingAnalysisOutputSchema, type ImportAnalysisInput, type MeetingAnalysisOutput } from "@/domain/meetings";
import { buildExternalAnalysisPrompt, MEETING_ANALYSIS_PROMPT_VERSION } from "@/server/ai/prompts/meeting-analysis";
import { redactContactDetails } from "@/server/ai/redact";
import { getAiSettings } from "@/server/ai/settings";
import { collections } from "@/server/db/collections";
import { toObjectId } from "@/server/db/ids";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import { buildContext, buildSuggestions, loadAnalysisData } from "./meeting-analysis";
import { recordChange } from "./history";

/**
 * Builds the prompt to paste into an external assistant (Glean or similar), with the
 * account context and, optionally, the transcript. Nothing is sent anywhere by the app.
 */
export async function getExternalAnalysisPrompt(meetingId: string, includeTranscript: boolean): Promise<{ prompt: string; chars: number }> {
  const { meetings } = await collections();
  const meeting = await meetings.findOne({ _id: toObjectId(meetingId, "Meeting") });
  if (!meeting) throw new NotFoundError("Meeting");
  if (includeTranscript && !meeting.transcript?.raw) throw new ValidationError("This meeting has no transcript to include");

  const settings = await getAiSettings();
  const raw = meeting.transcript?.raw ?? "";
  const transcript = settings.redactContactDetails ? redactContactDetails(raw) : raw;
  const data = await loadAnalysisData(meeting);
  const context = await buildContext(data, transcript);
  const prompt = buildExternalAnalysisPrompt(context, z.toJSONSchema(meetingAnalysisOutputSchema, { target: "draft-7" }), includeTranscript);
  return { prompt, chars: prompt.length };
}

/** Pulls the JSON object out of a chat answer that may include fences or prose. */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new ValidationError("No JSON object found in the pasted result");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    throw new ValidationError(`The pasted result is not valid JSON: ${error instanceof Error ? error.message : "parse error"}`);
  }
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const LIST_KEYS = [
  "businessInsights",
  "technicalInsights",
  "decisions",
  "actionItems",
  "openQuestions",
  "missingInformation",
  "discoveryUpdates",
  "classificationSuggestions",
  "mongodbOpportunities",
  "contacts",
  "changesSinceLastMeeting",
] as const;
const NULLABLE_KEYS = ["owner", "dueDate", "opportunityId", "relatedItemId", "title", "persona", "speaker"];
const LOWERCASE_ENUM_KEYS = ["kind", "confidence", "relation", "scope"];

/**
 * Tolerates the usual gaps of chat assistants (missing lists, missing nullable keys,
 * capitalised enum values, evidence given as a plain string) before strict validation.
 */
export function normalizeImportedOutput(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  const out: Json = { ...raw };
  for (const key of LIST_KEYS) if (out[key] === undefined || out[key] === null) out[key] = [];

  const fixItem = (item: unknown): unknown => {
    if (typeof item === "string") return item;
    if (!isObj(item)) return item;
    const fixed: Json = { ...item };
    for (const k of NULLABLE_KEYS) if (fixed[k] === undefined || fixed[k] === "") fixed[k] = null;
    for (const k of LOWERCASE_ENUM_KEYS) if (typeof fixed[k] === "string") fixed[k] = (fixed[k] as string).toLowerCase();
    if (typeof fixed.evidence === "string") fixed.evidence = { excerpt: fixed.evidence, speaker: null };
    if (isObj(fixed.evidence) && fixed.evidence.speaker === undefined) fixed.evidence = { ...fixed.evidence, speaker: null };
    return fixed;
  };
  for (const key of LIST_KEYS) {
    if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).map(fixItem);
  }
  // Open questions and changes allow evidence to be null; make missing evidence explicit.
  for (const key of ["openQuestions", "changesSinceLastMeeting"] as const) {
    out[key] = (out[key] as unknown[]).map((i) => (isObj(i) && i.evidence === undefined ? { ...i, evidence: null } : i));
  }
  return out;
}

/**
 * Imports an analysis produced outside the app. It goes through the same schema
 * validation and suggestion building as a provider analysis, then into review.
 */
export async function importMeetingAnalysis(meetingId: string, raw: ImportAnalysisInput, actor: SessionUser) {
  const input = importAnalysisSchema.parse(raw);
  const _id = toObjectId(meetingId, "Meeting");
  const c = await collections();
  const meeting = await c.meetings.findOne({ _id });
  if (!meeting) throw new NotFoundError("Meeting");
  if (meeting.analysisStatus === "analyzing") throw new ValidationError("Wait for the running analysis to finish");

  const parsed = meetingAnalysisOutputSchema.safeParse(normalizeImportedOutput(extractJsonObject(input.result)));
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new ValidationError("The result does not match the expected format", { formErrors: issues, fieldErrors: {} });
  }
  const output: MeetingAnalysisOutput = parsed.data;

  const data = await loadAnalysisData(meeting);
  const suggestions = buildSuggestions(output, data, meeting.transcript?.raw ?? "");
  const now = new Date();
  const jobId = new ObjectId();
  const analysisId = new ObjectId();
  const label = input.sourceLabel || "External import";

  await c.aiJobs.insertOne({
    _id: jobId,
    kind: "meeting_analysis",
    meetingId: _id,
    accountId: meeting.accountId,
    status: "succeeded",
    attempts: 1,
    provider: "import",
    model: label,
    promptVersion: MEETING_ANALYSIS_PROMPT_VERSION,
    usage: null,
    costUsd: null,
    durationMs: null,
    error: null,
    createdBy: toObjectId(actor.id, "User"),
    createdAt: now,
    startedAt: now,
    finishedAt: now,
  });
  await c.meetingAnalyses.insertOne({
    _id: analysisId,
    meetingId: _id,
    accountId: meeting.accountId,
    jobId,
    provider: "import",
    model: label,
    promptVersion: MEETING_ANALYSIS_PROMPT_VERSION,
    output,
    suggestions,
    createdAt: now,
  });
  await c.meetings.updateOne(
    { _id },
    {
      $set: {
        analysisStatus: "analyzed",
        analysisError: null,
        latestAnalysisId: analysisId,
        summary: meeting.summary ?? output.summary,
        updatedAt: now,
      },
    },
  );
  await recordChange({
    accountId: meeting.accountId,
    entityType: "meeting",
    entityId: _id,
    entityLabel: meeting.title,
    action: "update",
    changes: [{ field: "analysis", from: null, to: `Imported from ${label} · ${suggestions.length} suggestions` }],
    actor,
  });
  return { analysisId: analysisId.toHexString(), suggestions: suggestions.length };
}
