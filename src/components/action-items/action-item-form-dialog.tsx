"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { actionItemInputSchema, type ActionItem } from "@/domain/entities";
import { ACTION_ITEM_STATUSES, ACTION_ITEM_STATUS_LABELS } from "@/domain/enumerations";
import { api } from "@/lib/api";
import { toDateInput } from "@/lib/format";
import { applyServerErrors, DateField, FormGrid, SelectField, TextareaField, TextField } from "@/components/common/form";
import { toOptions } from "@/lib/options";
import { FormDialog, useDialogState } from "@/components/common/form-dialog";
import { useReferenceData } from "@/components/common/reference-data";

function defaults(item?: ActionItem, accountId?: string, opportunityId?: string) {
  return {
    title: item?.title ?? "",
    description: item?.description ?? "",
    accountId: item?.accountId ?? accountId ?? null,
    opportunityId: item?.opportunityId ?? opportunityId ?? null,
    owner: item?.owner ?? "",
    dueDate: toDateInput(item?.dueDate),
    priority: item?.priority ?? null,
    status: item?.status ?? ("todo" as const),
  };
}

export function ActionItemFormDialog({
  item,
  trigger,
  open,
  onOpenChange,
  accountId,
  opportunityId,
  lockAccount,
}: {
  item?: ActionItem;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  accountId?: string;
  opportunityId?: string;
  lockAccount?: boolean;
}) {
  const router = useRouter();
  const { enumerations, accounts, opportunities } = useReferenceData();
  const dialog = useDialogState(open, onOpenChange);
  const form = useForm({ resolver: zodResolver(actionItemInputSchema), defaultValues: defaults(item, accountId, opportunityId) });
  const selectedAccount = useWatch({ control: form.control, name: "accountId" });

  React.useEffect(() => {
    if (dialog.open) form.reset(defaults(item, accountId, opportunityId));
  }, [dialog.open, item, accountId, opportunityId, form]);

  const opportunityOptions = opportunities
    .filter((o) => !selectedAccount || o.accountId === selectedAccount)
    .map((o) => ({ value: o.id, label: o.name }));

  return (
    <FormDialog
      title={item ? "Edit action item" : "New action item"}
      trigger={trigger}
      open={dialog.open}
      onOpenChange={dialog.setOpen}
      form={form}
      size="lg"
      submitLabel={item ? "Save changes" : "Create"}
      onSubmit={async (values) => {
        try {
          if (item) await api("PATCH", `/api/action-items/${item.id}`, values);
          else await api("POST", "/api/action-items", values);
          toast.success(item ? "Action item updated" : "Action item created");
          dialog.setOpen(false);
          router.refresh();
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <FormGrid>
        <TextField name="title" label="Title" required autoFocus className="sm:col-span-2" />
        <SelectField
          name="accountId"
          label="Account"
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          emptyLabel="No account"
          disabled={lockAccount}
        />
        <SelectField name="opportunityId" label="Opportunity" options={opportunityOptions} emptyLabel="No opportunity" />
        <TextField name="owner" label="Owner" placeholder="Who is responsible?" />
        <DateField name="dueDate" label="Due date" />
        <SelectField name="priority" label="Priority" options={toOptions(enumerations.priorities)} />
        <SelectField
          name="status"
          label="Status"
          allowEmpty={false}
          options={ACTION_ITEM_STATUSES.map((s) => ({ value: s, label: ACTION_ITEM_STATUS_LABELS[s] }))}
        />
        <TextareaField name="description" label="Description" rows={3} className="sm:col-span-2" />
      </FormGrid>
    </FormDialog>
  );
}
