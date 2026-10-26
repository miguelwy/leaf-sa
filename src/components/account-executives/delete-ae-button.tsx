"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

export function DeleteAeButton({ id, name, accountCount }: { id: string; name: string; accountCount: number }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title={`Delete ${name}?`}
      description={
        accountCount
          ? `${accountCount} account(s) and their opportunities will become unassigned. Nothing else is deleted.`
          : "This account executive has no accounts. This cannot be undone."
      }
      confirmLabel="Delete"
      onConfirm={async () => {
        try {
          await api("DELETE", `/api/account-executives/${id}`);
          toast.success("Account executive deleted");
          router.push("/account-executives");
          router.refresh();
        } catch (error) {
          toast.error(errorMessage(error));
        }
      }}
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 className="size-3.5" /> Delete
        </Button>
      }
    />
  );
}
