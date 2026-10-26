"use client";

import * as React from "react";
import { History, Loader2 } from "lucide-react";
import type { NoteRevision } from "@/domain/entities";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LocalDateTime } from "@/components/common/local-time";
import { Markdown } from "@/components/common/markdown";

/** Read-only list of previous versions of a note, newest first. */
export function NoteHistorySheet({ noteId, currentRevision }: { noteId: string; currentRevision: number }) {
  const [open, setOpen] = React.useState(false);
  const [revisions, setRevisions] = React.useState<NoteRevision[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<NoteRevision[]>("GET", `/api/notes/${noteId}/revisions`)
      .then((r) => !cancelled && setRevisions(r))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [open, noteId, currentRevision]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" disabled={currentRevision <= 1} title={currentRevision <= 1 ? "No previous versions" : undefined}>
          <History className="size-3.5" /> History
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Editing history</SheetTitle>
          <SheetDescription>Current version is v{currentRevision}. Previous versions are kept read-only.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!revisions && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          )}
          {revisions?.map((r) => (
            <details key={r.id} className="rounded-lg border">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium">
                  v{r.revision} · {r.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  <LocalDateTime value={r.editedAt} />
                </span>
              </summary>
              <div className="border-t p-3">
                {r.body.trim() ? <Markdown>{r.body}</Markdown> : <p className="text-sm text-muted-foreground">Empty</p>}
              </div>
            </details>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
