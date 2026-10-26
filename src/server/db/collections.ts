import type { Db } from "mongodb";
import type {
  AccountDoc,
  AccountExecutiveDoc,
  AiJobDoc,
  MeetingAnalysisDoc,
  MeetingDoc,
  ActionItemDoc,
  ChangeHistoryDoc,
  ContactDoc,
  NoteDoc,
  NoteRevisionDoc,
  OpportunityDoc,
  SettingsDoc,
  UserDoc,
  WorkloadDoc,
} from "./types";
import { getDb } from "./client";
import { COLLECTION_NAMES } from "./names";

export { COLLECTION_NAMES };

export function collectionsFor(db: Db) {
  return {
    users: db.collection<UserDoc>(COLLECTION_NAMES.users),
    settings: db.collection<SettingsDoc>(COLLECTION_NAMES.settings),
    accountExecutives: db.collection<AccountExecutiveDoc>(COLLECTION_NAMES.accountExecutives),
    accounts: db.collection<AccountDoc>(COLLECTION_NAMES.accounts),
    contacts: db.collection<ContactDoc>(COLLECTION_NAMES.contacts),
    opportunities: db.collection<OpportunityDoc>(COLLECTION_NAMES.opportunities),
    workloads: db.collection<WorkloadDoc>(COLLECTION_NAMES.workloads),
    notes: db.collection<NoteDoc>(COLLECTION_NAMES.notes),
    noteRevisions: db.collection<NoteRevisionDoc>(COLLECTION_NAMES.noteRevisions),
    actionItems: db.collection<ActionItemDoc>(COLLECTION_NAMES.actionItems),
    history: db.collection<ChangeHistoryDoc>(COLLECTION_NAMES.history),
    meetings: db.collection<MeetingDoc>(COLLECTION_NAMES.meetings),
    meetingAnalyses: db.collection<MeetingAnalysisDoc>(COLLECTION_NAMES.meetingAnalyses),
    aiJobs: db.collection<AiJobDoc>(COLLECTION_NAMES.aiJobs),
  };
}

export type Collections = ReturnType<typeof collectionsFor>;

export async function collections(): Promise<Collections> {
  return collectionsFor(await getDb());
}
