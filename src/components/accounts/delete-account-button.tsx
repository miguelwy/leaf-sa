"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

/** Permanent deletion of an account and all its data; requires typing the account name. */
export function DeleteAccountButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [typed, setTyped] = React.useState("");
  return (
    <ConfirmDialog
      title={`Permanently delete ${name}?`}
      description={
        <span className="space-y-3">
          <span className="block">
            This deletes the account and all of its opportunities, contacts, workloads, SA notes (with history), action items and audit
            history. This cannot be undone.
          </span>
          <span className="block text-foreground">Type the account name to confirm.</span>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} aria-label="Account name" />
        </span>
      }
      confirmLabel="Delete permanently"
      onConfirm={async () => {
        if (typed.trim() !== name) {
          toast.error("The name does not match");
          throw new Error("mismatch");
        }
        try {
          await api("DELETE", `/api/accounts/${id}`);
          toast.success(`${name} deleted`);
          router.push("/accounts");
          router.refresh();
        } catch (error) {
          toast.error(errorMessage(error));
          throw error;
        }
      }}
      trigger={
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setTyped("")}>
          <Trash2 className="size-3.5" /> Delete
        </Button>
      }
    />
  );
}
