"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Mail, MoreHorizontal, Pencil, Star, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { contactInputSchema, type Contact } from "@/domain/entities";
import { api } from "@/lib/api";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { applyServerErrors, FormGrid, SwitchField, TextareaField, TextField } from "@/components/common/form";
import { FormDialog } from "@/components/common/form-dialog";
import { EmptyState, Panel } from "@/components/common/layout-primitives";

function defaults(c?: Contact, champion = true) {
  return {
    name: c?.name ?? "",
    title: c?.title ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    persona: c?.persona ?? null,
    isPrimary: c?.isPrimary ?? false,
    isChampion: c?.isChampion ?? champion,
    notes: c?.notes ?? "",
  };
}

function PersonDialog({ accountId, contact, open, onOpenChange }: { accountId: string; contact?: Contact; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(contactInputSchema), defaultValues: defaults(contact) });
  React.useEffect(() => {
    if (open) form.reset(defaults(contact));
  }, [open, contact, form]);
  return (
    <FormDialog
      title={contact ? `Edit ${contact.name}` : "Add person"}
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      submitLabel={contact ? "Save" : "Add"}
      onSubmit={async (values) => {
        try {
          if (contact) await api("PATCH", `/api/contacts/${contact.id}`, values);
          else await api("POST", `/api/accounts/${accountId}/contacts`, values);
          toast.success(contact ? "Saved" : "Added");
          onOpenChange(false);
          router.refresh();
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <FormGrid>
        <TextField name="name" label="Name" required autoFocus />
        <TextField name="title" label="Job title" />
        <TextField name="email" label="Email" type="email" className="sm:col-span-2" />
        <TextareaField name="notes" label="Why they matter" rows={3} className="sm:col-span-2" placeholder="e.g. Owns the catalog platform, pushing for the PoC" />
        <SwitchField name="isChampion" label="Technical champion" className="sm:col-span-2" />
      </FormGrid>
    </FormDialog>
  );
}

/** Technical champions first, other contacts collapsed below. */
export function ChampionsPanel({ accountId, contacts }: { accountId: string; contacts: Contact[] }) {
  const { run } = useApiAction();
  const [editing, setEditing] = React.useState<Contact | "new" | null>(null);
  const [showOthers, setShowOthers] = React.useState(false);
  const champions = contacts.filter((c) => c.isChampion);
  const others = contacts.filter((c) => !c.isChampion);

  const person = (c: Contact) => (
    <li key={c.id} className="flex items-start gap-3 rounded-lg border p-3">
      <button
        type="button"
        aria-label={c.isChampion ? "Remove champion" : "Mark as champion"}
        title={c.isChampion ? "Technical champion" : "Mark as champion"}
        onClick={() => run(() => api("PATCH", `/api/contacts/${c.id}`, { isChampion: !c.isChampion }))}
        className="mt-0.5"
      >
        <Star className={c.isChampion ? "size-5 fill-warning text-warning" : "size-5 text-muted-foreground/50 hover:text-warning"} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{c.name}</p>
        {c.title && <p className="text-sm text-muted-foreground">{c.title}</p>}
        {c.notes && <p className="mt-1 text-sm whitespace-pre-wrap">{c.notes}</p>}
        {c.email && (
          <a href={`mailto:${c.email}`} className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <Mail className="size-3.5" /> {c.email}
          </a>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${c.name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(c)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => run(() => api("DELETE", `/api/contacts/${c.id}`), { success: "Removed" })}>
            <Trash2 className="size-4" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );

  return (
    <Panel
      title="Technical champions"
      actions={
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <UserPlus className="size-4" /> Add
        </Button>
      }
    >
      <div className="space-y-3">
        {champions.length === 0 ? (
          <EmptyState compact icon={Users} title="No champions yet" description="Click the star on a contact, or add a person." />
        ) : (
          <ul className="space-y-2">{champions.map(person)}</ul>
        )}
        {others.length > 0 && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowOthers((v) => !v)}>
              {showOthers ? "Hide" : "Show"} other contacts ({others.length})
            </Button>
            {showOthers && <ul className="mt-2 space-y-2">{others.map(person)}</ul>}
          </div>
        )}
      </div>
      <PersonDialog accountId={accountId} contact={editing && editing !== "new" ? editing : undefined} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} />
    </Panel>
  );
}
