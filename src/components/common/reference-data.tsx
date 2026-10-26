"use client";

import * as React from "react";
import type { Enumerations } from "@/domain/enumerations";

export interface ReferenceData {
  enumerations: Enumerations;
  accountExecutives: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  opportunities: { id: string; name: string; accountId: string }[];
  ai: { ready: boolean; reason: string | null; providerLabel: string };
}

const ReferenceDataContext = React.createContext<ReferenceData | null>(null);

/** Shared lookup data (enumerations, AE and account options) loaded once by the app layout. */
export function ReferenceDataProvider({ value, children }: { value: ReferenceData; children: React.ReactNode }) {
  return <ReferenceDataContext.Provider value={value}>{children}</ReferenceDataContext.Provider>;
}

export function useReferenceData(): ReferenceData {
  const ctx = React.useContext(ReferenceDataContext);
  if (!ctx) throw new Error("useReferenceData must be used inside ReferenceDataProvider");
  return ctx;
}
