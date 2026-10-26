"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, X } from "lucide-react";
import { DEFAULT_ENUMERATIONS, ENUMERATION_META, enumerationUpdateSchema, type EnumerationKind } from "@/domain/enumerations";
import { api } from "@/lib/api";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Remount with a `key` derived from `values` to reset the draft after a save. */
export function EnumerationEditor({ kind, values }: { kind: EnumerationKind; values: string[] }) {
  const [draft, setDraft] = React.useState(values);
  const [newValue, setNewValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { run, pending } = useApiAction();
  const meta = ENUMERATION_META[kind];
  const dirty = JSON.stringify(draft) !== JSON.stringify(values);

  const add = () => {
    const v = newValue.trim();
    if (!v) return;
    if (draft.some((d) => d.toLowerCase() === v.toLowerCase())) {
      setError(`“${v}” already exists`);
      return;
    }
    setDraft([...draft, v]);
    setNewValue("");
    setError(null);
  };

  const move = (i: number, delta: number) => {
    const next = [...draft];
    const [item] = next.splice(i, 1);
    next.splice(i + delta, 0, item);
    setDraft(next);
  };

  const save = async () => {
    const parsed = enumerationUpdateSchema.safeParse({ kind, values: draft });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid values");
      return;
    }
    setError(null);
    await run(() => api("PUT", "/api/settings/enumerations", parsed.data), { success: `${meta.label} saved` });
  };

  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <header className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{meta.label}</h3>
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      </header>
      <div className="space-y-3 p-4">
        <ul className="space-y-1">
          {draft.map((v, i) => (
            <li key={v} className="group flex items-center gap-2 rounded-md px-2 py-1 -mx-2 hover:bg-muted/50">
              <span className="w-5 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="flex-1 truncate text-sm">{v}</span>
              <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <Button size="icon" variant="ghost" className="size-6" aria-label={`Move ${v} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={`Move ${v} down`}
                  disabled={i === draft.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 hover:text-destructive"
                  aria-label={`Remove ${v}`}
                  onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                >
                  <X className="size-3" />
                </Button>
              </div>
            </li>
          ))}
          {draft.length === 0 && <li className="text-sm text-muted-foreground italic">No values</li>}
        </ul>
        <div className="flex gap-2">
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add value…"
            className="h-8"
            maxLength={80}
          />
          <Button variant="outline" size="sm" onClick={add}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => setDraft(DEFAULT_ENUMERATIONS[kind])} className="text-muted-foreground">
            <RotateCcw className="size-3.5" /> Defaults
          </Button>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(values)}>
                Discard
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={!dirty || pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
