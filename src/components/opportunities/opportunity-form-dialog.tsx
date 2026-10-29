"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { opportunityInputSchema, type Opportunity } from "@/domain/entities";
import { api } from "@/lib/api";
import { toDateInput } from "@/lib/format";
import { toOptions } from "@/lib/options";
import { applyServerErrors, DateField, FormGrid, SelectField, TextField } from "@/components/common/form";
import { FormDialog, useDialogState } from "@/components/common/form-dialog";
import { useReferenceData } from "@/components/common/reference-data";

/**
 * Only the simplified fields are edited here. Other opportunity fields stay in the
 * database untouched: they are not part of the form, so they are never sent.
 */
const formSchema = opportunityInputSchema.pick({
  name: true,
  salesMotion: true,
  stage: true,
  nextMilestoneTitle: true,
  nextMilestoneDate: true,
});

function defaults(o?: Opportunity) {
  return {
    name: o?.name ?? "",
    salesMotion: o?.salesMotion ?? null,
    stage: o?.stage ?? null,
    nextMilestoneTitle: o?.nextMilestone.title ?? "",
    nextMilestoneDate: toDateInput(o?.nextMilestone.dueDate),
  };
}

export function OpportunityFormDialog({
  accountId,
  opportunity,
  trigger,
  open,
  onOpenChange,
}: {
  accountId: string;
  accountAeId?: string | null;
  opportunity?: Opportunity;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const { enumerations: e } = useReferenceData();
  const dialog = useDialogState(open, onOpenChange);
  const form = useForm({ resolver: zodResolver(formSchema), defaultValues: defaults(opportunity) });

  React.useEffect(() => {
    if (dialog.open) form.reset(defaults(opportunity));
  }, [dialog.open, opportunity, form]);

  return (
    <FormDialog
      title={opportunity ? "Edit opportunity" : "New opportunity"}
      trigger={trigger}
      open={dialog.open}
      onOpenChange={dialog.setOpen}
      form={form}
      submitLabel={opportunity ? "Save" : "Create"}
      onSubmit={async (values) => {
        try {
          if (opportunity) await api("PATCH", `/api/opportunities/${opportunity.id}`, values);
          else await api("POST", "/api/opportunities", { ...values, accountId });
          toast.success(opportunity ? "Opportunity updated" : "Opportunity created");
          dialog.setOpen(false);
          router.refresh();
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <FormGrid>
        <TextField name="name" label="Name" required autoFocus className="sm:col-span-2" placeholder="e.g. Catalog migration" />
        <SelectField name="salesMotion" label="Sales motion" options={toOptions(e.salesMotions)} emptyLabel="Not classified" />
        <SelectField name="stage" label="Stage" options={toOptions(e.opportunityStages)} />
        <TextField name="nextMilestoneTitle" label="Next step" placeholder="e.g. PoC kickoff" />
        <DateField name="nextMilestoneDate" label="Next step date" />
      </FormGrid>
    </FormDialog>
  );
}
