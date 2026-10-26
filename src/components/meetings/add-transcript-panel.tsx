"use client";

import * as React from "react";
import { FileUp } from "lucide-react";
import { ACCEPTED_UPLOAD_EXTENSIONS } from "@/domain/meetings";
import { api } from "@/lib/api";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/common/layout-primitives";

/** Adds or replaces the transcript of an existing meeting (paste or file). */
export function AddTranscriptPanel({ meetingId, replacing = false, onDone }: { meetingId: string; replacing?: boolean; onDone?: () => void }) {
  const [text, setText] = React.useState("");
  const fileInput = React.useRef<HTMLInputElement>(null);
  const { run, pending } = useApiAction();

  const submit = async (body: FormData | { transcriptText: string }) => {
    const res = await run(() => api("PUT", `/api/meetings/${meetingId}/transcript`, body), { success: "Transcript saved" });
    if (res !== undefined) {
      setText("");
      onDone?.();
    }
  };

  return (
    <Panel title={replacing ? "Replace transcript" : "Add the transcript"} description="Paste text, or upload TXT, Markdown, DOCX or a text-based PDF.">
      <div className="space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={"[00:00:05] Jane Doe: Thanks for joining…"}
          className="min-h-0 font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={pending || !text.trim()} onClick={() => submit({ transcriptText: text })}>
            Save pasted text
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_UPLOAD_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const body = new FormData();
              body.set("file", f);
              void submit(body);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" disabled={pending} onClick={() => fileInput.current?.click()}>
            <FileUp className="size-3.5" /> Upload file
          </Button>
          {onDone && (
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
