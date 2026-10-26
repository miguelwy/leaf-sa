"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, CircleHelp, MessageSquareQuote, Pencil, Plus, Trash2, X } from "lucide-react";
import type { DiscoveryFieldDef, DiscoveryItem, DiscoveryItemInput } from "@/domain/discovery";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Pill } from "@/components/common/badges";
import { Markdown } from "@/components/common/markdown";
import { MermaidDiagram } from "./mermaid-diagram";

function toInputs(items: DiscoveryItem[]): DiscoveryItemInput[] {
  return items.map((i) => ({ id: i.id, text: i.text, status: i.status }));
}

/** Provenance badge linking an AI-approved value back to the meeting it came from. */
function SourceBadge({ item }: { item: DiscoveryItem }) {
  const pathname = usePathname();
  if (item.source.kind !== "meeting") return null;
  const accountId = pathname.match(/^\/accounts\/([a-f\d]{24})/i)?.[1];
  const pill = (
    <Pill tone="info">
      <MessageSquareQuote className="size-3" /> Meeting
    </Pill>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {accountId ? (
          <Link href={`/accounts/${accountId}/meetings/${item.source.meetingId}`} className="inline-flex" onClick={(e) => e.stopPropagation()}>
            {pill}
          </Link>
        ) : (
          <span className="inline-flex">{pill}</span>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{item.source.excerpt ? `“${item.source.excerpt}”` : "Extracted from a meeting transcript"}</TooltipContent>
    </Tooltip>
  );
}

/** Ctrl/⌘+Enter saves, Escape cancels. */
function onEditorKeys(e: React.KeyboardEvent, save: () => void, cancel: () => void) {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    save();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancel();
  }
}

/**
 * Inline editor for one discovery field. Saves the full item list for the field;
 * the server keeps each item's provenance by id.
 */
export function DiscoveryFieldEditor({
  def,
  items,
  endpoint,
}: {
  def: DiscoveryFieldDef;
  items: DiscoveryItem[];
  /** PUT endpoint that accepts `{ items }`. */
  endpoint: string;
}) {
  const { run, pending } = useApiAction();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const save = async (next: DiscoveryItemInput[]) => {
    const ok = await run(() => api("PUT", endpoint, { items: next }));
    if (ok !== undefined) {
      setEditingId(null);
      setAdding(false);
      setDraft("");
    }
  };

  const startEdit = (item: DiscoveryItem) => {
    setAdding(false);
    setEditingId(item.id);
    setDraft(item.text);
  };

  const cancel = () => {
    setEditingId(null);
    setAdding(false);
    setDraft("");
  };

  const commitEdit = () => {
    const text = draft.trim();
    if (!editingId) return;
    const next = toInputs(items)
      .map((i) => (i.id === editingId ? { ...i, text } : i))
      .filter((i) => i.text);
    void save(next);
  };

  const commitAdd = () => {
    const text = draft.trim();
    if (!text) return cancel();
    void save([...toInputs(items), { text, status: "confirmed" }]);
  };

  const single = def.kind !== "list";
  const isEmpty = items.length === 0;

  const editor = (onCommit: () => void, placeholder?: string) => (
    <div className="space-y-2">
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => onEditorKeys(e, onCommit, cancel)}
        rows={def.kind === "list" ? 2 : 8}
        placeholder={placeholder}
        className={cn("min-h-0 text-sm", def.kind === "mermaid" && "font-mono text-xs")}
      />
      <div className="flex items-center gap-2">
        <Button size="xs" onClick={onCommit} disabled={pending}>
          <Check className="size-3" /> Save
        </Button>
        <Button size="xs" variant="ghost" onClick={cancel} disabled={pending}>
          Cancel
        </Button>
        <span className="text-[11px] text-muted-foreground">Ctrl+Enter to save · Esc to cancel</span>
      </div>
    </div>
  );

  return (
    <div className="grid gap-1.5 py-2.5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
      <div className="flex items-start gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{def.label}</span>
        {def.hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <CircleHelp className="mt-px size-3 text-muted-foreground/70" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{def.hint}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="min-w-0 space-y-1.5">
        {single ? (
          editingId !== null || adding ? (
            editor(
              adding ? commitAdd : commitEdit,
              def.kind === "mermaid" ? "flowchart LR\n  App --> Atlas[(MongoDB Atlas)]" : "Markdown supported",
            )
          ) : isEmpty ? (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setDraft("");
              }}
              className="text-left text-sm text-muted-foreground/80 italic hover:text-foreground"
            >
              Unknown — click to add
            </button>
          ) : (
            <div className="group relative rounded-lg border bg-muted/20 p-3">
              {def.kind === "mermaid" ? <MermaidDiagram source={items[0].text} /> : <Markdown>{items[0].text}</Markdown>}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <SourceBadge item={items[0]} />
                <Button size="icon" variant="outline" className="size-6" aria-label="Edit" onClick={() => startEdit(items[0])}>
                  <Pencil className="size-3" />
                </Button>
                <Button size="icon" variant="outline" className="size-6" aria-label="Clear" onClick={() => void save([])}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          )
        ) : (
          <>
            <ul className="space-y-1">
              {items.map((item) =>
                editingId === item.id ? (
                  <li key={item.id}>{editor(commitEdit)}</li>
                ) : (
                  <li
                    key={item.id}
                    className={cn(
                      "group flex items-start gap-2 rounded-md px-2 py-1 -mx-2 hover:bg-muted/50",
                      item.status === "tentative" && "text-muted-foreground",
                    )}
                  >
                    <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", item.status === "tentative" ? "border border-warning" : "bg-brand")} />
                    <span className="min-w-0 flex-1 text-sm whitespace-pre-wrap">{item.text}</span>
                    {item.status === "tentative" && <Pill tone="warning">Tentative</Pill>}
                    <SourceBadge item={item} />
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            aria-label={item.status === "tentative" ? "Mark as confirmed" : "Mark as tentative"}
                            onClick={() =>
                              void save(
                                toInputs(items).map((i) =>
                                  i.id === item.id ? { ...i, status: item.status === "tentative" ? "confirmed" : "tentative" } : i,
                                ),
                              )
                            }
                          >
                            {item.status === "tentative" ? <Check className="size-3" /> : <CircleHelp className="size-3" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{item.status === "tentative" ? "Mark as confirmed" : "Mark as tentative"}</TooltipContent>
                      </Tooltip>
                      <Button size="icon" variant="ghost" className="size-6" aria-label="Edit" onClick={() => startEdit(item)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        aria-label="Remove"
                        onClick={() => void save(toInputs(items).filter((i) => i.id !== item.id))}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  </li>
                ),
              )}
            </ul>
            {adding ? (
              editor(commitAdd, "Add a value…")
            ) : isEmpty ? (
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  setDraft("");
                }}
                className="text-left text-sm text-muted-foreground/80 italic hover:text-foreground"
              >
                Unknown — click to add
              </button>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                className="-ml-2 h-5 text-muted-foreground opacity-60 hover:opacity-100"
                onClick={() => {
                  setEditingId(null);
                  setAdding(true);
                  setDraft("");
                }}
              >
                <Plus className="size-3" /> Add
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
