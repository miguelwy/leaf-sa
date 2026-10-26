import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/layout-primitives";
import { OpportunityFormDialog } from "./opportunity-form-dialog";

/** Shown on per-opportunity tabs when the account has no opportunities yet. */
export function NoOpportunityState({ accountId, accountAeId, what }: { accountId: string; accountAeId: string | null; what: string }) {
  return (
    <EmptyState
      icon={Target}
      title="No opportunities yet"
      description={`${what} is captured per opportunity, so different initiatives at the same customer stay independent.`}
      action={
        <OpportunityFormDialog
          accountId={accountId}
          accountAeId={accountAeId}
          trigger={
            <Button size="sm">
              <Plus className="size-3.5" /> New opportunity
            </Button>
          }
        />
      }
    />
  );
}
