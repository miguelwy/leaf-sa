import "server-only";
import type { Collection, Document, Filter, ObjectId } from "mongodb";
import { searchQuerySchema, type SearchQuery, type SearchResult, type SearchResultType } from "@/domain/search";
import { collections } from "@/server/db/collections";
import { toObjectId } from "@/server/db/ids";
import { escapeRegex } from "./accounts";

interface Source<T extends Document> {
  type: SearchResultType;
  collection: (c: Awaited<ReturnType<typeof collections>>) => Collection<T>;
  /** Fields used for the substring fallback (text indexes only match whole words). */
  regexFields: string[];
  scope: (q: SearchQuery, accountIdsForAe: ObjectId[] | null) => Filter<Document>;
  toResult: (doc: T) => Omit<SearchResult, "type">;
}

function snippet(text: string | null | undefined, q: string): string | null {
  if (!text) return null;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.slice(0, 160);
  const start = Math.max(0, idx - 60);
  return `${start > 0 ? "…" : ""}${text.slice(start, idx + q.length + 100)}`;
}

function accountScope(field: string) {
  return (q: SearchQuery, aeAccounts: ObjectId[] | null): Filter<Document> => {
    if (q.accountId) return { [field]: toObjectId(q.accountId, "Account") };
    if (aeAccounts) return { [field]: { $in: aeAccounts } };
    return {};
  };
}

/**
 * Keyword search across entity types. Uses each collection's text index for
 * relevance ranking, then tops up with case-insensitive substring matches so
 * partial words ("mongo" → "MongoDB") are found too. Semantic search over the
 * same entities arrives with Atlas Vector Search in Phase 3.
 */
export async function search(raw: Record<string, unknown>): Promise<SearchResult[]> {
  const q = searchQuerySchema.parse(raw);
  const c = await collections();
  const aeAccounts = q.aeId ? await c.accounts.distinct("_id", { aeId: toObjectId(q.aeId, "Account executive") }) : null;

  const sources: Source<Document>[] = [
    {
      type: "account",
      collection: (cs) => cs.accounts as unknown as Collection<Document>,
      regexFields: ["name", "industry", "description", "region"],
      scope: (query, ae) => (query.accountId ? { _id: toObjectId(query.accountId, "Account") } : ae ? { _id: { $in: ae } } : {}),
      toResult: (d) => ({
        id: d._id.toHexString(),
        title: d.name,
        subtitle: [d.industry, d.status].filter(Boolean).join(" · ") || null,
        snippet: snippet(d.description, q.q),
        href: `/accounts/${d._id.toHexString()}`,
        updatedAt: d.updatedAt ?? null,
      }),
    },
    {
      type: "opportunity",
      collection: (cs) => cs.opportunities as unknown as Collection<Document>,
      regexFields: ["name", "description", "expectedWorkload"],
      scope: accountScope("accountId"),
      toResult: (d) => ({
        id: d._id.toHexString(),
        title: d.name,
        subtitle: [d.salesMotion, d.stage].filter(Boolean).join(" · ") || null,
        snippet: snippet(d.description, q.q),
        href: `/accounts/${d.accountId.toHexString()}/opportunities#${d._id.toHexString()}`,
        updatedAt: d.updatedAt ?? null,
      }),
    },
    {
      type: "note",
      collection: (cs) => cs.notes as unknown as Collection<Document>,
      regexFields: ["title", "body", "tags"],
      scope: accountScope("accountId"),
      toResult: (d) => ({
        id: d._id.toHexString(),
        title: d.title,
        subtitle: d.tags?.length ? d.tags.map((t: string) => `#${t}`).join(" ") : null,
        snippet: snippet(d.body, q.q),
        href: `/accounts/${d.accountId.toHexString()}/notes?note=${d._id.toHexString()}`,
        updatedAt: d.updatedAt ?? null,
      }),
    },
    {
      type: "action_item",
      collection: (cs) => cs.actionItems as unknown as Collection<Document>,
      regexFields: ["title", "description", "owner"],
      scope: accountScope("accountId"),
      toResult: (d) => ({
        id: d._id.toHexString(),
        title: d.title,
        subtitle: [d.owner, d.status].filter(Boolean).join(" · ") || null,
        snippet: snippet(d.description, q.q),
        href: d.accountId ? `/accounts/${d.accountId.toHexString()}/actions` : "/action-items",
        updatedAt: d.updatedAt ?? null,
      }),
    },
    {
      type: "meeting",
      collection: (cs) => cs.meetings as unknown as Collection<Document>,
      regexFields: ["title", "summary", "transcript.raw"],
      scope: accountScope("accountId"),
      toResult: (d) => {
        const inSummary = d.summary && d.summary.toLowerCase().includes(q.q.toLowerCase());
        return {
          id: d._id.toHexString(),
          title: d.title,
          subtitle: [d.type, d.startsAt?.toISOString().slice(0, 10)].filter(Boolean).join(" · ") || null,
          snippet: snippet(inSummary || !d.transcript ? d.summary : d.transcript.raw, q.q),
          href: `/accounts/${d.accountId.toHexString()}/meetings/${d._id.toHexString()}`,
          updatedAt: d.updatedAt ?? null,
        };
      },
    },
    {
      type: "contact",
      collection: (cs) => cs.contacts as unknown as Collection<Document>,
      regexFields: ["name", "title", "email"],
      scope: accountScope("accountId"),
      toResult: (d) => ({
        id: d._id.toHexString(),
        title: d.name,
        subtitle: [d.title, d.email].filter(Boolean).join(" · ") || null,
        snippet: null,
        href: `/accounts/${d.accountId.toHexString()}`,
        updatedAt: d.updatedAt ?? null,
      }),
    },
    {
      type: "account_executive",
      collection: (cs) => cs.accountExecutives as unknown as Collection<Document>,
      regexFields: ["name", "territory", "region", "email"],
      // AEs are not account-scoped; hide them when filtering by account.
      scope: (query) => (query.accountId ? { _id: { $exists: false } } : query.aeId ? { _id: toObjectId(query.aeId, "Account executive") } : {}),
      toResult: (d) => ({
        id: d._id.toHexString(),
        title: d.name,
        subtitle: [d.territory, d.region].filter(Boolean).join(" · ") || null,
        snippet: snippet(d.notes, q.q),
        href: `/account-executives/${d._id.toHexString()}`,
        updatedAt: d.updatedAt ?? null,
      }),
    },
  ];

  const rx = { $regex: escapeRegex(q.q), $options: "i" };
  const perType = await Promise.all(
    sources
      .filter((s) => q.types.includes(s.type))
      .map(async (source) => {
        const coll = source.collection(c);
        const scope = source.scope(q, aeAccounts);
        const textHits = await coll
          .find({ $and: [scope, { $text: { $search: q.q } }] }, { projection: { score: { $meta: "textScore" } } })
          .sort({ score: { $meta: "textScore" } })
          .limit(q.limit)
          .toArray();
        const seen = new Set(textHits.map((d) => String(d._id)));
        const remaining = q.limit - textHits.length;
        const regexHits =
          remaining > 0
            ? await coll
                .find({ $and: [scope, { _id: { $nin: textHits.map((d) => d._id) } }, { $or: source.regexFields.map((f) => ({ [f]: rx })) }] })
                .sort({ updatedAt: -1 })
                .limit(remaining)
                .toArray()
            : [];
        return [...textHits, ...regexHits.filter((d) => !seen.has(String(d._id)))].map((d) => ({ type: source.type, ...source.toResult(d) }));
      }),
  );
  return perType.flat();
}
