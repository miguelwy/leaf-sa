"use client";

import * as React from "react";
import { Leaf, MessageSquareQuote, Trash2 } from "lucide-react";
import Link from "next/link";
import type { AccountFeature } from "@/domain/entities";
import { SOLUTION_FIT_STATUSES, type SolutionFitStatus } from "@/domain/enumerations";
import { api } from "@/lib/api";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Panel } from "@/components/common/layout-primitives";
import { SolutionFitStatusPill } from "@/components/common/badges";
import { useReferenceData } from "@/components/common/reference-data";

/** MongoDB features related to this customer, with a short reason and a status. */
export function FeaturesPanel({ accountId, features }: { accountId: string; features: AccountFeature[] }) {
  const { enumerations } = useReferenceData();
  const { run, pending } = useApiAction();
  const [capability, setCapability] = React.useState<string>("");
  const [why, setWhy] = React.useState("");
  const available = enumerations.mongodbCapabilities.filter((c) => !features.some((f) => f.capability === c));

  const add = async () => {
    if (!capability) return;
    const ok = await run(() => api("POST", `/api/accounts/${accountId}/features`, { capability, why: why || null }));
    if (ok !== undefined) {
      setCapability("");
      setWhy("");
    }
  };

  return (
    <Panel title="MongoDB features" description="Capabilities that fit this customer's needs.">
      <div className="space-y-3">
        {features.length === 0 ? (
          <EmptyState compact icon={Leaf} title="No features yet" />
        ) : (
          <ul className="space-y-2">
            {features.map((f) => (
              <li key={f.id} className="group rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{f.capability}</span>
                  {f.source.kind === "meeting" && (
                    <Link href={`/accounts/${accountId}/meetings/${f.source.meetingId}`} title="From a meeting" className="text-info">
                      <MessageSquareQuote className="size-4" />
                    </Link>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <Select
                      value={f.status}
                      onValueChange={(status) => run(() => api("PATCH", `/api/accounts/${accountId}/features/${f.id}`, { status }))}
                    >
                      <SelectTrigger size="sm" className="h-8 border-0 bg-transparent px-1 shadow-none" aria-label={`Status of ${f.capability}`}>
                        <SelectValue>
                          <SolutionFitStatusPill status={f.status} />
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {SOLUTION_FIT_STATUSES.map((s: SolutionFitStatus) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                      aria-label={`Remove ${f.capability}`}
                      onClick={() => run(() => api("DELETE", `/api/accounts/${accountId}/features/${f.id}`))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </div>
                {f.why && <p className="mt-1 text-sm text-muted-foreground">{f.why}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <Select value={capability || undefined} onValueChange={setCapability}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Add a feature…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {capability && (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void add()}
                placeholder="Why? (customer need)"
                className="h-10"
              />
              <Button className="h-10" onClick={add} disabled={pending}>
                Add
              </Button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
