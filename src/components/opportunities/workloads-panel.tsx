"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Boxes, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WORKLOAD_REQUIREMENT_FIELDS, workloadInputSchema, type Workload, type WorkloadInput } from "@/domain/entities";
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
import { applyServerErrors, FormGrid, TextareaField, TextField } from "@/components/common/form";
import { FormDialog } from "@/components/common/form-dialog";
import { DefinitionList, EmptyState, Panel } from "@/components/common/layout-primitives";
import { Markdown } from "@/components/common/markdown";

function defaults(w?: Workload): WorkloadInput {
  return {
    name: w?.name ?? "",
    description: w?.description ?? "",
    notes: w?.notes ?? "",
    ...Object.fromEntries(WORKLOAD_REQUIREMENT_FIELDS.map(([key]) => [key, w?.[key] ?? ""])),
  };
}

function WorkloadDialog({
  opportunityId,
  workload,
  open,
  onOpenChange,
}: {
  opportunityId: string;
  workload?: Workload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(workloadInputSchema), defaultValues: defaults(workload) });
  React.useEffect(() => {
    if (open) form.reset(defaults(workload));
  }, [open, workload, form]);

  return (
    <FormDialog
      title={workload ? "Edit workload" : "New workload"}
      description="Each workload carries its own technical requirements. Leave unknowns empty."
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      size="lg"
      submitLabel={workload ? "Save changes" : "Add workload"}
      onSubmit={async (values) => {
        try {
          if (workload) await api("PATCH", `/api/workloads/${workload.id}`, values);
          else await api("POST", "/api/workloads", { ...values, opportunityId });
          toast.success(workload ? "Workload updated" : "Workload added");
          onOpenChange(false);
          router.refresh();
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <FormGrid>
        <TextField name="name" label="Workload name" required autoFocus className="sm:col-span-2" placeholder="e.g. Product catalog API" />
        <TextareaField name="description" label="Description" rows={2} className="sm:col-span-2" />
        {WORKLOAD_REQUIREMENT_FIELDS.map(([key, label]) => (
          <TextField key={key} name={key} label={label} />
        ))}
        <TextareaField name="notes" label="Notes" rows={2} className="sm:col-span-2" />
      </FormGrid>
    </FormDialog>
  );
}

export function WorkloadsPanel({ opportunityId, workloads }: { opportunityId: string; workloads: Workload[] }) {
  const [editing, setEditing] = React.useState<Workload | "new" | null>(null);
  const { run } = useApiAction();

  return (
    <Panel
      title="Workloads"
      description="Workloads within this opportunity, each with independent requirements"
      bodyClassName="p-0"
      actions={
        <Button variant="ghost" size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" /> Add workload
        </Button>
      }
    >
      {workloads.length === 0 ? (
        <EmptyState compact icon={Boxes} className="m-4" title="No workloads yet" />
      ) : (
        <ul className="divide-y">
          {workloads.map((w) => (
            <li key={w.id} className="space-y-3 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{w.name}</p>
                  {w.description && <p className="text-xs text-muted-foreground">{w.description}</p>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${w.name}`}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(w)}>
                      <Pencil className="size-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => run(() => api("DELETE", `/api/workloads/${w.id}`), { success: "Workload removed" })}
                    >
                      <Trash2 className="size-4" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <DefinitionList
                className="sm:grid-cols-3"
                items={WORKLOAD_REQUIREMENT_FIELDS.map(([key, label]) => ({ label, value: w[key] }))}
              />
              {w.notes && <Markdown className="text-xs text-muted-foreground">{w.notes}</Markdown>}
            </li>
          ))}
        </ul>
      )}
      <WorkloadDialog
        opportunityId={opportunityId}
        workload={editing && editing !== "new" ? editing : undefined}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </Panel>
  );
}
