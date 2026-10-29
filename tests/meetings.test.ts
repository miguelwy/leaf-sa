import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import type { MeetingAnalysisOutput } from "@/domain/meetings";
import { setProviderForTests, type AiProvider, type StructuredRequest } from "@/server/ai/provider";
import { redactContactDetails } from "@/server/ai/redact";
import { updateAiSettings } from "@/server/ai/settings";
import { ingestTranscript } from "@/server/ingestion";
import { parseSegments } from "@/server/ingestion/segments";
import {
  addFeature,
  addKeyNote,
  createAccount,
  getAccount,
  removeFeature,
  removeKeyNote,
  updateFeature,
  updateKeyNote,
  updateTechStackField,
} from "@/server/services/accounts";
import { listActionItems } from "@/server/services/action-items";
import { createContact, listContacts } from "@/server/services/contacts";
import { listAccountHistory } from "@/server/services/history";
import { getAnalysis, locateExcerpt, startMeetingAnalysis } from "@/server/services/meeting-analysis";
import { bulkDecide, decideSuggestion } from "@/server/services/meeting-review";
import { createMeeting, getMeeting } from "@/server/services/meetings";
import { createOpportunity, getOpportunity, updateDiscoveryField } from "@/server/services/opportunities";
import { actor } from "./helpers";

const TRANSCRIPT = `[00:00:05] Ana Souza: Thanks for joining. Our product catalog runs on PostgreSQL today.
[00:00:20] Ana Souza: Schema changes take three weeks because every team touches the same tables.
[00:01:02] Bruno Lima: We need search results under 100 milliseconds for the new storefront.
[00:01:40] Ana Souza: We decided to run a proof of concept on MongoDB Atlas in November.
[00:02:10] SA: I will send the sizing worksheet by 2026-11-05.
[00:02:30] Bruno Lima: Contact me at bruno@example.com or +55 11 99999-0000.`;

describe("transcript ingestion", () => {
  it("splits labelled turns with timestamps and offsets", () => {
    const segments = parseSegments(TRANSCRIPT);
    expect(segments).toHaveLength(6);
    expect(segments[0]).toMatchObject({ speaker: "Ana Souza", timestamp: "00:00:05" });
    expect(TRANSCRIPT.slice(segments[2].start, segments[2].start + 9)).toBe("We need s");
  });

  it("handles speaker-on-its-own-line exports and continuations", () => {
    const segments = parseSegments("Jane Doe\nFirst line.\nSecond line.\n\nJohn Roe\nReply here.");
    expect(segments.map((s) => s.speaker)).toEqual(["Jane Doe", "John Roe"]);
    expect(segments[0].text).toBe("First line.\nSecond line.");
  });

  it("accepts pasted text and text files, rejects unsupported types and empty input", async () => {
    const pasted = await ingestTranscript({ kind: "text", text: "  Hello\r\nWorld  " });
    expect(pasted).toMatchObject({ raw: "Hello\nWorld", format: "paste" });
    const md = await ingestTranscript({ kind: "file", fileName: "notes.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("# Call\nA: hi") });
    expect(md.format).toBe("md");
    await expect(ingestTranscript({ kind: "file", fileName: "audio.mp3", mimeType: "audio/mpeg", bytes: new Uint8Array(4) })).rejects.toMatchObject({
      code: "validation_failed",
    });
    await expect(ingestTranscript({ kind: "file", fileName: "x.txt", mimeType: "application/pdf", bytes: new Uint8Array(4) })).rejects.toMatchObject({
      code: "validation_failed",
    });
    await expect(ingestTranscript({ kind: "text", text: "   " })).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("locates excerpts despite whitespace, case and quote differences", () => {
    expect(locateExcerpt(TRANSCRIPT, "Schema changes take three weeks")).not.toBeNull();
    const fuzzy = locateExcerpt(TRANSCRIPT, "schema  changes take THREE weeks because every team");
    expect(fuzzy && TRANSCRIPT.slice(fuzzy.start, fuzzy.start + 6)).toBe("Schema");
    expect(locateExcerpt(TRANSCRIPT, "this was never said in the meeting at all")).toBeNull();
  });

  it("redacts emails and phone numbers but keeps timestamps", () => {
    const redacted = redactContactDetails(TRANSCRIPT);
    expect(redacted).toContain("[email]");
    expect(redacted).toContain("[phone]");
    expect(redacted).toContain("[00:02:30]");
    expect(redacted).not.toContain("bruno@example.com");
  });
});

// ---------------------------------------------------------------------------

function fakeProvider(build: (req: StructuredRequest<z.ZodType>) => MeetingAnalysisOutput): AiProvider & { requests: StructuredRequest<z.ZodType>[] } {
  const requests: StructuredRequest<z.ZodType>[] = [];
  return {
    name: "anthropic",
    requests,
    async generateStructured<S extends z.ZodType>(req: StructuredRequest<S>) {
      requests.push(req as unknown as StructuredRequest<z.ZodType>);
      const output = build(req as unknown as StructuredRequest<z.ZodType>) as z.infer<S>;
      return { output, usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0 }, model: "claude-opus-5-5" };
    },
  };
}

const ev = (excerpt: string, speaker: string | null = "Ana Souza") => ({ excerpt, speaker });

describe("meeting analysis and review", () => {
  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterEach(() => setProviderForTests(null));

  async function setupAccount(name: string) {
    const account = await createAccount({ name, status: "Active" }, actor);
    const opp = await createOpportunity({ accountId: account.id, name: "Catalog modernisation" }, actor);
    return { account, opp };
  }

  it("refuses to analyze until AI is approved in Settings", async () => {
    const { account } = await setupAccount("No AI Co");
    const meeting = await createMeeting(
      { accountId: account.id, title: "Intro", startsAt: "2026-10-20T14:00:00Z" },
      await ingestTranscript({ kind: "text", text: TRANSCRIPT }),
      actor,
    );
    await expect(startMeetingAnalysis(meeting.id, actor)).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("extracts action items, champions and features and applies approvals", async () => {
    await updateAiSettings({ enabled: true, provider: "anthropic", model: null, redactContactDetails: true }, actor);
    const { account, opp } = await setupAccount("Review Co");
    // Bruno is already a contact: approving him as champion must promote, not duplicate.
    await createContact(account.id, { name: "Bruno Lima", title: "Architect" }, actor);
    await addFeature(account.id, { capability: "MongoDB Atlas", why: "Managed service" }, actor);

    const meeting = await createMeeting(
      { accountId: account.id, opportunityId: opp.id, title: "Technical discovery", startsAt: "2026-10-20T14:00:00Z", participants: ["Ana Souza", "Bruno Lima"] },
      await ingestTranscript({ kind: "text", text: TRANSCRIPT }),
      actor,
    );
    expect((await getAccount(account.id)).lastInteractionAt?.toISOString()).toBe("2026-10-20T14:00:00.000Z");

    const provider = fakeProvider(() => ({
      summary: "Catalog team on PostgreSQL wants fast storefront search; PoC planned in November.",
      actionItems: [{ title: "Send sizing worksheet", owner: "SA", dueDate: "2026-11-05", evidence: ev("I will send the sizing worksheet by 2026-11-05.", "SA") }],
      champions: [
        { name: "Bruno Lima", title: null, role: "Owns storefront search requirements", evidence: ev("We need search results under 100 milliseconds", "Bruno Lima") },
        { name: "Ana Souza", title: "Head of Catalog", role: "Drives the PoC decision", evidence: ev("We decided to run a proof of concept on MongoDB Atlas in November.") },
      ],
      features: [
        { capability: "atlas search", why: "Storefront search under 100 ms", evidence: ev("We need search results under 100 milliseconds", "Bruno Lima") },
        { capability: "MongoDB Atlas", why: "Already listed", evidence: ev("proof of concept on MongoDB Atlas") },
        { capability: "Quantum Index", why: "n/a", evidence: ev("Our product catalog") },
      ],
    }));
    setProviderForTests(provider);

    const { run } = await startMeetingAnalysis(meeting.id, actor);
    await expect(startMeetingAnalysis(meeting.id, actor)).rejects.toMatchObject({ code: "validation_failed" });
    await run();

    expect(provider.requests[0].prompt).not.toContain("bruno@example.com");
    expect(provider.requests[0].prompt).toContain("MongoDB Atlas");

    const analyzed = await getMeeting(meeting.id);
    expect(analyzed.analysisStatus).toBe("analyzed");
    const analysis = await getAnalysis(analyzed.latestAnalysisId!);
    const labels = analysis.suggestions.map((s) => `${s.type}:${s.value}`).sort();
    // Existing feature skipped; capability name normalised to the configured spelling.
    expect(labels).toEqual(["action_item:Send sizing worksheet", "champion:Ana Souza", "champion:Bruno Lima", "feature:Atlas Search", "feature:Quantum Index"]);
    const bruno = analysis.suggestions.find((s) => s.value === "Bruno Lima")!;
    expect(bruno.existingValue).toMatch(/existing contact/);
    const quantum = analysis.suggestions.find((s) => s.value === "Quantum Index")!;
    expect(quantum.blocker).toMatch(/not a configured capability/);
    expect(analysis.suggestions.find((s) => s.type === "action_item")!.evidence.start).not.toBeNull();

    const bulk = await bulkDecide(analysis.id, { action: "approve", suggestionIds: analysis.suggestions.map((s) => s.id) }, actor);
    expect(bulk).toMatchObject({ applied: 4, skipped: 1 });
    await decideSuggestion(analysis.id, quantum.id, { action: "reject" }, actor);
    await expect(decideSuggestion(analysis.id, bruno.id, { action: "approve" }, actor)).rejects.toMatchObject({ code: "conflict" });

    const contacts = await listContacts(account.id);
    expect(contacts.filter((c) => c.name === "Bruno Lima")).toHaveLength(1);
    expect(contacts.find((c) => c.name === "Bruno Lima")).toMatchObject({ isChampion: true, title: "Architect", notes: "Owns storefront search requirements" });
    expect(contacts.find((c) => c.name === "Ana Souza")).toMatchObject({ isChampion: true, title: "Head of Catalog" });

    const after = await getAccount(account.id);
    expect(after.features.map((f) => f.capability)).toEqual(["MongoDB Atlas", "Atlas Search"]);
    expect(after.features[1]).toMatchObject({ why: "Storefront search under 100 ms", status: "Identified", source: { kind: "meeting", meetingId: meeting.id } });

    const [task] = await listActionItems({ accountId: account.id });
    expect(task).toMatchObject({ title: "Send sizing worksheet", owner: "SA", opportunityId: opp.id, meetingId: meeting.id, source: { kind: "meeting" } });
    expect(task.dueDate?.toISOString().slice(0, 10)).toBe("2026-11-05");

    const history = await listAccountHistory(account.id);
    expect(history.some((h) => h.actor.kind === "ai-approved" && h.changes.some((c) => c.field === "features.Atlas Search"))).toBe(true);
  });

  it("records failures and allows a retry", async () => {
    await updateAiSettings({ enabled: true, provider: "anthropic", model: null, redactContactDetails: false }, actor);
    const { account } = await setupAccount("Failure Co");
    const meeting = await createMeeting(
      { accountId: account.id, title: "Call", startsAt: "2026-10-21T10:00:00Z" },
      await ingestTranscript({ kind: "text", text: TRANSCRIPT }),
      actor,
    );
    setProviderForTests({
      name: "anthropic",
      async generateStructured() {
        throw Object.assign(new Error("unauthorized"), { status: 401 });
      },
    });
    const { run } = await startMeetingAnalysis(meeting.id, actor);
    await run();
    const failed = await getMeeting(meeting.id);
    expect(failed.analysisStatus).toBe("failed");
    expect(failed.analysisError).toMatch(/API key/);
    await expect(startMeetingAnalysis(meeting.id, actor)).resolves.toHaveProperty("jobId");
  });
});

describe("simplified model migration", () => {
  it("copies discovery into key notes and solution fit into features without touching the originals", async () => {
    const { collections } = await import("@/server/db/collections");
    const { getDb } = await import("@/server/db/client");
    const { migrateToSimplifiedModel } = await import("@/server/db/migrations");
    const account = await createAccount({ name: "Legacy Co", status: "Active" }, actor);
    const opp = await createOpportunity({ accountId: account.id, name: "Legacy opp" }, actor);
    await updateDiscoveryField(opp.id, "painPoints", [{ text: "Slow schema changes" }, { text: "Unclear owner", status: "tentative" }], actor);
    await updateTechStackField(account.id, "currentDatabases", [{ text: "PostgreSQL" }], actor);
    const { addSolutionFit } = await import("@/server/services/opportunities");
    await addSolutionFit(opp.id, { capability: "Atlas Search", problem: "Search relevance", justification: "Built-in" }, actor);

    // Simulate a document from before the simplification.
    const c = await collections();
    const { ObjectId } = await import("mongodb");
    await c.accounts.updateOne({ _id: new ObjectId(account.id) }, { $unset: { simplifiedAt: "", keyNotes: "", features: "" } });

    expect(await migrateToSimplifiedModel(await getDb())).toBeGreaterThanOrEqual(1);
    expect(await migrateToSimplifiedModel(await getDb())).toBe(0); // idempotent

    const migrated = await getAccount(account.id);
    expect(migrated.keyNotes.map((n) => n.text).sort()).toEqual([
      "Business pain points: Slow schema changes",
      "Business pain points: Unclear owner (tentative)",
      "Current databases: PostgreSQL",
    ]);
    expect(migrated.features).toEqual([expect.objectContaining({ capability: "Atlas Search", why: "Search relevance — Built-in", status: "Identified" })]);
    // Originals are preserved.
    expect(migrated.techStack.currentDatabases).toHaveLength(1);
    expect((await getOpportunity(opp.id)).discovery.painPoints).toHaveLength(2);
  });

  it("manages key notes and features", async () => {
    const account = await createAccount({ name: "Notes Co 2", status: "Active" }, actor);
    const a1 = await addKeyNote(account.id, { text: "First" }, actor);
    const a2 = await addKeyNote(account.id, { text: "Second" }, actor);
    expect(a2.keyNotes.map((n) => n.text)).toEqual(["Second", "First"]);
    const edited = await updateKeyNote(account.id, a1.keyNotes[0].id, { text: "First (edited)" }, actor);
    expect(edited.keyNotes[1].text).toBe("First (edited)");
    expect((await removeKeyNote(account.id, a1.keyNotes[0].id, actor)).keyNotes).toHaveLength(1);

    const f = await addFeature(account.id, { capability: "Atlas Vector Search", why: "RAG assistant" }, actor);
    await expect(addFeature(account.id, { capability: "Atlas Vector Search" }, actor)).rejects.toMatchObject({ code: "conflict" });
    await expect(addFeature(account.id, { capability: "Made Up" }, actor)).rejects.toMatchObject({ code: "validation_failed" });
    const updated = await updateFeature(account.id, f.features[0].id, { status: "Validated" }, actor);
    expect(updated.features[0]).toMatchObject({ status: "Validated", why: "RAG assistant" });
    expect((await removeFeature(account.id, f.features[0].id, actor)).features).toHaveLength(0);
  });
});
