"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Note } from "@/domain/entities";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/layout-primitives";
import { LocalDateTime } from "@/components/common/local-time";
import { Markdown } from "@/components/common/markdown";
import { Pill } from "@/components/common/badges";
import { FilterSearch } from "@/components/common/url-filters";
import { NoteEditor, type NoteFormValues } from "./note-editor";
import { NoteHistorySheet } from "./note-history-sheet";

function excerpt(body: string) {
  return body.replace(/[#>*_`\-[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function NotesWorkspace({
  accountId,
  notes,
  tags,
  opportunities,
}: {
  accountId: string;
  notes: Note[];
  tags: string[];
  opportunities: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { run } = useApiAction();
  const selectedId = params.get("note");
  const activeTag = params.get("tag");
  const mode: "view" | "edit" | "new" = params.get("new") ? "new" : params.get("edit") ? "edit" : "view";
  const selected = notes.find((n) => n.id === selectedId) ?? (mode === "new" ? undefined : notes[0]);

  const navigate = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const save = async (values: NoteFormValues) => {
    try {
      if (mode === "new") {
        const created = await api<Note>("POST", "/api/notes", { ...values, accountId });
        toast.success("Note created");
        navigate({ note: created.id, new: null, edit: null });
      } else if (selected) {
        await api("PATCH", `/api/notes/${selected.id}`, values);
        toast.success("Note saved");
        navigate({ edit: null });
      }
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const opportunityName = (id: string | null) => opportunities.find((o) => o.id === id)?.name;

  return (
    <div className="grid min-h-[32rem] gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <FilterSearch placeholder="Search notes…" className="flex-1" />
          <Button size="sm" onClick={() => navigate({ new: "1", edit: null, note: null })}>
            <Plus className="size-3.5" /> New
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => navigate({ tag: activeTag === t ? null : t })}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
                  activeTag === t ? "border-brand/40 bg-brand-subtle text-brand" : "text-muted-foreground hover:text-foreground",
                )}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-xs">
          {notes.length === 0 ? (
            <EmptyState compact icon={FileText} className="m-3 border-0" title={params.get("q") || activeTag ? "No matching notes" : "No notes yet"} />
          ) : (
            <ul className="max-h-[70vh] divide-y overflow-y-auto">
              {notes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ note: n.id, edit: null, new: null })}
                    className={cn(
                      "block w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                      selected?.id === n.id && mode !== "new" && "bg-muted/70",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {n.pinned && <Pin className="size-3 shrink-0 text-brand" />}
                      <span className="truncate text-sm font-medium">{n.title}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{excerpt(n.body) || "Empty note"}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      <LocalDateTime value={n.updatedAt} relative />
                      {n.tags.length > 0 && ` · ${n.tags.map((t) => `#${t}`).join(" ")}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="min-w-0 rounded-xl border bg-card p-5 shadow-xs">
        {mode === "new" ? (
          <NoteEditor opportunities={opportunities} onSave={save} onCancel={() => navigate({ new: null })} />
        ) : !selected ? (
          <EmptyState
            icon={FileText}
            title="Capture what you learn"
            description="Notes support Markdown, code blocks, tags and links to opportunities. They are never overwritten by AI."
            action={
              <Button size="sm" onClick={() => navigate({ new: "1" })}>
                <Plus className="size-3.5" /> New note
              </Button>
            }
          />
        ) : mode === "edit" ? (
          <NoteEditor key={`${selected.id}-${selected.revision}`} note={selected} opportunities={opportunities} onSave={save} onCancel={() => navigate({ edit: null })} />
        ) : (
          <article className="space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div className="min-w-0 space-y-1.5">
                <h2 className="text-lg font-semibold tracking-tight">{selected.title}</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Updated <LocalDateTime value={selected.updatedAt} /> · v{selected.revision}
                  </span>
                  {selected.opportunityId && (
                    <Link href={`/accounts/${accountId}/discovery?opp=${selected.opportunityId}`}>
                      <Pill tone="brand">{opportunityName(selected.opportunityId) ?? "Opportunity"}</Pill>
                    </Link>
                  )}
                  {selected.tags.map((t) => (
                    <Pill key={t}>#{t}</Pill>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => run(() => api("PATCH", `/api/notes/${selected.id}`, { pinned: !selected.pinned }))}>
                  {selected.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  {selected.pinned ? "Unpin" : "Pin"}
                </Button>
                <NoteHistorySheet noteId={selected.id} currentRevision={selected.revision} />
                <Button variant="outline" size="sm" onClick={() => navigate({ edit: "1" })}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <ConfirmDialog
                  title="Delete this note?"
                  description="The note and its editing history are permanently deleted."
                  confirmLabel="Delete note"
                  onConfirm={async () => {
                    await run(() => api("DELETE", `/api/notes/${selected.id}`), { success: "Note deleted" });
                    navigate({ note: null, edit: null });
                  }}
                  trigger={
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Delete note">
                      <Trash2 className="size-3.5" />
                    </Button>
                  }
                />
              </div>
            </header>
            {selected.body.trim() ? (
              <Markdown>{selected.body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                This note is empty.{" "}
                <button type="button" className="underline" onClick={() => navigate({ edit: "1" })}>
                  Start writing
                </button>
              </p>
            )}
          </article>
        )}
      </section>
    </div>
  );
}
