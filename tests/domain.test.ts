import { describe, expect, it } from "vitest";
import { optionalDate, optionalUrl } from "@/domain/common";
import { completeness, getFieldDef, type DiscoveryItem } from "@/domain/discovery";
import { accountInputSchema, noteInputSchema } from "@/domain/entities";
import { enumerationUpdateSchema } from "@/domain/enumerations";
import { mergeDiscoveryItems } from "@/server/services/discovery";
import { diffObjects } from "@/server/services/history";
import type { DiscoveryItemDoc } from "@/server/db/types";

describe("domain schemas", () => {
  it("normalises URLs and rejects garbage", () => {
    expect(optionalUrl.parse("example.com")).toBe("https://example.com");
    expect(optionalUrl.parse("")).toBeNull();
    expect(optionalUrl.safeParse("not a url").success).toBe(false);
  });

  it("parses dates idempotently", () => {
    const first = optionalDate.parse("2026-10-30");
    expect(first?.toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(optionalDate.parse(first?.toISOString())?.getTime()).toBe(first?.getTime());
    expect(optionalDate.parse("")).toBeNull();
    expect(optionalDate.safeParse("nope").success).toBe(false);
  });

  it("stores unknown optional values as null, never empty strings", () => {
    const parsed = accountInputSchema.parse({ name: "  Acme ", status: "Active", industry: "", website: "" });
    expect(parsed.name).toBe("Acme");
    expect(parsed.industry).toBeNull();
    expect(parsed.website).toBeNull();
  });

  it("dedupes and lowercases note tags", () => {
    expect(noteInputSchema.parse({ title: "t", tags: ["Atlas", "atlas", "Search"] }).tags).toEqual(["atlas", "search"]);
  });

  it("requires unique enumeration values and allows empty closed stages only", () => {
    expect(enumerationUpdateSchema.safeParse({ kind: "salesMotions", values: ["A", "a"] }).success).toBe(false);
    expect(enumerationUpdateSchema.safeParse({ kind: "salesMotions", values: [] }).success).toBe(false);
    expect(enumerationUpdateSchema.safeParse({ kind: "closedStages", values: [] }).success).toBe(true);
  });
});

describe("diffObjects", () => {
  it("reports only changed fields present in the update", () => {
    const before = { name: "A", region: null, nextMeetingAt: new Date("2026-01-01") };
    const after = { name: "A", region: "EMEA", nextMeetingAt: new Date("2026-01-01") };
    expect(diffObjects(before, after, ["name", "region", "nextMeetingAt", "missing"])).toEqual([
      { field: "region", from: null, to: "EMEA" },
    ]);
  });

  it("treats empty string and null as equal", () => {
    expect(diffObjects({ a: "" }, { a: null }, ["a"])).toEqual([]);
  });
});

describe("mergeDiscoveryItems", () => {
  const def = getFieldDef("painPoints", "opportunity")!;
  const t0 = new Date("2026-01-01T00:00:00Z");
  const existing: DiscoveryItemDoc[] = [
    {
      id: "6f0a6a8e-7f0c-4b8e-9d1a-0c6f2f1c2a01",
      text: "Slow reporting",
      status: "confirmed",
      source: { kind: "manual" },
      createdAt: t0,
      updatedAt: t0,
    },
  ];

  it("preserves provenance of existing items and stamps new ones as manual", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    const merged = mergeDiscoveryItems(
      def,
      existing,
      [{ id: existing[0].id, text: "Slow reporting (nightly batch)", status: "confirmed" }, { text: "Schema changes take weeks" }],
      now,
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: existing[0].id, createdAt: t0, updatedAt: now, source: { kind: "manual" } });
    expect(merged[1].id).not.toBe(existing[0].id);
    expect(merged[1]).toMatchObject({ status: "confirmed", source: { kind: "manual" }, createdAt: now });
  });

  it("does not bump updatedAt when nothing changed", () => {
    const merged = mergeDiscoveryItems(def, existing, [{ id: existing[0].id, text: "Slow reporting", status: "confirmed" }]);
    expect(merged[0].updatedAt).toBe(t0);
  });

  it("rejects multiple values for single-value fields", () => {
    const textDef = getFieldDef("currentArchitecture", "opportunity")!;
    expect(() => mergeDiscoveryItems(textDef, [], [{ text: "a" }, { text: "b" }])).toThrow(/single value/);
  });

  it("scopes field keys to opportunity vs account", () => {
    expect(getFieldDef("currentDatabases", "opportunity")).toBeNull();
    expect(getFieldDef("currentDatabases", "account")).not.toBeNull();
  });
});

describe("completeness", () => {
  it("counts only fields with at least one confirmed item", () => {
    const item = (status: DiscoveryItem["status"]): DiscoveryItem => ({
      id: "x",
      text: "x",
      status,
      source: { kind: "manual" },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = completeness({ painPoints: [item("confirmed")], businessDrivers: [item("tentative")] }, ["business"]);
    expect(result.filled).toBe(1);
    expect(result.total).toBe(13);
  });
});
