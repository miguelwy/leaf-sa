import "server-only";
import type { ObjectId } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import { DISCOVERY_FIELD_MAP } from "@/domain/discovery";
import { bulkDecisionSchema, suggestionDecisionSchema, type ClassificationField, type MeetingAnalysis, type SuggestionDecision } from "@/domain/meetings";
import { collections } from "@/server/db/collections";
import { toObjectId } from "@/server/db/ids";
import type { ItemSourceDoc, MeetingAnalysisDoc, SuggestionDoc } from "@/server/db/types";
import { ConflictError, NotFoundError, ValidationError } from "@/server/http/errors";
import { addFeature, addKeyNote, escapeRegex } from "./accounts";
import { createActionItem } from "./action-items";
import { createContact, updateContact } from "./contacts";
import { mapAnalysis } from "./meeting-analysis";
import { updateOpportunity } from "./opportunities";

const AI = { actorKind: "ai-approved" as const };

interface ApplyContext {
  analysis: MeetingAnalysisDoc;
  suggestion: SuggestionDoc;
  value: string;
  opportunityId: ObjectId | null;
  actor: SessionUser;
}

type Resolution = SuggestionDoc["resolution"];

/** Promotes an existing contact (same name) to champion, or creates one. */
async function applyChampion({ analysis, suggestion: s, value, actor }: ApplyContext): Promise<Resolution> {
  const { contacts } = await collections();
  const existing = await contacts.findOne({ accountId: analysis.accountId, name: { $regex: `^${escapeRegex(value)}$`, $options: "i" } });
  const role = s.details.role ?? null;
  if (existing) {
    await updateContact(
      existing._id.toHexString(),
      {
        isChampion: true,
        title: existing.title ?? s.details.title ?? null,
        notes: existing.notes ? (role && !existing.notes.includes(role) ? `${existing.notes}\n${role}` : existing.notes) : role,
      },
      actor,
      AI,
    );
    return "confirmed";
  }
  await createContact(analysis.accountId.toHexString(), { name: value, title: s.details.title ?? null, notes: role, isChampion: true }, actor, AI);
  return "added";
}

async function apply(ctx: ApplyContext): Promise<Resolution> {
  const { suggestion: s, analysis, value, opportunityId, actor } = ctx;
  const accountId = analysis.accountId.toHexString();
  const excerpt = s.evidence.excerpt || null;
  const source: ItemSourceDoc = { kind: "meeting", meetingId: analysis.meetingId, excerpt };

  switch (s.type) {
    case "action_item":
      await createActionItem(
        {
          title: value,
          accountId,
          opportunityId: opportunityId?.toHexString() ?? null,
          owner: s.details.owner ?? null,
          dueDate: s.details.dueDate ?? null,
          description: excerpt ? `From meeting: “${excerpt}”` : null,
        },
        actor,
        { ...AI, origin: { meetingId: analysis.meetingId, excerpt } },
      );
      return "added";
    case "champion":
    case "contact":
      return applyChampion(ctx);
    case "feature":
      await addFeature(accountId, { capability: value, why: s.details.why ?? null, status: "Identified" }, actor, { ...AI, source });
      return "added";
    case "solution_fit":
      await addFeature(
        accountId,
        { capability: value, why: [s.details.problem, s.details.justification].filter(Boolean).join(" — ") || null, status: "Identified" },
        actor,
        { ...AI, source },
      );
      return "added";
    case "discovery": {
      // Analyses made before the simplification: the fact becomes a key note.
      const label = (s.fieldKey && DISCOVERY_FIELD_MAP.get(s.fieldKey)?.label) || s.label;
      await addKeyNote(accountId, { text: `${label}: ${value}` }, actor, { ...AI, source });
      return "added";
    }
    case "classification": {
      const oppId = opportunityId?.toHexString();
      if (!oppId) throw new ValidationError("Choose the opportunity this belongs to");
      await updateOpportunity(oppId, { [s.fieldKey as ClassificationField]: value }, actor, AI);
      return s.existingValue ? "replaced" : "added";
    }
  }
}

async function loadAnalysis(analysisId: string): Promise<MeetingAnalysisDoc> {
  const { meetingAnalyses } = await collections();
  const doc = await meetingAnalyses.findOne({ _id: toObjectId(analysisId, "Analysis") });
  if (!doc) throw new NotFoundError("Analysis");
  return doc;
}

async function setSuggestion(analysisId: ObjectId, suggestionId: string, expected: SuggestionDoc["status"], set: Partial<SuggestionDoc>) {
  const { meetingAnalyses } = await collections();
  const fields = Object.fromEntries(Object.entries(set).map(([k, v]) => [`suggestions.$[s].${k}`, v]));
  const res = await meetingAnalyses.updateOne({ _id: analysisId }, { $set: fields }, { arrayFilters: [{ "s.id": suggestionId, "s.status": expected }] });
  return res.modifiedCount > 0;
}

async function decide(analysis: MeetingAnalysisDoc, suggestionId: string, decision: SuggestionDecision, actor: SessionUser, bulk: boolean) {
  const s = analysis.suggestions.find((x) => x.id === suggestionId);
  if (!s) throw new NotFoundError("Suggestion");

  if (decision.action === "reject") {
    if (s.status !== "pending") throw new ConflictError("This suggestion was already reviewed");
    await setSuggestion(analysis._id, s.id, "pending", { status: "rejected", reviewedAt: new Date() });
    return;
  }
  if (decision.action === "reset") {
    if (s.status !== "rejected") throw new ValidationError("Only rejected suggestions can be reopened");
    await setSuggestion(analysis._id, s.id, "rejected", { status: "pending", reviewedAt: null });
    return;
  }

  if (s.status !== "pending") throw new ConflictError("This suggestion was already reviewed");
  const value = (decision.value ?? s.value).trim();
  const edited = decision.value !== undefined && value !== s.value;
  let opportunityId = s.opportunityId;
  if (decision.opportunityId) {
    const { opportunities } = await collections();
    const opp = await opportunities.findOne(
      { _id: toObjectId(decision.opportunityId, "Opportunity"), accountId: analysis.accountId },
      { projection: { _id: 1 } },
    );
    if (!opp) throw new ValidationError("Opportunity does not belong to this account");
    opportunityId = opp._id;
  }
  if (bulk && (s.conflict || s.blocker)) throw new ValidationError("Needs individual review");
  if (s.blocker && !edited && !decision.opportunityId) throw new ValidationError(s.blocker);

  // Claim first so a double click cannot apply the same suggestion twice.
  if (!(await setSuggestion(analysis._id, s.id, "pending", { status: "approved", reviewedAt: new Date() }))) {
    throw new ConflictError("This suggestion was already reviewed");
  }
  try {
    const resolution = await apply({ analysis, suggestion: s, value, opportunityId, actor });
    await setSuggestion(analysis._id, s.id, "approved", { resolution, editedValue: edited ? value : null, opportunityId });
  } catch (error) {
    await setSuggestion(analysis._id, s.id, "approved", { status: "pending", reviewedAt: null });
    throw error;
  }
}

export async function decideSuggestion(analysisId: string, suggestionId: string, raw: SuggestionDecision, actor: SessionUser): Promise<MeetingAnalysis> {
  const decision = suggestionDecisionSchema.parse(raw);
  await decide(await loadAnalysis(analysisId), suggestionId, decision, actor, false);
  return mapAnalysis(await loadAnalysis(analysisId));
}

/** Bulk approval applies only clean suggestions; conflicts and blocked items stay pending. */
export async function bulkDecide(
  analysisId: string,
  raw: { action: "approve" | "reject"; suggestionIds: string[] },
  actor: SessionUser,
): Promise<{ analysis: MeetingAnalysis; applied: number; skipped: number; errors: string[] }> {
  const input = bulkDecisionSchema.parse(raw);
  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const id of input.suggestionIds) {
    const analysis = await loadAnalysis(analysisId);
    const s = analysis.suggestions.find((x) => x.id === id);
    if (!s || s.status !== "pending" || (input.action === "approve" && (s.conflict || s.blocker))) {
      skipped++;
      continue;
    }
    try {
      await decide(analysis, id, { action: input.action }, actor, true);
      applied++;
    } catch (error) {
      skipped++;
      errors.push(`${s.label}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  return { analysis: mapAnalysis(await loadAnalysis(analysisId)), applied, skipped, errors };
}
