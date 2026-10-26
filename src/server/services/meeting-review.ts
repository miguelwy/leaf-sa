import "server-only";
import { randomUUID } from "node:crypto";
import type { ObjectId } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import { getFieldDef, MAX_ITEMS_PER_FIELD } from "@/domain/discovery";
import {
  bulkDecisionSchema,
  suggestionDecisionSchema,
  type ClassificationField,
  type MeetingAnalysis,
  type SuggestionDecision,
} from "@/domain/meetings";
import { collections } from "@/server/db/collections";
import { toObjectId } from "@/server/db/ids";
import type { DiscoveryItemDoc, MeetingAnalysisDoc, SuggestionDoc } from "@/server/db/types";
import { ConflictError, NotFoundError, ValidationError } from "@/server/http/errors";
import { touchAccount } from "./accounts";
import { createActionItem } from "./action-items";
import { createContact } from "./contacts";
import { summarizeItems } from "./discovery";
import { diffObjects, recordChange } from "./history";
import { mapAnalysis } from "./meeting-analysis";
import { addSolutionFit, updateOpportunity } from "./opportunities";

const AI = { actorKind: "ai-approved" as const };

interface ApplyContext {
  analysis: MeetingAnalysisDoc;
  suggestion: SuggestionDoc;
  value: string;
  opportunityId: ObjectId | null;
  resolution: "replace" | "add" | undefined;
  actor: SessionUser;
}

type Resolution = SuggestionDoc["resolution"];

// ---------------------------------------------------------------------------
// Discovery items
// ---------------------------------------------------------------------------

async function applyDiscovery(ctx: ApplyContext): Promise<Resolution> {
  const { suggestion: s, analysis, value, actor } = ctx;
  const def = s.fieldKey ? getFieldDef(s.fieldKey, s.scope) : null;
  if (!def) throw new ValidationError("Unknown discovery field");
  const c = await collections();
  const isAccount = s.scope === "account";
  const target = isAccount
    ? await c.accounts.findOne({ _id: analysis.accountId })
    : ctx.opportunityId
      ? await c.opportunities.findOne({ _id: ctx.opportunityId, accountId: analysis.accountId })
      : null;
  if (!target) throw new ValidationError(isAccount ? "Account not found" : "Choose the opportunity this belongs to");

  const values: Record<string, DiscoveryItemDoc[]> = structuredClone(("techStack" in target ? target.techStack : target.discovery) ?? {});
  const before: Record<string, string[]> = {};
  const touch = (key: string) => {
    if (!(key in before)) before[key] = summarizeItems(values[key]);
    values[key] ??= [];
    return values[key];
  };

  const now = new Date();
  const source = { kind: "meeting" as const, meetingId: analysis.meetingId, excerpt: s.evidence.excerpt || null };
  const status = s.kind === "fact" && s.confidence !== "low" ? ("confirmed" as const) : ("tentative" as const);
  const newItem = (): DiscoveryItemDoc => ({ id: randomUUID(), text: value, status, source, createdAt: now, updatedAt: now });

  // Locate the related item wherever it lives in this document.
  let relatedKey: string | null = null;
  if (s.relatedItemId) {
    for (const [key, items] of Object.entries(values)) {
      if (items.some((i) => i.id === s.relatedItemId)) relatedKey = key;
    }
  }

  let resolution: Resolution;
  if (s.relation === "confirms" && relatedKey) {
    const items = touch(relatedKey);
    const item = items.find((i) => i.id === s.relatedItemId)!;
    item.status = "confirmed";
    item.updatedAt = now;
    resolution = "confirmed";
  } else if (s.relation === "resolves" && relatedKey) {
    // The open question is answered: remove it and record the answer.
    values[relatedKey] = touch(relatedKey).filter((i) => i.id !== s.relatedItemId);
    touch(def.key).push(newItem());
    resolution = "added";
  } else if (def.kind !== "list") {
    const hadValue = touch(def.key).length > 0;
    values[def.key] = [newItem()];
    resolution = hadValue ? "replaced" : "added";
  } else if (relatedKey && (s.relation === "updates" || s.relation === "conflicts") && ctx.resolution === "replace") {
    const items = touch(relatedKey);
    const idx = items.findIndex((i) => i.id === s.relatedItemId);
    items[idx] = { ...items[idx], text: value, status, source, updatedAt: now };
    resolution = "replaced";
  } else {
    touch(def.key).push(newItem());
    resolution = "added";
  }

  for (const key of Object.keys(before)) {
    if ((values[key]?.length ?? 0) > MAX_ITEMS_PER_FIELD) {
      throw new ValidationError(`"${getFieldDef(key, s.scope)?.label ?? key}" already holds the maximum of ${MAX_ITEMS_PER_FIELD} items`);
    }
  }

  const prefix = isAccount ? "techStack" : "discovery";
  const set: Record<string, unknown> = { updatedAt: now };
  for (const key of Object.keys(before)) set[`${prefix}.${key}`] = values[key];
  if (isAccount) await c.accounts.updateOne({ _id: target._id }, { $set: set });
  else await c.opportunities.updateOne({ _id: target._id }, { $set: set });

  const paths = Object.keys(before).map((k) => `${prefix}.${k}`);
  await recordChange({
    accountId: analysis.accountId,
    entityType: isAccount ? "account" : "opportunity",
    entityId: target._id,
    entityLabel: target.name,
    action: "update",
    changes: diffObjects(
      Object.fromEntries(Object.entries(before).map(([k, v]) => [`${prefix}.${k}`, v])),
      Object.fromEntries(Object.keys(before).map((k) => [`${prefix}.${k}`, summarizeItems(values[k])])),
      paths,
    ),
    actor,
    ...AI,
  });
  if (!isAccount) await touchAccount(analysis.accountId);
  return resolution;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

async function apply(ctx: ApplyContext): Promise<Resolution> {
  const { suggestion: s, analysis, value, opportunityId, actor } = ctx;
  const oppId = opportunityId?.toHexString() ?? null;
  const excerpt = s.evidence.excerpt || null;
  switch (s.type) {
    case "discovery":
      return applyDiscovery(ctx);
    case "classification":
      if (!oppId) throw new ValidationError("Choose the opportunity this belongs to");
      await updateOpportunity(oppId, { [s.fieldKey as ClassificationField]: value }, actor, AI);
      return s.existingValue ? "replaced" : "added";
    case "action_item":
      await createActionItem(
        {
          title: value,
          accountId: analysis.accountId.toHexString(),
          opportunityId: oppId,
          owner: s.details.owner ?? null,
          dueDate: s.details.dueDate ?? null,
          description: excerpt ? `From meeting: “${excerpt}”` : null,
        },
        actor,
        { ...AI, origin: { meetingId: analysis.meetingId, excerpt } },
      );
      return "added";
    case "solution_fit":
      if (!oppId) throw new ValidationError("Choose the opportunity this belongs to");
      await addSolutionFit(
        oppId,
        { capability: value, problem: s.details.problem ?? "", justification: s.details.justification ?? null, status: "Identified" },
        actor,
        AI,
      );
      return "added";
    case "contact":
      await createContact(analysis.accountId.toHexString(), { name: value, title: s.details.title ?? null, persona: s.details.persona ?? null }, actor, AI);
      return "added";
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
  const res = await meetingAnalyses.updateOne(
    { _id: analysisId },
    { $set: fields },
    { arrayFilters: [{ "s.id": suggestionId, "s.status": expected }] },
  );
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
    const opp = await opportunities.findOne({ _id: toObjectId(decision.opportunityId, "Opportunity"), accountId: analysis.accountId }, { projection: { _id: 1 } });
    if (!opp) throw new ValidationError("Opportunity does not belong to this account");
    opportunityId = opp._id;
  }
  if (bulk && (s.conflict || s.blocker)) throw new ValidationError("Needs individual review");
  // Blockers about attribution/configuration are re-checked by the apply step; an edit or an opportunity choice may resolve them.
  if (s.blocker && !edited && !decision.opportunityId) throw new ValidationError(s.blocker);
  if (s.conflict && s.type === "discovery" && s.relatedItemId && !decision.resolution) {
    throw new ValidationError("This conflicts with an existing value: choose to replace it or keep both");
  }

  // Claim first so a double click cannot apply the same suggestion twice.
  if (!(await setSuggestion(analysis._id, s.id, "pending", { status: "approved", reviewedAt: new Date() }))) {
    throw new ConflictError("This suggestion was already reviewed");
  }
  try {
    const resolution = await apply({ analysis, suggestion: s, value, opportunityId, resolution: decision.resolution, actor });
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

/**
 * Bulk approval applies only clean suggestions: conflicts and items with blockers
 * are skipped and stay pending for individual review.
 */
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
    if (!s || s.status !== "pending") {
      skipped++;
      continue;
    }
    if (input.action === "approve" && (s.conflict || s.blocker)) {
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
