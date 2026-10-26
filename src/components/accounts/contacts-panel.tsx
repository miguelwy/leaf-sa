"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Mail, MoreHorizontal, Pencil, Phone, Plus, Star, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { contactInputSchema, type Contact } from "@/domain/entities";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyServerErrors, FormGrid, SelectField, SwitchField, TextareaField, TextField } from "@/components/common/form";
import { toOptions } from "@/lib/options";
import { FormDialog } from "@/components/common/form-dialog";
import { EmptyState, Panel } from "@/components/common/layout-primitives";
import { Pill } from "@/components/common/badges";
import { useReferenceData } from "@/components/common/reference-data";
import { useApiAction } from "@/hooks/use-api-action";

function defaults(c?: Contact) {
  return {
    name: c?.name ?? "",
    title: c?.title ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    persona: c?.persona ?? null,
    isPrimary: c?.isPrimary ?? false,
    notes: c?.notes ?? "",
  };
}

function ContactDialog({
  accountId,
  contact,
  open,
  onOpenChange,
}: {
  accountId: string;
  contact?: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { enumerations } = useReferenceData();
  const form = useForm({ resolver: zodResolver(contactInputSchema), defaultValues: defaults(contact) });
  React.useEffect(() => {
    if (open) form.reset(defaults(contact));
  }, [open, contact, form]);

  return (
    <FormDialog
      title={contact ? "Edit contact" : "New contact"}
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      submitLabel={contact ? "Save changes" : "Add contact"}
      onSubmit={async (values) => {
        try {
          if (contact) await api("PATCH", `/api/contacts/${contact.id}`, values);
          else await api("POST", `/api/accounts/${accountId}/contacts`, values);
          toast.success(contact ? "Contact updated" : "Contact added");
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
        <TextField name="email" label="Email" type="email" />
        <TextField name="phone" label="Phone" type="tel" />
        <SelectField name="persona" label="Persona" options={toOptions(enumerations.contactPersonas)} className="sm:col-span-2" />
        <SwitchField name="isPrimary" label="Primary contact" hint="Shown first on the account overview." className="sm:col-span-2" />
        <TextareaField name="notes" label="Notes" rows={2} className="sm:col-span-2" />
      </FormGrid>
    </FormDialog>
  );
}

export function ContactsPanel({ accountId, contacts }: { accountId: string; contacts: Contact[] }) {
  const [editing, setEditing] = React.useState<Contact | "new" | null>(null);
  const { run } = useApiAction();

  return (
    <Panel
      title="Contacts"
      bodyClassName="p-0"
      actions={
        <Button variant="ghost" size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" /> Add
        </Button>
      }
    >
      {contacts.length === 0 ? (
        <EmptyState compact icon={Users} className="m-4" title="No contacts yet" description="Add the people you meet at this customer." />
      ) : (
        <ul className="divide-y">
          {contacts.map((c) => (
            <li key={c.id} className="group flex items-start gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  {c.isPrimary && <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Primary contact" />}
                </div>
                <p className="truncate text-xs text-muted-foreground">{[c.title, c.persona].filter(Boolean).join(" · ") || "—"}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                      <Mail className="size-3" /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" /> {c.phone}
                    </span>
                  )}
                </div>
              </div>
              {c.persona && <Pill className="hidden sm:inline-flex">{c.persona}</Pill>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${c.name}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(c)}>
                    <Pencil className="size-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(() => api("PATCH", `/api/contacts/${c.id}`, { isPrimary: !c.isPrimary }))}>
                    <Star className="size-4" /> {c.isPrimary ? "Unmark primary" : "Mark as primary"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => run(() => api("DELETE", `/api/contacts/${c.id}`), { success: "Contact removed" })}
                  >
                    <Trash2 className="size-4" /> Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <ContactDialog
        accountId={accountId}
        contact={editing && editing !== "new" ? editing : undefined}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </Panel>
  );
}
