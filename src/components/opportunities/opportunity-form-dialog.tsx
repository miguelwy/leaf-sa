"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { opportunityInputSchema, type Opportunity } from "@/domain/entities";
import { api } from "@/lib/api";
import { toDateInput } from "@/lib/format";
import { SectionLabel } from "@/components/common/layout-primitives";
import { applyServerErrors, DateField, FormGrid, SelectField, TextareaField, TextField } from "@/components/common/form";
import { toOptions } from "@/lib/options";
import { FormDialog, useDialogState } from "@/components/common/form-dialog";
import { useReferenceData } from "@/components/common/reference-data";

function defaults(o?: Opportunity, aeId?: string | null) {
  return {
    name: o?.name ?? "",
    aeId: o?.aeId ?? aeId ?? null,
    salesMotion: o?.salesMotion ?? null,
    tigerRoute: o?.tigerRoute ?? null,
    stage: o?.stage ?? null,
    estimatedTimeline: o?.estimatedTimeline ?? "",
    expectedWorkload: o?.expectedWorkload ?? "",
    description: o?.description ?? "",
    businessPriority: o?.businessPriority ?? null,
    technicalComplexity: o?.technicalComplexity ?? null,
    nextMilestoneTitle: o?.nextMilestone.title ?? "",
    nextMilestoneDate: toDateInput(o?.nextMilestone.dueDate),
  };
}

export function OpportunityFormDialog({
  accountId,
  accountAeId,
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
  const { enumerations: e, accountExecutives } = useReferenceData();
  const dialog = useDialogState(open, onOpenChange);
  const form = useForm({ resolver: zodResolver(opportunityInputSchema), defaultValues: defaults(opportunity, accountAeId) });

  React.useEffect(() => {
    if (dialog.open) form.reset(defaults(opportunity, accountAeId));
  }, [dialog.open, opportunity, accountAeId, form]);

  return (
    <FormDialog
      title={opportunity ? "Edit opportunity" : "New opportunity"}
      description="Classification is always your call. Values come from Settings → Enumerations."
      trigger={trigger}
      open={dialog.open}
      onOpenChange={dialog.setOpen}
      form={form}
      size="lg"
      submitLabel={opportunity ? "Save changes" : "Create opportunity"}
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
        <TextField name="name" label="Opportunity name" required autoFocus className="sm:col-span-2" placeholder="e.g. Catalog migration from PostgreSQL" />
        <SelectField name="aeId" label="Account Executive" options={accountExecutives.map((a) => ({ value: a.id, label: a.name }))} emptyLabel="Unassigned" />
        <SelectField name="stage" label="Stage" options={toOptions(e.opportunityStages)} />
      </FormGrid>

      <SectionLabel className="pt-2">Classification</SectionLabel>
      <FormGrid>
        <SelectField name="salesMotion" label="Sales motion" options={toOptions(e.salesMotions)} emptyLabel="Not classified" />
        <SelectField name="tigerRoute" label="Tiger route" options={toOptions(e.tigerRoutes)} emptyLabel="Not classified" />
        <SelectField name="businessPriority" label="Business priority" options={toOptions(e.priorities)} />
        <SelectField name="technicalComplexity" label="Technical complexity" options={toOptions(e.complexities)} />
      </FormGrid>

      <SectionLabel className="pt-2">Scope & timing</SectionLabel>
      <FormGrid>
        <TextField name="estimatedTimeline" label="Estimated timeline" placeholder="e.g. Production by Q3" />
        <TextField name="expectedWorkload" label="Expected workload" placeholder="e.g. Product catalog, 2 TB" />
        <TextField name="nextMilestoneTitle" label="Next milestone" placeholder="e.g. PoC kickoff" />
        <DateField name="nextMilestoneDate" label="Milestone date" />
        <TextareaField name="description" label="Description" rows={3} className="sm:col-span-2" />
      </FormGrid>
    </FormDialog>
  );
}
