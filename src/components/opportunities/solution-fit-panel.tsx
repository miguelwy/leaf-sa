"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Lightbulb, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { solutionFitInputSchema, type SolutionFitEntry } from "@/domain/entities";
import { SOLUTION_FIT_STATUSES } from "@/domain/enumerations";
import { api } from "@/lib/api";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SolutionFitStatusPill } from "@/components/common/badges";
import { applyServerErrors, FormGrid, SelectField, TextareaField } from "@/components/common/form";
import { toOptions } from "@/lib/options";
import { FormDialog } from "@/components/common/form-dialog";
import { EmptyState } from "@/components/common/layout-primitives";
import { Markdown } from "@/components/common/markdown";
import { useReferenceData } from "@/components/common/reference-data";

const DETAIL_FIELDS = [
  ["proposedSolution", "Proposed solution"],
  ["justification", "Technical justification"],
  ["businessValue", "Expected business value"],
  ["limitations", "Known limitations"],
  ["validation", "Required validation"],
] as const;

function defaults(e?: SolutionFitEntry) {
  return {
    capability: e?.capability ?? "",
    problem: e?.problem ?? "",
    proposedSolution: e?.proposedSolution ?? "",
    justification: e?.justification ?? "",
    businessValue: e?.businessValue ?? "",
    limitations: e?.limitations ?? "",
    validation: e?.validation ?? "",
    status: e?.status ?? ("Identified" as const),
  };
}

function SolutionFitDialog({
  opportunityId,
  entry,
  open,
  onOpenChange,
}: {
  opportunityId: string;
  entry?: SolutionFitEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { enumerations } = useReferenceData();
  const form = useForm({ resolver: zodResolver(solutionFitInputSchema), defaultValues: defaults(entry) });
  React.useEffect(() => {
    if (open) form.reset(defaults(entry));
  }, [open, entry, form]);

  return (
    <FormDialog
      title={entry ? `Edit ${entry.capability}` : "Add capability"}
      description="Record a capability only when it addresses a requirement you have discovered."
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      size="lg"
      submitLabel={entry ? "Save changes" : "Add"}
      onSubmit={async (values) => {
        try {
          if (entry) await api("PATCH", `/api/opportunities/${opportunityId}/solution-fit/${entry.id}`, values);
          else await api("POST", `/api/opportunities/${opportunityId}/solution-fit`, values);
          toast.success(entry ? "Solution fit updated" : "Capability added");
          onOpenChange(false);
          router.refresh();
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <FormGrid>
        <SelectField
          name="capability"
          label="Capability"
          required
          allowEmpty={false}
          options={toOptions(enumerations.mongodbCapabilities)}
          placeholder="Select a capability"
        />
        <SelectField name="status" label="Status" allowEmpty={false} options={toOptions(SOLUTION_FIT_STATUSES)} />
        <TextareaField name="problem" label="Customer problem addressed" required rows={2} className="sm:col-span-2" />
        {DETAIL_FIELDS.map(([key, label]) => (
          <TextareaField key={key} name={key} label={label} rows={2} className="sm:col-span-2" />
        ))}
      </FormGrid>
    </FormDialog>
  );
}

export function SolutionFitPanel({ opportunityId, entries }: { opportunityId: string; entries: SolutionFitEntry[] }) {
  const [editing, setEditing] = React.useState<SolutionFitEntry | "new" | null>(null);
  const { run } = useApiAction();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">MongoDB capabilities under consideration, each tied to a discovered customer problem.</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" /> Add capability
        </Button>
      </div>
      {entries.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No capabilities recorded"
          description="Add a capability once discovery shows a requirement it addresses."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {entries.map((e) => (
            <article key={e.id} className="rounded-xl border bg-card shadow-xs">
              <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{e.capability}</h3>
                  <SolutionFitStatusPill status={e.status} />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${e.capability}`}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(e)}>
                      <Pencil className="size-4" /> Edit
                    </DropdownMenuItem>
                    {SOLUTION_FIT_STATUSES.filter((s) => s !== e.status).map((s) => (
                      <DropdownMenuItem
                        key={s}
                        onSelect={() => run(() => api("PATCH", `/api/opportunities/${opportunityId}/solution-fit/${e.id}`, { status: s }))}
                      >
                        Mark {s.toLowerCase()}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => run(() => api("DELETE", `/api/opportunities/${opportunityId}/solution-fit/${e.id}`), { success: "Removed" })}
                    >
                      <Trash2 className="size-4" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </header>
              <dl className="space-y-3 p-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Customer problem addressed</dt>
                  <dd className="mt-0.5">
                    <Markdown>{e.problem}</Markdown>
                  </dd>
                </div>
                {DETAIL_FIELDS.map(([key, label]) =>
                  e[key] ? (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5">
                        <Markdown>{e[key] as string}</Markdown>
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </article>
          ))}
        </div>
      )}
      <SolutionFitDialog
        opportunityId={opportunityId}
        entry={editing && editing !== "new" ? editing : undefined}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </div>
  );
}
