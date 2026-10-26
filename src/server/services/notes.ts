import "server-only";
import { ObjectId, type Filter } from "mongodb";
import type { SessionUser } from "@/domain/auth";
import { noteCreateSchema, notePatchSchema, type Note, type NoteInput, type NoteRevision } from "@/domain/entities";
import { collections } from "@/server/db/collections";
import { idString, toObjectId, toObjectIdOrNull } from "@/server/db/ids";
import type { NoteDoc } from "@/server/db/types";
import { ConflictError, NotFoundError, ValidationError } from "@/server/http/errors";
import { escapeRegex, touchAccount } from "./accounts";
import { recordChange } from "./history";

function mapNote(doc: NoteDoc): Note {
  return {
    id: doc._id.toHexString(),
    accountId: doc.accountId.toHexString(),
    opportunityId: idString(doc.opportunityId),
    meetingId: idString(doc.meetingId),
    title: doc.title,
    body: doc.body,
    tags: doc.tags,
    pinned: doc.pinned,
    revision: doc.revision,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function assertOpportunityInAccount(opportunityId: ObjectId | null, accountId: ObjectId) {
  if (!opportunityId) return;
  const { opportunities } = await collections();
  if (!(await opportunities.countDocuments({ _id: opportunityId, accountId }, { limit: 1 }))) {
    throw new ValidationError("Validation failed", {
      formErrors: [],
      fieldErrors: { opportunityId: ["Opportunity does not belong to this account"] },
    });
  }
}

export interface NoteFilter {
  q?: string | null;
  tag?: string | null;
  opportunityId?: string | null;
}

export async function listNotes(accountId: string, filter: NoteFilter = {}): Promise<Note[]> {
  const { notes } = await collections();
  const query: Filter<NoteDoc> = { accountId: toObjectId(accountId, "Account") };
  if (filter.tag) query.tags = filter.tag.toLowerCase();
  if (filter.opportunityId) query.opportunityId = toObjectId(filter.opportunityId, "Opportunity");
  if (filter.q) {
    const rx = { $regex: escapeRegex(filter.q), $options: "i" };
    query.$or = [{ title: rx }, { body: rx }, { tags: rx }];
  }
  const docs = await notes.find(query).sort({ pinned: -1, updatedAt: -1 }).limit(500).toArray();
  return docs.map(mapNote);
}

export async function getNote(id: string): Promise<Note> {
  const { notes } = await collections();
  const doc = await notes.findOne({ _id: toObjectId(id, "Note") });
  if (!doc) throw new NotFoundError("Note");
  return mapNote(doc);
}

export async function createNote(raw: NoteInput & { accountId: string }, actor: SessionUser): Promise<Note> {
  const input = noteCreateSchema.parse(raw);
  const accountId = toObjectId(input.accountId, "Account");
  const { accounts, notes } = await collections();
  if (!(await accounts.countDocuments({ _id: accountId }, { limit: 1 }))) throw new NotFoundError("Account");
  const opportunityId = toObjectIdOrNull(input.opportunityId, "Opportunity");
  await assertOpportunityInAccount(opportunityId, accountId);

  const now = new Date();
  const doc: NoteDoc = {
    _id: new ObjectId(),
    accountId,
    opportunityId,
    meetingId: null,
    title: input.title,
    body: input.body,
    tags: input.tags,
    pinned: input.pinned,
    revision: 1,
    createdBy: toObjectId(actor.id, "User"),
    createdAt: now,
    updatedAt: now,
  };
  await notes.insertOne(doc);
  await recordChange({ accountId, entityType: "note", entityId: doc._id, entityLabel: doc.title, action: "create", changes: [], actor });
  await touchAccount(accountId);
  return mapNote(doc);
}

/**
 * Updates a note. Content edits (title/body/tags) snapshot the previous version into
 * `note_revisions`; toggling `pinned` or relinking does not create a revision.
 */
export async function updateNote(id: string, raw: Partial<NoteInput>, actor: SessionUser): Promise<Note> {
  const input = notePatchSchema.parse(raw);
  const _id = toObjectId(id, "Note");
  const { notes, noteRevisions } = await collections();
  const before = await notes.findOne({ _id });
  if (!before) throw new NotFoundError("Note");

  const set: Partial<NoteDoc> = { updatedAt: new Date() };
  if (input.title !== undefined) set.title = input.title;
  if (input.body !== undefined) set.body = input.body;
  if (input.tags !== undefined) set.tags = input.tags;
  if (input.pinned !== undefined) set.pinned = input.pinned;
  if (input.opportunityId !== undefined) {
    set.opportunityId = toObjectIdOrNull(input.opportunityId, "Opportunity");
    await assertOpportunityInAccount(set.opportunityId, before.accountId);
  }

  const contentChanged =
    (set.title !== undefined && set.title !== before.title) ||
    (set.body !== undefined && set.body !== before.body) ||
    (set.tags !== undefined && JSON.stringify(set.tags) !== JSON.stringify(before.tags));

  const update: { $set: Partial<NoteDoc>; $inc?: { revision: number } } = { $set: set };
  if (contentChanged) {
    await noteRevisions.insertOne({
      _id: new ObjectId(),
      noteId: _id,
      accountId: before.accountId,
      revision: before.revision,
      title: before.title,
      body: before.body,
      tags: before.tags,
      editedAt: before.updatedAt,
      editedBy: before.createdBy,
    });
    update.$inc = { revision: 1 };
  } else {
    // Metadata-only change: do not move updatedAt for pin toggles.
    if (input.pinned !== undefined && Object.keys(input).length === 1) delete set.updatedAt;
  }

  // Guard on the revision we read so concurrent edits cannot silently overwrite each other.
  const after = await notes.findOneAndUpdate({ _id, revision: before.revision }, update, { returnDocument: "after" });
  if (!after) throw new ConflictError("This note was modified elsewhere. Reload and try again.");
  if (contentChanged) {
    await recordChange({
      accountId: before.accountId,
      entityType: "note",
      entityId: _id,
      entityLabel: after.title,
      action: "update",
      changes: [{ field: "revision", from: before.revision, to: after.revision }],
      actor,
    });
    await touchAccount(before.accountId);
  }
  return mapNote(after);
}

export async function deleteNote(id: string, actor: SessionUser): Promise<void> {
  const _id = toObjectId(id, "Note");
  const { notes, noteRevisions } = await collections();
  const doc = await notes.findOneAndDelete({ _id });
  if (!doc) throw new NotFoundError("Note");
  await noteRevisions.deleteMany({ noteId: _id });
  await recordChange({ accountId: doc.accountId, entityType: "note", entityId: _id, entityLabel: doc.title, action: "delete", changes: [], actor });
}

export async function listNoteRevisions(noteId: string): Promise<NoteRevision[]> {
  const { noteRevisions } = await collections();
  const docs = await noteRevisions.find({ noteId: toObjectId(noteId, "Note") }).sort({ revision: -1 }).limit(100).toArray();
  return docs.map((d) => ({
    id: d._id.toHexString(),
    noteId: d.noteId.toHexString(),
    revision: d.revision,
    title: d.title,
    body: d.body,
    tags: d.tags,
    editedAt: d.editedAt,
  }));
}

export async function listAccountTags(accountId: string): Promise<string[]> {
  const { notes } = await collections();
  const tags = await notes.distinct("tags", { accountId: toObjectId(accountId, "Account") });
  return (tags as string[]).sort();
}
