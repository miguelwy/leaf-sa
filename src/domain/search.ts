import { z } from "zod";
import { optionalObjectId } from "./common";

export const SEARCH_TYPES = ["account", "opportunity", "meeting", "note", "action_item", "account_executive", "contact"] as const;
export type SearchResultType = (typeof SEARCH_TYPES)[number];

export const SEARCH_TYPE_LABELS: Record<SearchResultType, string> = {
  account: "Accounts",
  opportunity: "Opportunities",
  meeting: "Meetings & transcripts",
  note: "SA Notes",
  action_item: "Action Items",
  account_executive: "Account Executives",
  contact: "Contacts",
};

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((t): t is SearchResultType => (SEARCH_TYPES as readonly string[]).includes(t)) : [...SEARCH_TYPES])),
  accountId: optionalObjectId,
  aeId: optionalObjectId,
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  href: string;
  updatedAt: Date | null;
}
