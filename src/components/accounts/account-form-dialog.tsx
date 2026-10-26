"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { accountInputSchema, type Account } from "@/domain/entities";
import { api } from "@/lib/api";
import { toDateTimeInput } from "@/lib/format";
import { applyServerErrors, DateField, FormGrid, SelectField, TextareaField, TextField } from "@/components/common/form";
import { toOptions } from "@/lib/options";
import { FormDialog, useDialogState } from "@/components/common/form-dialog";
import { useReferenceData } from "@/components/common/reference-data";

function defaults(account?: Account, defaultStatus?: string) {
  return {
    name: account?.name ?? "",
    industry: account?.industry ?? "",
    website: account?.website ?? "",
    region: account?.region ?? "",
    aeId: account?.aeId ?? null,
    status: account?.status ?? defaultStatus ?? "",
    description: account?.description ?? "",
    internalNotes: account?.internalNotes ?? "",
    lastInteractionAt: toDateTimeInput(account?.lastInteractionAt),
    nextMeetingAt: toDateTimeInput(account?.nextMeetingAt),
  };
}

export function AccountFormDialog({
  account,
  trigger,
  open,
  onOpenChange,
  defaultAeId,
}: {
  account?: Account;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultAeId?: string;
}) {
  const router = useRouter();
  const { enumerations, accountExecutives } = useReferenceData();
  const dialog = useDialogState(open, onOpenChange);
  const form = useForm({
    resolver: zodResolver(accountInputSchema),
    defaultValues: { ...defaults(account, enumerations.accountStatuses[0]), aeId: account?.aeId ?? defaultAeId ?? null },
  });

  React.useEffect(() => {
    if (dialog.open) form.reset({ ...defaults(account, enumerations.accountStatuses[0]), aeId: account?.aeId ?? defaultAeId ?? null });
  }, [dialog.open, account, defaultAeId, enumerations.accountStatuses, form]);

  return (
    <FormDialog
      title={account ? "Edit account" : "New account"}
      description={account ? undefined : "Accounts are the hub for opportunities, discovery, notes and tasks."}
      trigger={trigger}
      open={dialog.open}
      onOpenChange={dialog.setOpen}
      form={form}
      size="lg"
      submitLabel={account ? "Save changes" : "Create account"}
      onSubmit={async (values) => {
        try {
          if (account) {
            await api("PATCH", `/api/accounts/${account.id}`, values);
            toast.success("Account updated");
            router.refresh();
          } else {
            const created = await api<Account>("POST", "/api/accounts", values);
            toast.success("Account created");
            router.push(`/accounts/${created.id}`);
          }
          dialog.setOpen(false);
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <FormGrid>
        <TextField name="name" label="Account name" required autoFocus className="sm:col-span-2" />
        <SelectField name="status" label="Status" options={toOptions(enumerations.accountStatuses)} allowEmpty={false} required />
        <SelectField
          name="aeId"
          label="Account Executive"
          options={accountExecutives.map((ae) => ({ value: ae.id, label: ae.name }))}
          emptyLabel="Unassigned"
        />
        <TextField name="industry" label="Industry" placeholder="e.g. Retail" />
        <TextField name="region" label="Region" placeholder="e.g. LATAM" />
        <TextField name="website" label="Website" placeholder="example.com" className="sm:col-span-2" />
        <DateField name="lastInteractionAt" label="Last interaction" withTime />
        <DateField name="nextMeetingAt" label="Next scheduled meeting" withTime />
        <TextareaField name="description" label="Description" rows={3} className="sm:col-span-2" />
        <TextareaField
          name="internalNotes"
          label="Internal account notes"
          rows={3}
          className="sm:col-span-2"
          hint="Internal context only. For meeting notes use SA Notes."
        />
      </FormGrid>
    </FormDialog>
  );
}
