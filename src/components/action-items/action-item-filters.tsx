"use client";

import { ACTION_ITEM_STATUSES, ACTION_ITEM_STATUS_LABELS } from "@/domain/enumerations";
import { ClearFilters, FilterSelect } from "@/components/common/url-filters";
import { useReferenceData } from "@/components/common/reference-data";

export function ActionItemFilters({ showAccountFilters = true }: { showAccountFilters?: boolean }) {
  const { accounts, accountExecutives } = useReferenceData();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        param="status"
        label="Status"
        allLabel="Open (not done)"
        className="w-40"
        options={[
          ...ACTION_ITEM_STATUSES.map((s) => ({ value: s, label: ACTION_ITEM_STATUS_LABELS[s] })),
          { value: "all", label: "All statuses" },
        ]}
      />
      <FilterSelect
        param="due"
        label="Due"
        allLabel="Any due date"
        className="w-36"
        options={[
          { value: "overdue", label: "Overdue" },
          { value: "week", label: "Due in 7 days" },
        ]}
      />
      {showAccountFilters && (
        <>
          <FilterSelect param="account" label="Accounts" options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          <FilterSelect param="ae" label="AEs" options={accountExecutives.map((a) => ({ value: a.id, label: a.name }))} />
        </>
      )}
      <ClearFilters params={["status", "due", "account", "ae"]} />
    </div>
  );
}
