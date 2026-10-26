"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { OpportunityListItem } from "@/domain/entities";
import { ClassificationPills } from "@/components/common/badges";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Selects the opportunity in focus for per-opportunity tabs via `?opp=`. */
export function OpportunityPicker({ opportunities, selectedId }: { opportunities: OpportunityListItem[]; selectedId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = opportunities.find((o) => o.id === selectedId);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground">Opportunity</span>
      <Select
        value={selectedId}
        onValueChange={(id) => {
          const next = new URLSearchParams(params.toString());
          next.set("opp", id);
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
      >
        <SelectTrigger size="sm" className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opportunities.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && <ClassificationPills salesMotion={selected.salesMotion} tigerRoute={selected.tigerRoute} stage={selected.stage} />}
    </div>
  );
}
