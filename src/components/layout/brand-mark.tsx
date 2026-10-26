import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-xs">
        <Leaf className="size-4" />
      </span>
      {showName && <span className="text-sm font-semibold tracking-tight">SA Workspace</span>}
    </span>
  );
}
