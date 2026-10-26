import { describe, expect, it } from "vitest";
import { createAccount } from "@/server/services/accounts";
import { createActionItem, listActionItems, updateActionItem } from "@/server/services/action-items";
import { createNote, listNoteRevisions, listNotes, updateNote } from "@/server/services/notes";
import { createOpportunity } from "@/server/services/opportunities";
import { actor } from "./helpers";

describe("notes service", () => {
  it("snapshots revisions on content edits only", async () => {
    const account = await createAccount({ name: "Notes Co", status: "Active" }, actor);
    const note = await createNote({ accountId: account.id, title: "Discovery call", body: "v1", tags: ["Discovery"] }, actor);
    expect(note).toMatchObject({ revision: 1, tags: ["discovery"] });

    const edited = await updateNote(note.id, { body: "v2" }, actor);
    expect(edited.revision).toBe(2);
    const pinned = await updateNote(note.id, { pinned: true }, actor);
    expect(pinned.revision).toBe(2);
    expect(pinned.pinned).toBe(true);

    expect(pinned.body).toBe("v2");
    expect(pinned.tags).toEqual(["discovery"]);

    const revisions = await listNoteRevisions(note.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ revision: 1, body: "v1" });
  });

  it("rejects linking a note to another account's opportunity", async () => {
    const a = await createAccount({ name: "A Notes", status: "Active" }, actor);
    const b = await createAccount({ name: "B Notes", status: "Active" }, actor);
    const opp = await createOpportunity({ accountId: b.id, name: "B opp" }, actor);
    await expect(createNote({ accountId: a.id, opportunityId: opp.id, title: "x" }, actor)).rejects.toMatchObject({
      code: "validation_failed",
    });
  });

  it("lists pinned notes first and filters by text and tag", async () => {
    const account = await createAccount({ name: "Filter Co", status: "Active" }, actor);
    await createNote({ accountId: account.id, title: "Older", body: "change streams", tags: ["cdc"] }, actor);
    await createNote({ accountId: account.id, title: "Pinned", body: "vector search", pinned: true }, actor);
    expect((await listNotes(account.id)).map((n) => n.title)).toEqual(["Pinned", "Older"]);
    expect((await listNotes(account.id, { q: "VECTOR" })).map((n) => n.title)).toEqual(["Pinned"]);
    expect((await listNotes(account.id, { tag: "cdc" })).map((n) => n.title)).toEqual(["Older"]);
  });
});

describe("action items service", () => {
  it("sets and clears completedAt with status transitions", async () => {
    const item = await createActionItem({ title: "Share sizing doc" }, actor);
    expect(item.completedAt).toBeNull();
    const done = await updateActionItem(item.id, { status: "done" }, actor);
    expect(done.completedAt).toBeInstanceOf(Date);
    const reopened = await updateActionItem(item.id, { status: "in_progress" }, actor);
    expect(reopened.completedAt).toBeNull();
    // A patch that omits status must not reset it to the create default.
    const renamed = await updateActionItem(item.id, { title: "Share sizing doc v2" }, actor);
    expect(renamed.status).toBe("in_progress");
  });

  it("derives the account from the opportunity and rejects mismatches", async () => {
    const a = await createAccount({ name: "Task A", status: "Active" }, actor);
    const b = await createAccount({ name: "Task B", status: "Active" }, actor);
    const opp = await createOpportunity({ accountId: a.id, name: "Opp A" }, actor);
    const item = await createActionItem({ title: "Follow up", opportunityId: opp.id }, actor);
    expect(item.accountId).toBe(a.id);
    await expect(createActionItem({ title: "Bad", accountId: b.id, opportunityId: opp.id }, actor)).rejects.toMatchObject({
      code: "validation_failed",
    });
  });

  it("filters overdue items and sorts undated items last", async () => {
    const account = await createAccount({ name: "Due Co", status: "Active" }, actor);
    await createActionItem({ title: "No date", accountId: account.id }, actor);
    await createActionItem({ title: "Overdue", accountId: account.id, dueDate: "2020-01-01" }, actor);
    await createActionItem({ title: "Future", accountId: account.id, dueDate: "2099-01-01" }, actor);

    expect((await listActionItems({ accountId: account.id })).map((i) => i.title)).toEqual(["Overdue", "Future", "No date"]);
    expect((await listActionItems({ accountId: account.id, due: "overdue" })).map((i) => i.title)).toEqual(["Overdue"]);
    await expect(createActionItem({ title: "Bad priority", priority: "Whenever" }, actor)).rejects.toMatchObject({
      code: "validation_failed",
    });
  });
});
