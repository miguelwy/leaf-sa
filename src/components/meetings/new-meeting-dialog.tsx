"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { FileUp, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { optionalObjectId, optionalText, requiredText } from "@/domain/common";
import { ACCEPTED_UPLOAD_EXTENSIONS, MAX_TRANSCRIPT_CHARS, MAX_UPLOAD_BYTES, type Meeting } from "@/domain/meetings";
import { api } from "@/lib/api";
import { toDateTimeInput } from "@/lib/format";
import { toOptions } from "@/lib/options";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { applyServerErrors, DateField, FieldShell, FormGrid, SelectField, TextField } from "@/components/common/form";
import { FormDialog, useDialogState } from "@/components/common/form-dialog";
import { useReferenceData } from "@/components/common/reference-data";

const schema = z.object({
  accountId: z.string().min(1, "Choose an account"),
  opportunityId: optionalObjectId,
  title: requiredText(200),
  startsAt: z.string().min(1, "Required"),
  type: optionalText(80),
  participants: z.string().max(2000),
});

export function NewMeetingDialog({
  accountId,
  opportunityId,
  trigger,
  open,
  onOpenChange,
}: {
  accountId?: string;
  opportunityId?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const { accounts, opportunities, enumerations, ai } = useReferenceData();
  const dialog = useDialogState(open, onOpenChange);
  const [mode, setMode] = React.useState<"paste" | "upload">("paste");
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [analyze, setAnalyze] = React.useState(ai.ready);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const defaults = React.useCallback(
    () => ({
      accountId: accountId ?? "",
      opportunityId: opportunityId ?? null,
      title: "",
      startsAt: toDateTimeInput(new Date()),
      type: null,
      participants: "",
    }),
    [accountId, opportunityId],
  );
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults() });
  const selectedAccount = useWatch({ control: form.control, name: "accountId" });

  React.useEffect(() => {
    if (dialog.open) form.reset(defaults());
  }, [dialog.open, defaults, form]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setText("");
      setFile(null);
      setFileError(null);
      setMode("paste");
      setAnalyze(ai.ready);
    }
    dialog.setOpen(next);
  };

  const pickFile = (f: File | null) => {
    setFileError(null);
    if (!f) return setFile(null);
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!(ACCEPTED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
      setFileError(`Unsupported file. Accepted: ${ACCEPTED_UPLOAD_EXTENSIONS.join(", ")}`);
      return setFile(null);
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setFileError("File is larger than 10 MB");
      return setFile(null);
    }
    setFile(f);
  };

  const hasTranscript = mode === "paste" ? text.trim().length > 0 : !!file;

  return (
    <FormDialog
      title="New meeting"
      description="Add the transcript now or later. Analysis results are suggestions you review before anything changes."
      trigger={trigger}
      open={dialog.open}
      onOpenChange={handleOpenChange}
      form={form}
      size="xl"
      submitLabel={hasTranscript && analyze && ai.ready ? "Save and analyze" : "Save meeting"}
      onSubmit={async (values) => {
        if (mode === "paste" && text.length > MAX_TRANSCRIPT_CHARS) {
          form.setError("root", { message: "Transcript is too long" });
          return;
        }
        const data = {
          ...values,
          startsAt: new Date(values.startsAt).toISOString(),
          participants: values.participants
            .split(/[,\n]/)
            .map((p) => p.trim())
            .filter(Boolean),
          analyze: hasTranscript && analyze && ai.ready,
          transcriptText: mode === "paste" ? text : undefined,
        };
        const body = new FormData();
        body.set("data", JSON.stringify(data));
        if (mode === "upload" && file) body.set("file", file);
        try {
          const res = await api<{ meeting: Meeting; analysisQueued: boolean; analysisError: string | null }>("POST", "/api/meetings", body);
          if (res.analysisError) toast.warning(`Meeting saved, but analysis did not start: ${res.analysisError}`);
          else toast.success(res.analysisQueued ? "Meeting saved — analysis running" : "Meeting saved");
          dialog.setOpen(false);
          router.push(`/accounts/${res.meeting.accountId}/meetings/${res.meeting.id}`);
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <FormGrid>
        <SelectField
          name="accountId"
          label="Account"
          required
          allowEmpty={false}
          disabled={!!accountId}
          placeholder="Select an account"
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        />
        <SelectField
          name="opportunityId"
          label="Related opportunity"
          emptyLabel="Account-level / not sure"
          options={opportunities.filter((o) => o.accountId === selectedAccount).map((o) => ({ value: o.id, label: o.name }))}
        />
        <TextField name="title" label="Meeting title" required autoFocus placeholder="e.g. Technical discovery — catalog platform" />
        <DateField name="startsAt" label="Date and time" withTime required />
        <SelectField name="type" label="Meeting type" options={toOptions(enumerations.meetingTypes)} />
        <TextField name="participants" label="Participants" placeholder="Comma separated" />
      </FormGrid>

      <FieldShell label="Transcript" htmlFor="transcript-text" hint="Speaker labels and timestamps are kept. TXT, Markdown, DOCX and text-based PDF are supported.">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "paste" | "upload")} className="gap-2">
          <TabsList>
            <TabsTrigger value="paste">Paste text</TabsTrigger>
            <TabsTrigger value="upload">Upload file</TabsTrigger>
          </TabsList>
          <TabsContent value="paste">
            <Textarea
              id="transcript-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={"[00:00:05] Jane Doe: Thanks for joining…\n[00:00:12] John Roe: …"}
              className="min-h-0 font-mono text-xs leading-relaxed"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">{text.length.toLocaleString()} characters</p>
          </TabsContent>
          <TabsContent value="upload">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_UPLOAD_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors hover:bg-muted/50",
                fileError && "border-destructive/50",
              )}
            >
              <FileUp className="size-5" />
              {file ? (
                <span className="flex items-center gap-2 text-foreground">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                  <X
                    className="size-3.5 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                  />
                </span>
              ) : (
                <span>Drop a file here or click to choose (max 10 MB)</span>
              )}
            </button>
            {fileError && <p className="mt-1 text-xs text-destructive">{fileError}</p>}
          </TabsContent>
        </Tabs>
      </FieldShell>

      <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5", !ai.ready && "opacity-70")}>
        <Checkbox
          id="analyze-now"
          checked={analyze && ai.ready}
          disabled={!ai.ready || !hasTranscript}
          onCheckedChange={(v) => setAnalyze(v === true)}
          className="mt-0.5"
        />
        <div className="grid gap-0.5">
          <Label htmlFor="analyze-now" className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-3.5 text-brand" /> Analyze with AI after saving
          </Label>
          <p className="text-xs text-muted-foreground">
            {ai.ready
              ? `The transcript and account context are sent to ${ai.providerLabel}. Nothing changes until you approve suggestions.`
              : (ai.reason ?? "AI processing is off.")}
          </p>
        </div>
      </div>
    </FormDialog>
  );
}
