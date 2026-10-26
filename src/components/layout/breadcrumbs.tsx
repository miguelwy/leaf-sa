"use client";

import * as React from "react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface Crumb {
  label: string;
  href?: string;
}

const BreadcrumbContext = React.createContext<{ crumbs: Crumb[]; setCrumbs: (c: Crumb[]) => void } | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = React.useState<Crumb[]>([]);
  const value = React.useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/** Rendered by pages to declare their breadcrumb trail in the shared header. */
export function SetBreadcrumbs({ items }: { items: Crumb[] }) {
  const ctx = React.useContext(BreadcrumbContext);
  const key = JSON.stringify(items);
  React.useEffect(() => {
    ctx?.setCrumbs(JSON.parse(key) as Crumb[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export function HeaderBreadcrumbs() {
  const ctx = React.useContext(BreadcrumbContext);
  const crumbs = ctx?.crumbs ?? [];
  if (!crumbs.length) return null;
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <React.Fragment key={`${c.label}-${i}`}>
              <BreadcrumbItem className="min-w-0">
                {last || !c.href ? (
                  <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="truncate">
                    <Link href={c.href}>{c.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
