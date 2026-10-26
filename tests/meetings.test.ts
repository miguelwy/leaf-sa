import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import type { MeetingAnalysisOutput } from "@/domain/meetings";
import { setProviderForTests, type AiProvider, type StructuredRequest } from "@/server/ai/provider";
import { redactContactDetails } from "@/server/ai/redact";
import { updateAiSettings } from "@/server/ai/settings";
import { ingestTranscript } from "@/server/ingestion";
import { parseSegments } from "@/server/ingestion/segments";
import { createAccount, getAccount, updateTechStackField } from "@/server/services/accounts";
import { listActionItems } from "@/server/services/action-items";
import { listContacts } from "@/server/services/contacts";
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

  it("extracts suggestions, flags conflicts and applies approvals with provenance", async () => {
    await updateAiSettings({ enabled: true, provider: "anthropic", model: null, redactContactDetails: true }, actor);
    const { account, opp } = await setupAccount("Review Co");
    const withPain = await updateDiscoveryField(opp.id, "painPoints", [{ text: "Schema changes take two weeks" }], actor);
    const existingPain = withPain.discovery.painPoints![0];
    const withQuestion = await updateDiscoveryField(opp.id, "openQuestions", [{ text: "When would a PoC start?" }], actor);
    const question = withQuestion.discovery.openQuestions![0];
    await updateTechStackField(account.id, "currentDatabases", [{ text: "PostgreSQL" }], actor);

    const meeting = await createMeeting(
      {
        accountId: account.id,
        opportunityId: opp.id,
        title: "Technical discovery",
        startsAt: "2026-10-20T14:00:00Z",
        type: "Technical Discovery",
        participants: ["Ana Souza", "Bruno Lima"],
      },
      await ingestTranscript({ kind: "text", text: TRANSCRIPT }),
      actor,
    );
    expect((await getAccount(account.id)).lastInteractionAt?.toISOString()).toBe("2026-10-20T14:00:00.000Z");

    const provider = fakeProvider(() => ({
      summary: "Catalog team on PostgreSQL wants faster schema evolution and fast search; PoC planned in November.",
      businessInsights: [{ text: "Slow schema changes delay launches", kind: "interpretation", confidence: "medium", evidence: ev("Schema changes take three weeks") }],
      technicalInsights: [],
      decisions: [{ text: "Run a PoC on MongoDB Atlas in November", evidence: ev("We decided to run a proof of concept on MongoDB Atlas in November.") }],
      actionItems: [{ title: "Send sizing worksheet", owner: "SA", dueDate: "2026-11-05", opportunityId: null, evidence: ev("I will send the sizing worksheet by 2026-11-05.", "SA") }],
      openQuestions: [],
      missingInformation: ["Data volumes"],
      discoveryUpdates: [
        {
          scope: "opportunity",
          fieldKey: "painPoints",
          opportunityId: null,
          value: "Schema changes take three weeks because teams share the same tables",
          kind: "fact",
          confidence: "high",
          relation: "conflicts",
          relatedItemId: existingPain.id,
          evidence: ev("Schema changes take three weeks because every team touches the same tables."),
        },
        {
          scope: "opportunity",
          fieldKey: "latencyRequirements",
          opportunityId: opp.id,
          value: "Search results under 100 ms for the new storefront",
          kind: "fact",
          confidence: "high",
          relation: "new",
          relatedItemId: null,
          evidence: ev("We need search results under 100 milliseconds", "Bruno Lima"),
        },
        {
          scope: "opportunity",
          fieldKey: "decisionTimeline",
          opportunityId: opp.id,
          value: "PoC on MongoDB Atlas in November",
          kind: "fact",
          confidence: "high",
          relation: "resolves",
          relatedItemId: question.id,
          evidence: ev("We decided to run a proof of concept on MongoDB Atlas in November."),
        },
        {
          // Wrong scope on purpose: should be repaired to account.
          scope: "opportunity",
          fieldKey: "currentDatabases",
          opportunityId: null,
          value: "PostgreSQL (product catalog)",
          kind: "fact",
          confidence: "high",
          relation: "new",
          relatedItemId: null,
          evidence: ev("Our product catalog runs on PostgreSQL today."),
        },
      ],
      classificationSuggestions: [
        { field: "salesMotion", opportunityId: opp.id, value: "Migrate", rationale: "Moving off PostgreSQL", confidence: "medium", evidence: ev("Our product catalog runs on PostgreSQL today.") },
        { field: "tigerRoute", opportunityId: opp.id, value: "Warp", rationale: "n/a", confidence: "low", evidence: ev("in November") },
      ],
      mongodbOpportunities: [
        {
          capability: "Atlas Search",
          opportunityId: opp.id,
          problem: "Storefront search must return in under 100 ms",
          justification: "Integrated search index on catalog data",
          confidence: "medium",
          evidence: ev("We need search results under 100 milliseconds", "Bruno Lima"),
        },
      ],
      contacts: [{ name: "Bruno Lima", title: null, persona: "Architect", evidence: ev("We need search results", "Bruno Lima") }],
      changesSinceLastMeeting: [],
    }));
    setProviderForTests(provider);

    const { run } = await startMeetingAnalysis(meeting.id, actor);
    await expect(startMeetingAnalysis(meeting.id, actor)).rejects.toMatchObject({ code: "validation_failed" });
    await run();

    // Redaction applied to what the provider saw; context includes existing item ids.
    expect(provider.requests[0].prompt).not.toContain("bruno@example.com");
    expect(provider.requests[0].prompt).toContain(existingPain.id);

    const analyzed = await getMeeting(meeting.id);
    expect(analyzed.analysisStatus).toBe("analyzed");
    expect(analyzed.summary).toMatch(/PoC planned/);
    const analysis = await getAnalysis(analyzed.latestAnalysisId!);
    const by = (label: string) => analysis.suggestions.find((s) => s.label === label)!;

    const pain = by("Business pain points");
    expect(pain).toMatchObject({ conflict: true, relation: "conflicts", existingValue: "Schema changes take two weeks", opportunityId: opp.id });
    expect(pain.evidence.start).not.toBeNull();
    expect(by("Current databases").scope).toBe("account");
    expect(by("Tiger route").blocker).toMatch(/not a configured value/);
    expect(by("Sales motion").conflict).toBe(false);

    // Bulk approval skips the conflict and the blocked item.
    const bulk = await bulkDecide(analysis.id, { action: "approve", suggestionIds: analysis.suggestions.map((s) => s.id) }, actor);
    expect(bulk.skipped).toBe(2);
    expect(bulk.analysis.suggestions.filter((s) => s.status === "pending").map((s) => s.label).sort()).toEqual(["Business pain points", "Tiger route"]);

    // Conflict needs an explicit resolution.
    await expect(decideSuggestion(analysis.id, pain.id, { action: "approve" }, actor)).rejects.toMatchObject({ code: "validation_failed" });
    await decideSuggestion(analysis.id, pain.id, { action: "approve", resolution: "replace" }, actor);
    await decideSuggestion(analysis.id, by("Tiger route").id, { action: "reject" }, actor);
    await expect(decideSuggestion(analysis.id, pain.id, { action: "approve", resolution: "replace" }, actor)).rejects.toMatchObject({ code: "conflict" });

    const updated = await getOpportunity(opp.id);
    expect(updated.salesMotion).toBe("Migrate");
    expect(updated.discovery.painPoints).toHaveLength(1);
    expect(updated.discovery.painPoints![0]).toMatchObject({
      id: existingPain.id,
      text: "Schema changes take three weeks because teams share the same tables",
      source: { kind: "meeting", meetingId: meeting.id },
    });
    expect(updated.discovery.latencyRequirements![0]).toMatchObject({ status: "confirmed", source: { kind: "meeting" } });
    expect(updated.discovery.openQuestions ?? []).toHaveLength(0);
    expect(updated.discovery.decisionTimeline![0].text).toBe("PoC on MongoDB Atlas in November");
    expect(updated.solutionFit[0]).toMatchObject({ capability: "Atlas Search", status: "Identified" });
    expect((await getAccount(account.id)).techStack.currentDatabases).toHaveLength(2);

    const [task] = await listActionItems({ accountId: account.id });
    expect(task).toMatchObject({ title: "Send sizing worksheet", owner: "SA", opportunityId: opp.id, meetingId: meeting.id, source: { kind: "meeting" } });
    expect(task.dueDate?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect((await listContacts(account.id)).map((c) => c.name)).toContain("Bruno Lima");

    const history = await listAccountHistory(account.id);
    expect(history.some((h) => h.actor.kind === "ai-approved" && h.changes.some((c) => c.field === "discovery.painPoints"))).toBe(true);
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
    // Can be re-queued after a failure.
    await expect(startMeetingAnalysis(meeting.id, actor)).resolves.toHaveProperty("jobId");
  });
});
