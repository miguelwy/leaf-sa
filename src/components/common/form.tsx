"use client";

import * as React from "react";
import {
  FormProvider,
  useController,
  useFormContext,
  type FieldValues,
  type Path,
  type SubmitHandler,
  type UseFormReturn,
} from "react-hook-form";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import type { Option } from "@/lib/options";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

export function Form<TValues extends FieldValues, TContext, TOutput extends FieldValues>({
  form,
  onSubmit,
  className,
  children,
  id,
}: {
  form: UseFormReturn<TValues, TContext, TOutput>;
  onSubmit: SubmitHandler<TOutput>;
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <FormProvider {...form}>
      <form id={id} noValidate onSubmit={form.handleSubmit(onSubmit)} className={cn("space-y-4", className)}>
        {children}
        <FormRootError />
      </form>
    </FormProvider>
  );
}

function FormRootError() {
  const { formState } = useFormContext();
  const message = formState.errors.root?.message;
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/30 bg-danger-subtle px-3 py-2 text-xs text-destructive">
      {message}
    </p>
  );
}

/** Maps server-side validation errors onto form fields; falls back to a root error. */
export function applyServerErrors<TValues extends FieldValues, TContext, TOutput extends FieldValues>(
  form: UseFormReturn<TValues, TContext, TOutput>,
  error: unknown,
) {
  if (error instanceof ApiError && error.details?.fieldErrors) {
    let mapped = false;
    for (const [field, messages] of Object.entries(error.details.fieldErrors)) {
      if (messages?.[0] && field in form.getValues()) {
        form.setError(field as Path<TValues>, { type: "server", message: messages[0] });
        mapped = true;
      }
    }
    if (mapped) return;
  }
  form.setError("root", { type: "server", message: error instanceof Error ? error.message : "Something went wrong" });
}

interface FieldShellProps {
  label?: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  className?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function FieldShell({ label, htmlFor, error, hint, className, required, children }: FieldShellProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

interface BaseFieldProps<T extends FieldValues> {
  name: Path<T>;
  label?: string;
  hint?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export function TextField<T extends FieldValues>({
  name,
  label,
  hint,
  placeholder,
  className,
  required,
  disabled,
  type = "text",
  autoFocus,
  autoComplete,
}: BaseFieldProps<T> & { type?: "text" | "email" | "password" | "url" | "tel"; autoFocus?: boolean; autoComplete?: string }) {
  const { field, fieldState } = useController<T>({ name });
  const id = `f-${name}`;
  return (
    <FieldShell label={label} htmlFor={id} error={fieldState.error?.message} hint={hint} className={className} required={required}>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        aria-invalid={!!fieldState.error}
        {...field}
        value={field.value ?? ""}
      />
    </FieldShell>
  );
}

export function TextareaField<T extends FieldValues>({
  name,
  label,
  hint,
  placeholder,
  className,
  required,
  disabled,
  rows = 4,
  mono,
}: BaseFieldProps<T> & { rows?: number; mono?: boolean }) {
  const { field, fieldState } = useController<T>({ name });
  const id = `f-${name}`;
  return (
    <FieldShell label={label} htmlFor={id} error={fieldState.error?.message} hint={hint} className={className} required={required}>
      <Textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={!!fieldState.error}
        className={cn("min-h-0 resize-y", mono && "font-mono text-xs")}
        {...field}
        value={field.value ?? ""}
      />
    </FieldShell>
  );
}

export function SelectField<T extends FieldValues>({
  name,
  label,
  hint,
  placeholder = "Select…",
  className,
  required,
  disabled,
  options,
  allowEmpty = true,
  emptyLabel = "None",
}: BaseFieldProps<T> & { options: Option[]; allowEmpty?: boolean; emptyLabel?: string }) {
  const { field, fieldState } = useController<T>({ name });
  const id = `f-${name}`;
  const value = (field.value as string | null | undefined) ?? "";
  // Keep showing a stored value that is no longer configured.
  const merged = value && !options.some((o) => o.value === value) ? [...options, { value, label: `${value} (not configured)` }] : options;
  return (
    <FieldShell label={label} htmlFor={id} error={fieldState.error?.message} hint={hint} className={className} required={required}>
      <Select
        value={value || (allowEmpty ? NONE : undefined)}
        onValueChange={(v) => field.onChange(v === NONE ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={!!fieldState.error} onBlur={field.onBlur}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && (
            <SelectItem value={NONE}>
              <span className="text-muted-foreground">{emptyLabel}</span>
            </SelectItem>
          )}
          {merged.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

export function DateField<T extends FieldValues>({
  name,
  label,
  hint,
  className,
  required,
  disabled,
  withTime,
}: BaseFieldProps<T> & { withTime?: boolean }) {
  const { field, fieldState } = useController<T>({ name });
  const id = `f-${name}`;
  return (
    <FieldShell label={label} htmlFor={id} error={fieldState.error?.message} hint={hint} className={className} required={required}>
      <Input
        id={id}
        type={withTime ? "datetime-local" : "date"}
        disabled={disabled}
        aria-invalid={!!fieldState.error}
        {...field}
        value={field.value ?? ""}
      />
    </FieldShell>
  );
}

export function SwitchField<T extends FieldValues>({ name, label, hint, className, disabled }: BaseFieldProps<T>) {
  const { field } = useController<T>({ name });
  const id = `f-${name}`;
  return (
    <div className={cn("flex items-center justify-between gap-4 rounded-lg border px-3 py-2", className)}>
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} disabled={disabled} />
    </div>
  );
}

export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}
