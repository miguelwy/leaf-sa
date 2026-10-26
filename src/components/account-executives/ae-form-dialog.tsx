"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { accountExecutiveInputSchema, type AccountExecutive } from "@/domain/entities";
import { api } from "@/lib/api";
import { applyServerErrors, FormGrid, TextareaField, TextField } from "@/components/common/form";
import { FormDialog, useDialogState } from "@/components/common/form-dialog";

function defaults(ae?: AccountExecutive) {
  return {
    name: ae?.name ?? "",
    email: ae?.email ?? "",
    territory: ae?.territory ?? "",
    region: ae?.region ?? "",
    notes: ae?.notes ?? "",
  };
}

export function AeFormDialog({
  ae,
  trigger,
  open,
  onOpenChange,
}: {
  ae?: AccountExecutive;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const dialog = useDialogState(open, onOpenChange);
  const form = useForm({ resolver: zodResolver(accountExecutiveInputSchema), defaultValues: defaults(ae) });

  React.useEffect(() => {
    if (dialog.open) form.reset(defaults(ae));
  }, [dialog.open, ae, form]);

  return (
    <FormDialog
      title={ae ? "Edit account executive" : "New account executive"}
      trigger={trigger}
      open={dialog.open}
      onOpenChange={dialog.setOpen}
      form={form}
      submitLabel={ae ? "Save changes" : "Create"}
      onSubmit={async (values) => {
        try {
          if (ae) await api("PATCH", `/api/account-executives/${ae.id}`, values);
          else await api("POST", "/api/account-executives", values);
          toast.success(ae ? "Account executive updated" : "Account executive created");
          dialog.setOpen(false);
          router.refresh();
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <FormGrid>
        <TextField name="name" label="Name" required autoFocus />
        <TextField name="email" label="Email" type="email" />
        <TextField name="territory" label="Territory" placeholder="e.g. Enterprise North" />
        <TextField name="region" label="Region" placeholder="e.g. EMEA" />
        <TextareaField name="notes" label="Notes" rows={3} className="sm:col-span-2" />
      </FormGrid>
    </FormDialog>
  );
}
