"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { setupSchema } from "@/domain/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { applyServerErrors, Form, TextField } from "@/components/common/form";

export function SetupForm() {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(setupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        try {
          await api("POST", "/api/auth/setup", values);
          router.replace("/");
          router.refresh();
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <TextField name="name" label="Your name" autoComplete="name" autoFocus />
      <TextField name="email" label="Email" type="email" autoComplete="email" />
      <TextField name="password" label="Password" type="password" autoComplete="new-password" hint="At least 12 characters." />
      <TextField name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" />
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Creating…" : "Create workspace"}
      </Button>
    </Form>
  );
}
