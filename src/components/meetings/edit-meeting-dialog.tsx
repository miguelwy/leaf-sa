"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { optionalObjectId, optionalText, requiredText } from "@/domain/common";
import type { Meeting } from "@/domain/meetings";
import { api } from "@/lib/api";
import { toDateTimeInput } from "@/lib/format";
import { toOptions } from "@/lib/options";
import { applyServerErrors, DateField, FormGrid, SelectField, TextareaField, TextField } from "@/components/common/form";
import { FormDialog } from "@/components/common/form-dialog";
import { useReferenceData } from "@/components/common/reference-data";

const schema = z.object({
  title: requiredText(200),
  startsAt: z.string().min(1, "Required"),
  type: optionalText(80),
  participants: z.string().max(2000),
  opportunityId: optionalObjectId,
  summary: optionalText(20000),
});

function defaults(m: Meeting) {
  return {
    title: m.title,
    startsAt: toDateTimeInput(m.startsAt),
    type: m.type,
    participants: m.participants.join(", "),
    opportunityId: m.opportunityId,
    summary: m.summary ?? "",
  };
}

export function EditMeetingDialog({ meeting, open, onOpenChange }: { meeting: Meeting; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { enumerations, opportunities } = useReferenceData();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults(meeting) });
  React.useEffect(() => {
    if (open) form.reset(defaults(meeting));
  }, [open, meeting, form]);

  return (
    <FormDialog
      title="Edit meeting"
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      size="lg"
      submitLabel="Save changes"
      onSubmit={async (values) => {
        try {
          await api("PATCH", `/api/meetings/${meeting.id}`, {
            ...values,
            startsAt: new Date(values.startsAt).toISOString(),
            participants: values.participants
              .split(/[,\n]/)
              .map((p) => p.trim())
              .filter(Boolean),
          });
          toast.success("Meeting updated");
          onOpenChange(false);
          router.refresh();
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <FormGrid>
        <TextField name="title" label="Title" required className="sm:col-span-2" />
        <DateField name="startsAt" label="Date and time" withTime required />
        <SelectField name="type" label="Meeting type" options={toOptions(enumerations.meetingTypes)} />
        <SelectField
          name="opportunityId"
          label="Related opportunity"
          emptyLabel="Account-level"
          options={opportunities.filter((o) => o.accountId === meeting.accountId).map((o) => ({ value: o.id, label: o.name }))}
        />
        <TextField name="participants" label="Participants" placeholder="Comma separated" />
        <TextareaField name="summary" label="Meeting summary" rows={5} className="sm:col-span-2" hint="AI-generated summaries can be edited; re-analysis never overwrites your edits." />
      </FormGrid>
    </FormDialog>
  );
}
