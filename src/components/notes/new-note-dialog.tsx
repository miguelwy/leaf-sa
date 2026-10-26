"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { requiredText } from "@/domain/common";
import type { Note } from "@/domain/entities";
import { api } from "@/lib/api";
import { applyServerErrors, SelectField, TextField } from "@/components/common/form";
import { FormDialog, useDialogState } from "@/components/common/form-dialog";
import { useReferenceData } from "@/components/common/reference-data";

const schema = z.object({ accountId: z.string().min(1, "Choose an account"), title: requiredText(200) });

/** Quick-create entry point: pick the account, then continue in the notes workspace. */
export function NewNoteDialog({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const router = useRouter();
  const { accounts } = useReferenceData();
  const dialog = useDialogState(open, onOpenChange);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { accountId: "", title: "" } });

  React.useEffect(() => {
    if (dialog.open) form.reset({ accountId: "", title: "" });
  }, [dialog.open, form]);

  return (
    <FormDialog
      title="New SA note"
      description="Notes are yours: AI never overwrites them."
      open={dialog.open}
      onOpenChange={dialog.setOpen}
      form={form}
      submitLabel="Create and open"
      onSubmit={async (values) => {
        try {
          const note = await api<Note>("POST", "/api/notes", { ...values, body: "", tags: [] });
          dialog.setOpen(false);
          router.push(`/accounts/${values.accountId}/notes?note=${note.id}&edit=1`);
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <SelectField
        name="accountId"
        label="Account"
        required
        allowEmpty={false}
        placeholder={accounts.length ? "Select an account" : "Create an account first"}
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
      />
      <TextField name="title" label="Title" required placeholder="e.g. Technical discovery — data platform" />
    </FormDialog>
  );
}
