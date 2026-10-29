"use client";

import * as React from "react";
import { Briefcase, Building2, FileText, ListChecks, LogOut, Menu, Plus, Search, Settings } from "lucide-react";
import Link from "next/link";
import type { SessionUser } from "@/domain/auth";
import { api } from "@/lib/api";
import { initials } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AeFormDialog } from "@/components/account-executives/ae-form-dialog";
import { ActionItemFormDialog } from "@/components/action-items/action-item-form-dialog";
import { NewNoteDialog } from "@/components/notes/new-note-dialog";
import { BrandMark } from "./brand-mark";
import { HeaderBreadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { SidebarNav } from "./app-sidebar";
import { ThemeToggle } from "./theme-toggle";

type QuickCreate = "account" | "ae" | "action" | "note" | null;

export function AppHeader({ user }: { user: SessionUser }) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [mobileNav, setMobileNav] = React.useState(false);
  const [creating, setCreating] = React.useState<QuickCreate>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = (open: boolean) => !open && setCreating(null);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
        <Menu className="size-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <HeaderBreadcrumbs />
      </div>

      <Button
        variant="outline"
        size="sm"
        className="hidden w-56 justify-start gap-2 text-muted-foreground md:inline-flex"
        onClick={() => setPaletteOpen(true)}
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">Ctrl K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}>
        <Search className="size-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1">
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setCreating("account")}>
            <Building2 className="size-4" /> Account
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreating("note")}>
            <FileText className="size-4" /> SA note
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreating("action")}>
            <ListChecks className="size-4" /> Action item
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreating("ae")}>
            <Briefcase className="size-4" /> Account executive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="User menu">
            <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
              {initials(user.name)}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings className="size-4" /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              await api("POST", "/api/auth/logout").catch(() => undefined);
              // Hard navigation on purpose: drops all client-side cached data of the session.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/login");
            }}
          >
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <AccountFormDialog open={creating === "account"} onOpenChange={close} />
      <AeFormDialog open={creating === "ae"} onOpenChange={close} />
      <ActionItemFormDialog open={creating === "action"} onOpenChange={close} />
      <NewNoteDialog open={creating === "note"} onOpenChange={close} />

      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle asChild>
              <div>
                <BrandMark />
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="p-2">
            <SidebarNav onNavigate={() => setMobileNav(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
