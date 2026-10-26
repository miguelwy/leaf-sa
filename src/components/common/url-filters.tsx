"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Option } from "@/lib/options";

const ALL = "__all__";

/** Reads/writes filter values in the URL so filtered views are linkable and server-rendered. */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return { params, set };
}

export function FilterSelect({
  param,
  label,
  options,
  allLabel,
  className = "w-44",
}: {
  param: string;
  label: string;
  options: Option[];
  allLabel?: string;
  className?: string;
}) {
  const { params, set } = useUrlFilters();
  const value = params.get(param) ?? ALL;
  return (
    <Select value={value} onValueChange={(v) => set(param, v === ALL ? null : v)}>
      <SelectTrigger size="sm" className={className} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel ?? `All ${label.toLowerCase()}`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterSearch({ param = "q", placeholder = "Filter…", className = "w-56" }: { param?: string; placeholder?: string; className?: string }) {
  const { params, set } = useUrlFilters();
  const [value, setValue] = React.useState(params.get(param) ?? "");
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get(param) ?? "") !== value.trim()) set(param, value.trim() || null);
    }, 250);
    return () => clearTimeout(t);
  }, [value, param, params, set]);
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="h-7 pl-8 text-sm" />
    </div>
  );
}

export function ClearFilters({ params: keys }: { params: string[] }) {
  const { params } = useUrlFilters();
  const router = useRouter();
  const pathname = usePathname();
  if (!keys.some((k) => params.get(k))) return null;
  return (
    <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
      <X className="size-3.5" /> Clear
    </Button>
  );
}
