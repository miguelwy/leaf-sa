import "server-only";
import { ObjectId, type Filter } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import {
  meetingCreateSchema,
  meetingPatchSchema,
  type Meeting,
  type MeetingCreateInput,
  type MeetingListItem,
  type MeetingPatchInput,
} from "@/domain/meetings";
import { collections } from "@/server/db/collections";
import { idString, toObjectId, toObjectIdOrNull } from "@/server/db/ids";
import type { MeetingDoc } from "@/server/db/types";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import type { IngestedTranscript } from "@/server/ingestion";
import { touchAccount } from "./accounts";
import { diffObjects, recordChange } from "./history";
import { assertEnumValue, getEnumerations } from "./settings";

/** An analysis still "running" after this long is considered lost (e.g. server restart). */
export const STALE_ANALYSIS_MS = 20 * 60 * 1000;
const AUDITED_FIELDS = ["title", "startsAt", "type", "participants", "opportunityId", "summary"] as const;

export function mapMeeting(doc: MeetingDoc): Meeting {
  return {
    id: doc._id.toHexString(),
    accountId: doc.accountId.toHexString(),
    opportunityId: idString(doc.opportunityId),
    title: doc.title,
    startsAt: doc.startsAt,
    type: doc.type,
    participants: doc.participants,
    transcript: doc.transcript,
    summary: doc.summary,
    analysisStatus: doc.analysisStatus,
    latestAnalysisId: idString(doc.latestAnalysisId),
    analysisError: doc.analysisError,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function assertOpportunity(opportunityId: ObjectId | null, accountId: ObjectId) {
  if (!opportunityId) return;
  const { opportunities } = await collections();
  if (!(await opportunities.countDocuments({ _id: opportunityId, accountId }, { limit: 1 }))) {
    throw new ValidationError("Validation failed", {
      formErrors: [],
      fieldErrors: { opportunityId: ["Opportunity does not belong to this account"] },
    });
  }
}

/** Keeps the account's last-interaction / next-meeting dates in step with its meetings. */
async function syncAccountDates(accountId: ObjectId, startsAt: Date) {
  const { accounts } = await collections();
  const now = new Date();
  if (startsAt <= now) {
    await accounts.updateOne(
      { _id: accountId, $or: [{ lastInteractionAt: null }, { lastInteractionAt: { $lt: startsAt } }] },
      { $set: { lastInteractionAt: startsAt } },
    );
  } else {
    await accounts.updateOne(
      { _id: accountId, $or: [{ nextMeetingAt: null }, { nextMeetingAt: { $lt: now } }, { nextMeetingAt: { $gt: startsAt } }] },
      { $set: { nextMeetingAt: startsAt } },
    );
  }
}

export interface MeetingFilter {
  accountId?: string | null;
  limit?: number;
}

export async function listMeetings(filter: MeetingFilter = {}): Promise<MeetingListItem[]> {
  const { meetings } = await collections();
  const match: Filter<MeetingDoc> = {};
  if (filter.accountId) match.accountId = toObjectId(filter.accountId, "Account");
  const docs = await meetings
    .aggregate<
      Omit<MeetingDoc, "transcript"> & { accountName: string; opportunityName: string | null; hasTranscript: boolean; pendingSuggestions: number }
    >([
      { $match: match },
      { $sort: { startsAt: -1 } },
      { $limit: filter.limit ?? 500 },
      { $addFields: { hasTranscript: { $ne: [{ $ifNull: ["$transcript", null] }, null] } } },
      { $project: { transcript: 0 } },
      { $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "acc" } },
      { $lookup: { from: "opportunities", localField: "opportunityId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "opp" } },
      {
        $lookup: {
          from: "meeting_analyses",
          localField: "latestAnalysisId",
          foreignField: "_id",
          pipeline: [
            { $project: { pending: { $size: { $filter: { input: "$suggestions", cond: { $eq: ["$$this.status", "pending"] } } } } } },
          ],
          as: "analysis",
        },
      },
      {
        $addFields: {
          accountName: { $ifNull: [{ $first: "$acc.name" }, "Unknown account"] },
          opportunityName: { $ifNull: [{ $first: "$opp.name" }, null] },
          pendingSuggestions: { $ifNull: [{ $first: "$analysis.pending" }, 0] },
        },
      },
      { $project: { acc: 0, opp: 0, analysis: 0 } },
    ])
    .toArray();
  return docs.map((d) => ({
    ...mapMeeting({ ...d, transcript: null }),
    accountName: d.accountName,
    opportunityName: d.opportunityName,
    hasTranscript: d.hasTranscript,
    pendingSuggestions: d.pendingSuggestions,
  }));
}

export async function getMeeting(id: string): Promise<Meeting> {
  const { meetings, aiJobs } = await collections();
  const _id = toObjectId(id, "Meeting");
  let doc = await meetings.findOne({ _id });
  if (!doc) throw new NotFoundError("Meeting");
  if (doc.analysisStatus === "analyzing") {
    // Recover from analyses lost to a restart so the meeting can be re-analyzed.
    const job = await aiJobs.findOne({ meetingId: _id }, { sort: { createdAt: -1 } });
    const startedAt = job?.startedAt ?? job?.createdAt;
    if (!job || (startedAt && Date.now() - startedAt.getTime() > STALE_ANALYSIS_MS && job.status !== "succeeded")) {
      const error = "The analysis did not finish (the server may have restarted). Run it again.";
      if (job) await aiJobs.updateOne({ _id: job._id }, { $set: { status: "failed", error, finishedAt: new Date() } });
      doc = (await meetings.findOneAndUpdate(
        { _id, analysisStatus: "analyzing" },
        { $set: { analysisStatus: "failed", analysisError: error } },
        { returnDocument: "after" },
      )) ?? doc;
    }
  }
  return mapMeeting(doc);
}

export async function createMeeting(
  raw: MeetingCreateInput,
  transcript: IngestedTranscript | null,
  actor: SessionUser,
): Promise<Meeting> {
  const input = meetingCreateSchema.parse(raw);
  const accountId = toObjectId(input.accountId, "Account");
  const { accounts, meetings } = await collections();
  if (!(await accounts.countDocuments({ _id: accountId }, { limit: 1 }))) throw new NotFoundError("Account");
  const opportunityId = toObjectIdOrNull(input.opportunityId, "Opportunity");
  await assertOpportunity(opportunityId, accountId);
  assertEnumValue(await getEnumerations(), "meetingTypes", "type", input.type);

  const now = new Date();
  const doc: MeetingDoc = {
    _id: new ObjectId(),
    accountId,
    opportunityId,
    title: input.title,
    startsAt: input.startsAt as Date,
    type: input.type,
    participants: input.participants,
    transcript: transcript ? { ...transcript, charCount: transcript.raw.length, ingestedAt: now } : null,
    summary: null,
    analysisStatus: "not_analyzed",
    latestAnalysisId: null,
    analysisError: null,
    createdBy: toObjectId(actor.id, "User"),
    createdAt: now,
    updatedAt: now,
  };
  await meetings.insertOne(doc);
  await recordChange({
    accountId,
    entityType: "meeting",
    entityId: doc._id,
    entityLabel: doc.title,
    action: "create",
    changes: diffObjects(null, doc as unknown as Record<string, unknown>, AUDITED_FIELDS),
    actor,
  });
  await syncAccountDates(accountId, doc.startsAt);
  await touchAccount(accountId);
  return mapMeeting(doc);
}

export async function updateMeeting(id: string, raw: MeetingPatchInput, actor: SessionUser): Promise<Meeting> {
  const input = meetingPatchSchema.parse(raw);
  const _id = toObjectId(id, "Meeting");
  const { meetings } = await collections();
  const before = await meetings.findOne({ _id });
  if (!before) throw new NotFoundError("Meeting");
  if (input.type !== undefined) assertEnumValue(await getEnumerations(), "meetingTypes", "type", input.type, before.type);

  const { opportunityId: rawOpp, startsAt, ...rest } = input;
  const set: Partial<MeetingDoc> = { ...rest, updatedAt: new Date() };
  if (startsAt !== undefined) {
    if (!startsAt) throw new ValidationError("Validation failed", { formErrors: [], fieldErrors: { startsAt: ["Required"] } });
    set.startsAt = startsAt;
  }
  if (rawOpp !== undefined) {
    set.opportunityId = toObjectIdOrNull(rawOpp, "Opportunity");
    await assertOpportunity(set.opportunityId, before.accountId);
  }
  const after = await meetings.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: "after" });
  if (!after) throw new NotFoundError("Meeting");
  await recordChange({
    accountId: before.accountId,
    entityType: "meeting",
    entityId: _id,
    entityLabel: after.title,
    action: "update",
    changes: diffObjects(before as unknown as Record<string, unknown>, set as Record<string, unknown>, AUDITED_FIELDS),
    actor,
  });
  if (set.startsAt) await syncAccountDates(before.accountId, set.startsAt);
  return mapMeeting(after);
}

export async function setTranscript(id: string, transcript: IngestedTranscript, actor: SessionUser): Promise<Meeting> {
  const _id = toObjectId(id, "Meeting");
  const { meetings } = await collections();
  const after = await meetings.findOneAndUpdate(
    { _id, analysisStatus: { $ne: "analyzing" } },
    { $set: { transcript: { ...transcript, charCount: transcript.raw.length, ingestedAt: new Date() }, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!after) {
    if (await meetings.countDocuments({ _id }, { limit: 1 })) throw new ValidationError("Wait for the running analysis to finish");
    throw new NotFoundError("Meeting");
  }
  await recordChange({
    accountId: after.accountId,
    entityType: "meeting",
    entityId: _id,
    entityLabel: after.title,
    action: "update",
    changes: [{ field: "transcript", from: null, to: `${transcript.format} · ${transcript.raw.length.toLocaleString()} characters` }],
    actor,
  });
  return mapMeeting(after);
}

/**
 * Retention control: removes the raw transcript but keeps the meeting, its analysis
 * and the short evidence quotes attached to approved facts.
 */
export async function deleteTranscript(id: string, actor: SessionUser): Promise<Meeting> {
  const _id = toObjectId(id, "Meeting");
  const { meetings } = await collections();
  const after = await meetings.findOneAndUpdate(
    { _id, analysisStatus: { $ne: "analyzing" } },
    { $set: { transcript: null, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError("Meeting");
  await recordChange({
    accountId: after.accountId,
    entityType: "meeting",
    entityId: _id,
    entityLabel: after.title,
    action: "update",
    changes: [{ field: "transcript", from: "stored", to: "deleted" }],
    actor,
  });
  return mapMeeting(after);
}

/** Deletes the meeting, its transcript, analyses and job records. Approved facts keep their provenance. */
export async function deleteMeeting(id: string, actor: SessionUser): Promise<void> {
  const _id = toObjectId(id, "Meeting");
  const c = await collections();
  const doc = await c.meetings.findOneAndDelete({ _id });
  if (!doc) throw new NotFoundError("Meeting");
  await Promise.all([c.meetingAnalyses.deleteMany({ meetingId: _id }), c.aiJobs.deleteMany({ meetingId: _id })]);
  await recordChange({ accountId: doc.accountId, entityType: "meeting", entityId: _id, entityLabel: doc.title, action: "delete", changes: [], actor });
}
