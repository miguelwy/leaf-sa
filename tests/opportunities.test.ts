import { describe, expect, it } from "vitest";
import { createAccountExecutive } from "@/server/services/account-executives";
import { createAccount } from "@/server/services/accounts";
import { createActionItem, listActionItems } from "@/server/services/action-items";
import { listAccountHistory } from "@/server/services/history";
import { createNote, getNote } from "@/server/services/notes";
import {
  addSolutionFit,
  createOpportunity,
  deleteOpportunity,
  listOpportunities,
  removeSolutionFit,
  updateDiscoveryField,
  updateOpportunity,
  updateSolutionFit,
} from "@/server/services/opportunities";
import { createWorkload, listWorkloads, updateWorkload } from "@/server/services/workloads";
import { actor } from "./helpers";

async function setup(name: string) {
  const ae = await createAccountExecutive({ name: `${name} AE` });
  const account = await createAccount({ name, status: "Active", aeId: ae.id }, actor);
  return { ae, account };
}

describe("opportunities service", () => {
  it("defaults the AE to the account's AE and validates classification", async () => {
    const { ae, account } = await setup("Acme");
    const opp = await createOpportunity(
      { accountId: account.id, name: "Postgres migration", salesMotion: "Migrate", tigerRoute: "Fast", stage: "Discovery" },
      actor,
    );
    expect(opp.aeId).toBe(ae.id);
    expect(opp.salesMotion).toBe("Migrate");

    await expect(createOpportunity({ accountId: account.id, name: "Bad", salesMotion: "Teleport" }, actor)).rejects.toMatchObject({
      code: "validation_failed",
      details: { fieldErrors: { salesMotion: [expect.stringContaining("Teleport")] } },
    });
  });

  it("supports multiple independent opportunities per account", async () => {
    const { account } = await setup("Multi");
    await createOpportunity({ accountId: account.id, name: "Postgres migration", salesMotion: "Migrate" }, actor);
    await createOpportunity({ accountId: account.id, name: "Product search", salesMotion: "Launch" }, actor);
    await createOpportunity({ accountId: account.id, name: "RAG assistant", salesMotion: "Launch" }, actor);
    const opps = await listOpportunities({ accountId: account.id });
    expect(opps).toHaveLength(3);
    expect(opps.every((o) => o.accountName === "Multi")).toBe(true);
  });

  it("updates milestone fields partially", async () => {
    const { account } = await setup("Milestone");
    const opp = await createOpportunity({ accountId: account.id, name: "O", nextMilestoneTitle: "PoC kickoff", nextMilestoneDate: "2026-11-10" }, actor);
    const updated = await updateOpportunity(opp.id, { nextMilestoneDate: "2026-11-20" }, actor);
    expect(updated.nextMilestone.title).toBe("PoC kickoff");
    expect(updated.nextMilestone.dueDate?.toISOString()).toBe("2026-11-20T00:00:00.000Z");
  });

  it("stores discovery items per field and audits the change", async () => {
    const { account } = await setup("Discovery");
    const opp = await createOpportunity({ accountId: account.id, name: "O" }, actor);
    const updated = await updateDiscoveryField(
      opp.id,
      "painPoints",
      [{ text: "Nightly ETL misses SLA" }, { text: "Rigid schema", status: "tentative" }],
      actor,
    );
    expect(updated.discovery.painPoints).toHaveLength(2);
    expect(updated.discovery.painPoints![1].status).toBe("tentative");

    const [latest] = await listAccountHistory(account.id);
    expect(latest.changes[0]).toEqual({
      field: "discovery.painPoints",
      from: [],
      to: ["Nightly ETL misses SLA", "Rigid schema (tentative)"],
    });

    await expect(updateDiscoveryField(opp.id, "currentDatabases", [], actor)).rejects.toMatchObject({ code: "not_found" });
  });

  it("manages solution fit entries", async () => {
    const { account } = await setup("Fit");
    const opp = await createOpportunity({ accountId: account.id, name: "O" }, actor);
    const withEntry = await addSolutionFit(opp.id, { capability: "Atlas Search", problem: "Product search relevance" }, actor);
    const entry = withEntry.solutionFit[0];
    expect(entry.status).toBe("Identified");

    const updated = await updateSolutionFit(opp.id, entry.id, { status: "Validated", justification: "PoC results" }, actor);
    expect(updated.solutionFit[0]).toMatchObject({ status: "Validated", justification: "PoC results", problem: "Product search relevance" });

    await expect(addSolutionFit(opp.id, { capability: "Quantum Index", problem: "x" }, actor)).rejects.toMatchObject({
      code: "validation_failed",
    });
    // Recommendations must be grounded in a discovered problem.
    await expect(addSolutionFit(opp.id, { capability: "Atlas Search", problem: "" }, actor)).rejects.toThrow();
    const removed = await removeSolutionFit(opp.id, entry.id, actor);
    expect(removed.solutionFit).toHaveLength(0);
  });

  it("deletes workloads and unlinks notes/action items when an opportunity is deleted", async () => {
    const { account } = await setup("Cascade");
    const opp = await createOpportunity({ accountId: account.id, name: "O" }, actor);
    const workload = await createWorkload({ opportunityId: opp.id, name: "Catalog", latency: "<50ms p99" }, actor);
    expect(workload.accountId).toBe(account.id);
    const updatedWorkload = await updateWorkload(workload.id, { dataVolume: "2 TB" }, actor);
    expect(updatedWorkload.dataVolume).toBe("2 TB");

    const note = await createNote({ accountId: account.id, opportunityId: opp.id, title: "N" }, actor);
    await createActionItem({ title: "Send sizing", opportunityId: opp.id }, actor);

    await deleteOpportunity(opp.id, actor);
    expect(await listWorkloads({ opportunityId: opp.id })).toHaveLength(0);
    expect((await getNote(note.id)).opportunityId).toBeNull();
    const [task] = await listActionItems({ accountId: account.id, status: "all" });
    expect(task.opportunityId).toBeNull();
    expect(task.accountId).toBe(account.id);
  });
});
