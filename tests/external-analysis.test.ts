import { describe, expect, it } from "vitest";
import { ingestTranscript } from "@/server/ingestion";
import { createAccount } from "@/server/services/accounts";
import { extractJsonObject, getExternalAnalysisPrompt, importMeetingAnalysis, normalizeImportedOutput } from "@/server/services/external-analysis";
import { decideSuggestion } from "@/server/services/meeting-review";
import { getAnalysis } from "@/server/services/meeting-analysis";
import { createMeeting, getMeeting } from "@/server/services/meetings";
import { createOpportunity, getOpportunity, updateDiscoveryField } from "@/server/services/opportunities";
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
      decisions: [{ text: "D", evidence: "quoted" }],
      actionItems: [{ title: "T", evidence: { excerpt: "x" } }],
      discoveryUpdates: [{ kind: "Fact", confidence: "HIGH", relation: "New", scope: "Opportunity" }],
    }) as Record<string, unknown[]>;
    expect(out.businessInsights).toEqual([]);
    expect(out.decisions[0]).toMatchObject({ evidence: { excerpt: "quoted", speaker: null } });
    expect(out.actionItems[0]).toMatchObject({ owner: null, dueDate: null, opportunityId: null, evidence: { speaker: null } });
    expect(out.discoveryUpdates[0]).toMatchObject({ kind: "fact", confidence: "high", relation: "new", scope: "opportunity" });
  });

  it("builds a prompt with context ids, schema and redacted transcript", async () => {
    const account = await createAccount({ name: "Prompt Co", status: "Active" }, actor);
    const opp = await createOpportunity({ accountId: account.id, name: "Catalog" }, actor);
    const withPain = await updateDiscoveryField(opp.id, "painPoints", [{ text: "Slow schema changes" }], actor);
    const meeting = await createMeeting(
      { accountId: account.id, opportunityId: opp.id, title: "Call", startsAt: "2026-10-20T14:00:00Z" },
      await ingestTranscript({ kind: "text", text: TRANSCRIPT }),
      actor,
    );
    const { prompt } = await getExternalAnalysisPrompt(meeting.id, true);
    expect(prompt).toContain(opp.id);
    expect(prompt).toContain(withPain.discovery.painPoints![0].id);
    expect(prompt).toContain('"discoveryUpdates"');
    expect(prompt).toContain("Return ONE JSON object");
    expect(prompt).toContain("Our product catalog runs on PostgreSQL today.");
    expect(prompt).not.toContain("ana@example.com");

    const withoutTranscript = await getExternalAnalysisPrompt(meeting.id, false);
    expect(withoutTranscript.prompt).not.toContain("Our product catalog runs on PostgreSQL");
    expect(withoutTranscript.prompt).toContain("attached to this conversation");
  });

  it("imports a result into reviewable suggestions without any provider", async () => {
    const account = await createAccount({ name: "Import Co", status: "Active" }, actor);
    const opp = await createOpportunity({ accountId: account.id, name: "Storefront search" }, actor);
    const meeting = await createMeeting(
      { accountId: account.id, opportunityId: opp.id, title: "Discovery", startsAt: "2026-10-20T14:00:00Z" },
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
  "discoveryUpdates": [
    {"scope": "opportunity", "fieldKey": "latencyRequirements", "opportunityId": "${opp.id}", "value": "Storefront search under 100 ms",
     "kind": "fact", "confidence": "high", "relation": "new", "relatedItemId": null,
     "evidence": {"excerpt": "We need search results under 100 milliseconds", "speaker": "Bruno Lima"}}
  ],
  "missingInformation": ["Data volumes"]
}
\`\`\``;
    const res = await importMeetingAnalysis(meeting.id, { result: answer, sourceLabel: "Glean" }, actor);
    expect(res.suggestions).toBe(1);

    const updated = await getMeeting(meeting.id);
    expect(updated).toMatchObject({ analysisStatus: "analyzed", summary: expect.stringContaining("PostgreSQL") });
    const analysis = await getAnalysis(updated.latestAnalysisId!);
    expect(analysis).toMatchObject({ provider: "import", model: "Glean" });
    const [s] = analysis.suggestions;
    expect(s.evidence.start).not.toBeNull();

    await decideSuggestion(analysis.id, s.id, { action: "approve" }, actor);
    const after = await getOpportunity(opp.id);
    expect(after.discovery.latencyRequirements![0]).toMatchObject({ text: "Storefront search under 100 ms", source: { kind: "meeting", meetingId: meeting.id } });
  });
});
