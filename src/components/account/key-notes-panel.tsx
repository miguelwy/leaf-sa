"use client";

import * as React from "react";
import Link from "next/link";
import { Check, MessageSquareQuote, Pencil, StickyNote, Trash2, X } from "lucide-react";
import type { KeyNote } from "@/domain/entities";
import { api } from "@/lib/api";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Panel } from "@/components/common/layout-primitives";

const PREVIEW = 8;

/** Flat list of important facts about the account; replaces the old structured discovery. */
export function KeyNotesPanel({ accountId, notes }: { accountId: string; notes: KeyNote[] }) {
  const { run, pending } = useApiAction();
  const [draft, setDraft] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; text: string } | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? notes : notes.slice(0, PREVIEW);

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    const ok = await run(() => api("POST", `/api/accounts/${accountId}/key-notes`, { text }));
    if (ok !== undefined) setDraft("");
  };

  return (
    <Panel title="Key notes" description="Important facts about this customer, one per line.">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void add();
              }
            }}
            rows={1}
            placeholder="Add a key note and press Enter… (e.g. Catalog runs on PostgreSQL 13, 2 TB)"
            className="min-h-10 resize-none"
          />
          <Button onClick={add} disabled={pending || !draft.trim()}>
            Add
          </Button>
        </div>

        {notes.length === 0 ? (
          <EmptyState compact icon={StickyNote} title="No key notes yet" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {visible.map((n) =>
              editing?.id === n.id ? (
                <li key={n.id} className="space-y-2 p-3">
                  <Textarea autoFocus value={editing.text} onChange={(e) => setEditing({ id: n.id, text: e.target.value })} rows={3} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={pending || !editing.text.trim()}
                      onClick={async () => {
                        const ok = await run(() => api("PATCH", `/api/accounts/${accountId}/key-notes/${n.id}`, { text: editing.text }));
                        if (ok !== undefined) setEditing(null);
                      }}
                    >
                      <Check className="size-3.5" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      <X className="size-3.5" /> Cancel
                    </Button>
                  </div>
                </li>
              ) : (
                <li key={n.id} className="group flex items-start gap-3 px-3 py-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                  <p className="min-w-0 flex-1 whitespace-pre-wrap">{n.text}</p>
                  {n.source.kind === "meeting" && (
                    <Link
                      href={`/accounts/${accountId}/meetings/${n.source.meetingId}`}
                      title={n.source.excerpt ? `“${n.source.excerpt}”` : "From a meeting"}
                      className="mt-0.5 shrink-0 text-info hover:opacity-80"
                    >
                      <MessageSquareQuote className="size-4" />
                    </Link>
                  )}
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button size="icon" variant="ghost" className="size-8" aria-label="Edit note" onClick={() => setEditing({ id: n.id, text: n.text })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 hover:text-destructive"
                      aria-label="Delete note"
                      onClick={() => run(() => api("DELETE", `/api/accounts/${accountId}/key-notes/${n.id}`))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
        {notes.length > PREVIEW && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show less" : `Show all ${notes.length}`}
          </Button>
        )}
      </div>
    </Panel>
  );
}
