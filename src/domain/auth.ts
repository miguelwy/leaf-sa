import { z } from "zod";
import { requiredText } from "./common";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Invalid email address")),
  password: z.string().min(1, "Required").max(200),
});
export type LoginInput = z.input<typeof loginSchema>;

export const setupSchema = z
  .object({
    name: requiredText(120),
    email: z.string().trim().toLowerCase().pipe(z.email("Invalid email address")),
    password: z.string().min(12, "Use at least 12 characters").max(200),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type SetupInput = z.input<typeof setupSchema>;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}
