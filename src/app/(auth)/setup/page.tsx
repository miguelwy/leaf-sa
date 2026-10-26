import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SetupForm } from "@/components/auth/setup-form";
import { needsSetup } from "@/server/services/users";

// Reads the database on every request; never prerender.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set up workspace" };

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Create your workspace</h1>
        <p className="text-sm text-muted-foreground">
          This creates the owner account. Setup can only run once.
        </p>
      </div>
      <SetupForm />
    </div>
  );
}
