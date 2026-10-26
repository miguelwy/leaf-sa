"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { loginSchema } from "@/domain/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { applyServerErrors, Form, TextField } from "@/components/common/form";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        try {
          await api("POST", "/api/auth/login", values);
          router.replace(next);
          router.refresh();
        } catch (error) {
          applyServerErrors(form, error);
        }
      }}
    >
      <TextField name="email" label="Email" type="email" autoComplete="email" autoFocus />
      <TextField name="password" label="Password" type="password" autoComplete="current-password" />
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </Form>
  );
}
