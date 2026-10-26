"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { noteInputSchema, type Note } from "@/domain/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FieldShell, Form, SelectField, TextField } from "@/components/common/form";
import { Markdown } from "@/components/common/markdown";

export type NoteFormValues = {
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  opportunityId: string | null;
};

function defaults(note?: Note): NoteFormValues {
  return {
    title: note?.title ?? "",
    body: note?.body ?? "",
    tags: note?.tags ?? [],
    pinned: note?.pinned ?? false,
    opportunityId: note?.opportunityId ?? null,
  };
}

/** Markdown note editor with write/preview tabs. Ctrl/⌘+S saves. */
export function NoteEditor({
  note,
  opportunities,
  onSave,
  onCancel,
}: {
  note?: Note;
  opportunities: { id: string; name: string }[];
  onSave: (values: NoteFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm({ resolver: zodResolver(noteInputSchema), defaultValues: defaults(note) });
  const formRef = React.useRef<HTMLDivElement>(null);
  const [tagDraft, setTagDraft] = React.useState((note?.tags ?? []).join(", "));

  const submit = form.handleSubmit(async (values) => onSave(values as NoteFormValues));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && formRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  return (
    <div ref={formRef}>
      <Form form={form} onSubmit={(values) => onSave(values as NoteFormValues)} className="space-y-3">
        <TextField name="title" label="Title" required autoFocus={!note} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldShell label="Tags" htmlFor="note-tags" hint="Comma separated, e.g. discovery, search">
            <Input
              id="note-tags"
              value={tagDraft}
              onChange={(e) => {
                setTagDraft(e.target.value);
                form.setValue(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                  { shouldDirty: true },
                );
              }}
            />
          </FieldShell>
          <SelectField
            name="opportunityId"
            label="Linked opportunity"
            options={opportunities.map((o) => ({ value: o.id, label: o.name }))}
            emptyLabel="Account-level note"
          />
        </div>
        <Controller
          control={form.control}
          name="body"
          render={({ field }) => (
            <Tabs defaultValue="write" className="gap-2">
              <TabsList>
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="write">
                <Textarea
                  {...field}
                  rows={18}
                  placeholder={"# Meeting notes\n\n- Pain point…\n\n```js\ndb.orders.find({ status: \"open\" })\n```"}
                  className="min-h-[18rem] resize-y font-mono text-[13px] leading-relaxed"
                />
              </TabsContent>
              <TabsContent value="preview">
                <div className="min-h-[18rem] rounded-lg border p-4">
                  {field.value?.trim() ? <Markdown>{field.value}</Markdown> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}
                </div>
              </TabsContent>
            </Tabs>
          )}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : note ? "Save note" : "Create note"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={form.formState.isSubmitting}>
            Cancel
          </Button>
          <span className="text-[11px] text-muted-foreground">Ctrl+S to save · Markdown & code blocks supported</span>
        </div>
      </Form>
    </div>
  );
}
