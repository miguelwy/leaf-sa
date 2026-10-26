"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ListChecks, MessageSquareQuote, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ActionItemListItem } from "@/domain/entities";
import { ACTION_ITEM_STATUSES, ACTION_ITEM_STATUS_LABELS, type ActionItemStatus } from "@/domain/enumerations";
import { api } from "@/lib/api";
import { daysUntil, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionStatusPill, Pill, PriorityPill } from "@/components/common/badges";
import { EmptyState } from "@/components/common/layout-primitives";
import { useReferenceData } from "@/components/common/reference-data";
import { ActionItemFormDialog } from "./action-item-form-dialog";

function DueCell({ dueDate, status }: { dueDate: Date | null; status: ActionItemStatus }) {
  if (!dueDate) return <span className="text-muted-foreground">—</span>;
  const days = daysUntil(dueDate) ?? 0;
  const open = status !== "done";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("tabular-nums", open && days < 0 && "font-medium text-destructive")}>{formatDateOnly(dueDate, "MMM d")}</span>
      {open && days < 0 && <Pill tone="danger">Overdue</Pill>}
      {open && days >= 0 && days <= 2 && <Pill tone="warning">{days === 0 ? "Today" : days === 1 ? "Tomorrow" : "Soon"}</Pill>}
    </span>
  );
}

export function ActionItemsTable({
  items,
  showAccount = true,
  emptyTitle = "No action items",
}: {
  items: ActionItemListItem[];
  showAccount?: boolean;
  emptyTitle?: string;
}) {
  const { enumerations } = useReferenceData();
  const { run } = useApiAction();
  const [editing, setEditing] = React.useState<ActionItemListItem | null>(null);

  if (items.length === 0) return <EmptyState icon={ListChecks} title={emptyTitle} />;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-10" />
            <TableHead>Action item</TableHead>
            {showAccount && <TableHead>Account</TableHead>}
            <TableHead>Owner</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const done = item.status === "done";
            return (
              <TableRow key={item.id} className={cn(done && "text-muted-foreground")}>
                <TableCell>
                  <button
                    type="button"
                    aria-label={done ? "Reopen" : "Mark as done"}
                    onClick={() => run(() => api("PATCH", `/api/action-items/${item.id}`, { status: done ? "todo" : "done" }))}
                    className={cn(
                      "flex size-4 items-center justify-center rounded border transition-colors",
                      done ? "border-success bg-success text-white" : "border-input hover:border-foreground",
                    )}
                  >
                    {done && <Check className="size-3" />}
                  </button>
                </TableCell>
                <TableCell className="max-w-96">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("truncate font-medium", done && "line-through")}>{item.title}</span>
                    {item.source.kind === "meeting" && (
                      <MessageSquareQuote className="size-3.5 shrink-0 text-info" aria-label="From a meeting" />
                    )}
                  </div>
                  {(item.opportunityName || item.description) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {[item.opportunityName, item.description].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </TableCell>
                {showAccount && (
                  <TableCell className="max-w-48 truncate">
                    {item.accountId ? (
                      <Link href={`/accounts/${item.accountId}/actions`} className="hover:underline">
                        {item.accountName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="max-w-32 truncate text-muted-foreground">{item.owner ?? "—"}</TableCell>
                <TableCell>
                  <PriorityPill priority={item.priority} priorities={enumerations.priorities} />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <ActionStatusPill status={item.status} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel className="text-xs">Set status</DropdownMenuLabel>
                      {ACTION_ITEM_STATUSES.map((s) => (
                        <DropdownMenuItem
                          key={s}
                          disabled={s === item.status}
                          onSelect={() => run(() => api("PATCH", `/api/action-items/${item.id}`, { status: s }))}
                        >
                          {ACTION_ITEM_STATUS_LABELS[s]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
                <TableCell>
                  <DueCell dueDate={item.dueDate} status={item.status} />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${item.title}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(item)}>
                        <Pencil className="size-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => run(() => api("DELETE", `/api/action-items/${item.id}`), { success: "Action item deleted" })}
                      >
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ActionItemFormDialog item={editing ?? undefined} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
