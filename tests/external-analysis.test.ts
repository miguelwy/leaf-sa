import { describe, expect, it } from "vitest";
import { ingestTranscript } from "@/server/ingestion";
import { createAccount, getAccount } from "@/server/services/accounts";
import { listContacts } from "@/server/services/contacts";
import { extractJsonObject, getExternalAnalysisPrompt, importMeetingAnalysis, normalizeImportedOutput } from "@/server/services/external-analysis";
import { decideSuggestion } from "@/server/services/meeting-review";
import { getAnalysis } from "@/server/services/meeting-analysis";
import { createMeeting, getMeeting } from "@/server/services/meetings";
import { actor } from "./helpers";

const TRANSCRIPT = `[00:00:05] Ana Souza: Our product catalog runs on PostgreSQL today.
[00:01:02] Bruno Lima: We need search results under 100 milliseconds for the new storefront.
Contact: ana@example.com`;

describe("external (Glean) analysis", () => {
  it("extracts JSON from fenced or chatty answers", () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a": 1}\n```\nHope it helps')).toEqual({ a: 1 });
    expect(extractJsonObject('Sure! {"a": {"b": 2}} done')).toEqual({ a: { b: 2 } });
    expect(() => extractJsonObject("no json here")).toThrow(/No JSON/);
    expect(() => extractJsonObject("{not json}")).toThrow(/not valid JSON/);
  });

  it("fills gaps typical of chat assistants", () => {
    const out = normalizeImportedOutput({
      summary: "S",
      actionItems: [{ title: "T", evidence: "quoted" }],
      champions: [{ name: "Ana" }],
      features: [{ capability: "Atlas Search", evidence: { excerpt: "x" } }],
    }) as Record<string, unknown[]>;
    expect(out.actionItems[0]).toMatchObject({ owner: null, dueDate: null, evidence: { excerpt: "quoted", speaker: null } });
    expect(out.champions[0]).toMatchObject({ title: null, role: "", evidence: { excerpt: "", speaker: null } });
    expect(out.features[0]).toMatchObject({ why: "", evidence: { excerpt: "x", speaker: null } });
    expect((normalizeImportedOutput({ summary: "S" }) as Record<string, unknown>).champions).toEqual([]);
  });

  it("builds a prompt with context, schema and redacted transcript", async () => {
    const account = await createAccount({ name: "Prompt Co", status: "Active" }, actor);
    const meeting = await createMeeting(
      { accountId: account.id, title: "Call", startsAt: "2026-10-20T14:00:00Z" },
      await ingestTranscript({ kind: "text", text: TRANSCRIPT }),
      actor,
    );
    const { prompt } = await getExternalAnalysisPrompt(meeting.id, true);
    expect(prompt).toContain("Prompt Co");
    expect(prompt).toContain('"champions"');
    expect(prompt).toContain("Atlas Vector Search"); // configured capabilities
    expect(prompt).toContain("Return ONE JSON object");
    expect(prompt).toContain("Our product catalog runs on PostgreSQL today.");
    expect(prompt).not.toContain("ana@example.com");

    const withoutTranscript = await getExternalAnalysisPrompt(meeting.id, false);
    expect(withoutTranscript.prompt).not.toContain("Our product catalog runs on PostgreSQL");
    expect(withoutTranscript.prompt).toContain("attached to this conversation");
  });

  it("imports a result into reviewable suggestions without any provider", async () => {
    const account = await createAccount({ name: "Import Co", status: "Active" }, actor);
    const meeting = await createMeeting(
      { accountId: account.id, title: "Discovery", startsAt: "2026-10-20T14:00:00Z" },
      await ingestTranscript({ kind: "text", text: TRANSCRIPT }),
      actor,
    );

    await expect(importMeetingAnalysis(meeting.id, { result: '{"summary": 3}' }, actor)).rejects.toMatchObject({
      code: "validation_failed",
      details: { formErrors: [expect.stringContaining("summary")] },
    });

    const answer = `Here is the analysis:
\`\`\`json
{
  "summary": "Catalog on PostgreSQL; storefront search must be under 100 ms.",
  "champions": [{"name": "Bruno Lima", "title": "Architect", "role": "Owns search requirements",
    "evidence": {"excerpt": "We need search results under 100 milliseconds", "speaker": "Bruno Lima"}}],
  "features": [{"capability": "Atlas Search", "why": "Storefront search under 100 ms",
    "evidence": {"excerpt": "We need search results under 100 milliseconds", "speaker": "Bruno Lima"}}]
}
\`\`\``;
    const res = await importMeetingAnalysis(meeting.id, { result: answer, sourceLabel: "Glean" }, actor);
    expect(res.suggestions).toBe(2);

    const updated = await getMeeting(meeting.id);
    expect(updated).toMatchObject({ analysisStatus: "analyzed", summary: expect.stringContaining("PostgreSQL") });
    const analysis = await getAnalysis(updated.latestAnalysisId!);
    expect(analysis).toMatchObject({ provider: "import", model: "Glean" });
    for (const s of analysis.suggestions) {
      expect(s.evidence.start).not.toBeNull();
      await decideSuggestion(analysis.id, s.id, { action: "approve" }, actor);
    }
    expect((await getAccount(account.id)).features[0]).toMatchObject({ capability: "Atlas Search", source: { kind: "meeting", meetingId: meeting.id } });
    expect((await listContacts(account.id))[0]).toMatchObject({ name: "Bruno Lima", isChampion: true });
  });
});
