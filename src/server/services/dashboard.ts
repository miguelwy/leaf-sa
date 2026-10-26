import "server-only";
import { ObjectId } from "mongodb";
import { completeness } from "@/domain/discovery";
import { collections } from "@/server/db/collections";
import type { OpportunityDoc } from "@/server/db/types";
import { startOfTodayUtc } from "./action-items";
import { mapDiscoveryValues } from "./discovery";
import { getEnumerations } from "./settings";

/** Accounts with active work and no recorded interaction for this many days need follow-up. */
export const FOLLOW_UP_AFTER_DAYS = 30;
const UPCOMING_DAYS = 14;
const DAY = 86400000;

export type FocusKind = "overdue_task" | "due_task" | "meeting" | "milestone";

export interface FocusItem {
  kind: FocusKind;
  title: string;
  subtitle: string | null;
  date: Date;
  href: string;
}

export interface DashboardData {
  accountTotal: number;
  accountsByStatus: { label: string; count: number }[];
  activeOpportunities: number;
  accountsByAe: { aeId: string | null; name: string; count: number }[];
  opportunitiesByMotion: { motion: string; count: number }[];
  tasks: { open: number; overdue: number; dueThisWeek: number; blocked: number };
  upcomingMeetings: { accountId: string; accountName: string; at: Date }[];
  focus: FocusItem[];
  followUps: { accountId: string; name: string; lastInteractionAt: Date | null; reason: string }[];
  recentAccounts: { id: string; name: string; updatedAt: Date; aeName: string | null }[];
  discovery: {
    opportunityId: string;
    name: string;
    accountId: string;
    accountName: string;
    business: { filled: number; total: number };
    technical: { filled: number; total: number };
  }[];
}

export async function getDashboard(now = new Date()): Promise<DashboardData> {
  const c = await collections();
  const { closedStages } = await getEnumerations();
  const today = startOfTodayUtc(now);
  const weekEnd = new Date(today.getTime() + 7 * DAY);
  const horizon = new Date(now.getTime() + UPCOMING_DAYS * DAY);
  const activeOppFilter = { stage: { $nin: closedStages } };

  const [
    accountTotal,
    accountsByStatus,
    accountsByAe,
    activeOpportunities,
    opportunitiesByMotion,
    taskCounts,
    upcomingMeetings,
    focusTasks,
    milestones,
    recentAccounts,
    activeOpps,
    overdueAccounts,
  ] = await Promise.all([
    c.accounts.countDocuments(),
    c.accounts.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]).toArray(),
    c.accounts
      .aggregate<{ _id: unknown; name: string | null; count: number }>([
        { $group: { _id: "$aeId", count: { $sum: 1 } } },
        { $lookup: { from: "account_executives", localField: "_id", foreignField: "_id", as: "ae" } },
        { $project: { count: 1, name: { $first: "$ae.name" } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
    c.opportunities.countDocuments(activeOppFilter),
    c.opportunities
      .aggregate<{ _id: string | null; count: number }>([
        { $match: activeOppFilter },
        { $group: { _id: "$salesMotion", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
    c.actionItems
      .aggregate<{ open: number; overdue: number; dueThisWeek: number; blocked: number }>([
        { $match: { status: { $ne: "done" } } },
        {
          $group: {
            _id: null,
            open: { $sum: 1 },
            overdue: { $sum: { $cond: [{ $and: [{ $ne: ["$dueDate", null] }, { $lt: ["$dueDate", today] }] }, 1, 0] } },
            dueThisWeek: {
              $sum: { $cond: [{ $and: [{ $gte: ["$dueDate", today] }, { $lt: ["$dueDate", weekEnd] }] }, 1, 0] },
            },
            blocked: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
    c.accounts
      .find({ nextMeetingAt: { $gte: now, $lte: horizon } }, { projection: { name: 1, nextMeetingAt: 1 } })
      .sort({ nextMeetingAt: 1 })
      .limit(10)
      .toArray(),
    c.actionItems
      .aggregate<{ _id: unknown; title: string; dueDate: Date; accountId: unknown; accountName: string | null }>([
        { $match: { status: { $ne: "done" }, dueDate: { $ne: null, $lt: weekEnd } } },
        { $sort: { dueDate: 1 } },
        { $limit: 12 },
        { $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "acc" } },
        { $project: { title: 1, dueDate: 1, accountId: 1, accountName: { $first: "$acc.name" } } },
      ])
      .toArray(),
    c.opportunities
      .aggregate<{ _id: unknown; name: string; accountId: { toHexString(): string }; nextMilestone: { title: string | null; dueDate: Date }; accountName: string }>([
        { $match: { ...activeOppFilter, "nextMilestone.dueDate": { $gte: today, $lte: horizon } } },
        { $sort: { "nextMilestone.dueDate": 1 } },
        { $limit: 8 },
        { $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "acc" } },
        { $project: { name: 1, accountId: 1, nextMilestone: 1, accountName: { $first: "$acc.name" } } },
      ])
      .toArray(),
    c.accounts
      .aggregate<{ _id: { toHexString(): string }; name: string; updatedAt: Date; aeName: string | null }>([
        { $sort: { updatedAt: -1 } },
        { $limit: 6 },
        { $lookup: { from: "account_executives", localField: "aeId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "ae" } },
        { $project: { name: 1, updatedAt: 1, aeName: { $ifNull: [{ $first: "$ae.name" }, null] } } },
      ])
      .toArray(),
    c.opportunities
      .aggregate<OpportunityDoc & { accountName: string }>([
        { $match: activeOppFilter },
        { $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "acc" } },
        { $addFields: { accountName: { $ifNull: [{ $first: "$acc.name" }, "Unknown account"] } } },
        { $project: { acc: 0, solutionFit: 0 } },
      ])
      .toArray(),
    c.actionItems.distinct("accountId", { status: { $ne: "done" }, dueDate: { $ne: null, $lt: today } }),
  ]);

  // Follow-ups: accounts with active opportunities and stale interaction, or overdue tasks.
  const staleBefore = new Date(now.getTime() - FOLLOW_UP_AFTER_DAYS * DAY);
  const activeAccountIds = new Set(activeOpps.map((o) => o.accountId.toHexString()));
  const overdueIds = new Set(
    overdueAccounts.filter((id): id is ObjectId => id instanceof ObjectId).map((id) => id.toHexString()),
  );
  const candidateIds = [...new Set([...activeAccountIds, ...overdueIds])].map((id) => new ObjectId(id));
  const candidates = candidateIds.length
    ? await c.accounts.find({ _id: { $in: candidateIds } }, { projection: { name: 1, lastInteractionAt: 1 } }).toArray()
    : [];
  const followUps = candidates
    .map((a) => {
      const id = a._id.toHexString();
      const stale = activeAccountIds.has(id) && (!a.lastInteractionAt || a.lastInteractionAt < staleBefore);
      const reason = overdueIds.has(id)
        ? "Overdue action items"
        : stale
          ? a.lastInteractionAt
            ? `No interaction in ${FOLLOW_UP_AFTER_DAYS}+ days`
            : "No interaction recorded"
          : null;
      return reason ? { accountId: id, name: a.name, lastInteractionAt: a.lastInteractionAt, reason } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (a.lastInteractionAt?.getTime() ?? 0) - (b.lastInteractionAt?.getTime() ?? 0))
    .slice(0, 8);

  const focus: FocusItem[] = [
    ...focusTasks.map((t) => ({
      kind: (t.dueDate < today ? "overdue_task" : "due_task") as FocusKind,
      title: t.title,
      subtitle: t.accountName ?? null,
      date: t.dueDate,
      href: "/action-items",
    })),
    ...upcomingMeetings.map((m) => ({
      kind: "meeting" as const,
      title: `Meeting with ${m.name}`,
      subtitle: null,
      date: m.nextMeetingAt as Date,
      href: `/accounts/${m._id.toHexString()}`,
    })),
    ...milestones.map((m) => ({
      kind: "milestone" as const,
      title: m.nextMilestone.title ?? "Milestone",
      subtitle: `${m.accountName} · ${m.name}`,
      date: m.nextMilestone.dueDate,
      href: `/accounts/${m.accountId.toHexString()}/opportunities`,
    })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 10);

  const discovery = activeOpps
    .map((o) => {
      const values = mapDiscoveryValues(o.discovery);
      const business = completeness(values, ["business"]);
      const technical = completeness(values, ["technical"]);
      return {
        opportunityId: o._id.toHexString(),
        name: o.name,
        accountId: o.accountId.toHexString(),
        accountName: o.accountName,
        business: { filled: business.filled, total: business.total },
        technical: { filled: technical.filled, total: technical.total },
        ratio: (business.filled + technical.filled) / Math.max(1, business.total + technical.total),
      };
    })
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 6)
    .map(({ ratio: _ratio, ...rest }) => {
      void _ratio;
      return rest;
    });

  return {
    accountTotal,
    accountsByStatus: accountsByStatus.map((s) => ({ label: s._id ?? "Unspecified", count: s.count })),
    activeOpportunities,
    accountsByAe: accountsByAe.map((a) => ({
      aeId: a._id ? (a._id as { toHexString(): string }).toHexString() : null,
      name: a.name ?? "Unassigned",
      count: a.count,
    })),
    opportunitiesByMotion: opportunitiesByMotion.map((m) => ({ motion: m._id ?? "Unclassified", count: m.count })),
    tasks: taskCounts[0] ?? { open: 0, overdue: 0, dueThisWeek: 0, blocked: 0 },
    upcomingMeetings: upcomingMeetings.map((m) => ({ accountId: m._id.toHexString(), accountName: m.name, at: m.nextMeetingAt as Date })),
    focus,
    followUps,
    recentAccounts: recentAccounts.map((a) => ({ id: a._id.toHexString(), name: a.name, updatedAt: a.updatedAt, aeName: a.aeName })),
    discovery,
  };
}
