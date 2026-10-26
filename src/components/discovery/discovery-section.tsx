"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { completeness, DISCOVERY_GROUPS, fieldsForGroup, type DiscoveryGroup, type DiscoveryValues } from "@/domain/discovery";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DiscoveryFieldEditor } from "./discovery-field-editor";

/** Collapsible group of discovery fields with a completeness counter. */
export function DiscoverySection({
  group,
  values,
  endpointBase,
  defaultOpen = true,
  title,
  description,
}: {
  group: DiscoveryGroup;
  values: DiscoveryValues;
  /** e.g. `/api/opportunities/:id/discovery` — the field key is appended. */
  endpointBase: string;
  defaultOpen?: boolean;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const fields = fieldsForGroup(group);
  const { filled, total } = completeness(values, [group]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border bg-card shadow-xs">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title ?? DISCOVERY_GROUPS[group].label}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {filled}/{total} confirmed
            </span>
          )}
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y border-t px-4">
          {fields.map((def) => (
            <DiscoveryFieldEditor key={def.key} def={def} items={values[def.key] ?? []} endpoint={`${endpointBase}/${def.key}`} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
