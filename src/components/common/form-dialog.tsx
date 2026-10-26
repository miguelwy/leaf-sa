"use client";

import * as React from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Form } from "./form";

/** Controlled or uncontrolled open state for dialogs that can also be opened programmatically. */
export function useDialogState(open?: boolean, onOpenChange?: (open: boolean) => void) {
  const [internal, setInternal] = React.useState(false);
  const isControlled = open !== undefined;
  return {
    open: isControlled ? open : internal,
    setOpen: (next: boolean) => {
      if (!isControlled) setInternal(next);
      onOpenChange?.(next);
    },
  };
}

interface FormDialogProps<TValues extends FieldValues, TContext, TOutput extends FieldValues> {
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<TValues, TContext, TOutput>;
  onSubmit: SubmitHandler<TOutput>;
  submitLabel?: string;
  size?: "md" | "lg" | "xl";
  children: React.ReactNode;
}

export function FormDialog<TValues extends FieldValues, TContext, TOutput extends FieldValues>({
  title,
  description,
  trigger,
  open,
  onOpenChange,
  form,
  onSubmit,
  submitLabel = "Save",
  size = "md",
  children,
}: FormDialogProps<TValues, TContext, TOutput>) {
  const formId = React.useId();
  const submitting = form.formState.isSubmitting;
  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={cn(
          "flex max-h-[90svh] flex-col gap-0 p-0",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl",
          size === "xl" && "sm:max-w-4xl",
        )}
      >
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="overflow-y-auto px-5 py-4">
          <Form form={form} onSubmit={onSubmit} id={formId}>
            {children}
          </Form>
        </div>
        <DialogFooter className="m-0 px-5 py-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={submitting}>
            {submitting ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
