import type { Metadata } from "next";
import { Database, ShieldCheck, Sparkles } from "lucide-react";
import { ENUMERATION_KINDS } from "@/domain/enumerations";
import { requireUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { getEnumerations } from "@/server/services/settings";
import { getAiStatus, providerKeyConfigured } from "@/server/ai/settings";
import { getAiUsageSummary } from "@/server/services/meeting-analysis";
import { AiSettingsForm } from "@/components/settings/ai-settings-form";
import { DefinitionList, PageHeader, Panel } from "@/components/common/layout-primitives";
import { Pill } from "@/components/common/badges";
import { EnumerationEditor } from "@/components/settings/enumeration-editor";
import { SetBreadcrumbs } from "@/components/layout/breadcrumbs";

export const metadata: Metadata = { title: "Settings" };

function redactUri(uri: string): string {
  try {
    const url = new URL(uri);
    return `${url.protocol}//${url.username ? "•••@" : ""}${url.host}`;
  } catch {
    return "configured";
  }
}

export default async function SettingsPage() {
  const [user, enums, aiStatus, usage] = await Promise.all([requireUser(), getEnumerations(), getAiStatus(), getAiUsageSummary()]);
  const { MONGODB_URI, MONGODB_DB, SESSION_TTL_HOURS } = env();

  return (
    <div className="space-y-6">
      <SetBreadcrumbs items={[{ label: "Settings" }]} />
      <PageHeader title="Settings" description="Workspace configuration, data flow transparency and classification values." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          className="lg:col-span-2"
          title={
            <span id="ai" className="inline-flex scroll-mt-20 items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" /> AI processing
            </span>
          }
          description="Meeting analysis sends data to an external AI provider only when enabled here and only for meetings you analyze."
          actions={<Pill tone={aiStatus.ready ? "brand" : "neutral"}>{aiStatus.ready ? "On" : "Off"}</Pill>}
        >
          <AiSettingsForm status={aiStatus} usage={usage} keys={{ anthropic: providerKeyConfigured("anthropic"), openai: providerKeyConfigured("openai") }} />
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Database className="size-4 text-muted-foreground" /> Data storage
            </span>
          }
        >
          <DefinitionList
            className="sm:grid-cols-1"
            items={[
              { label: "MongoDB deployment", value: <span className="font-mono text-xs">{redactUri(MONGODB_URI)}</span> },
              { label: "Database", value: <span className="font-mono text-xs">{MONGODB_DB}</span> },
              {
                label: "Deletion",
                value: "Deleting an account permanently removes its opportunities, contacts, workloads, notes, tasks and history.",
              },
            ]}
          />
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" /> Security
            </span>
          }
        >
          <DefinitionList
            className="sm:grid-cols-1"
            items={[
              { label: "Signed in as", value: `${user.name} (${user.email})` },
              { label: "Session lifetime", value: `${SESSION_TTL_HOURS} hours, HTTP-only cookie` },
              { label: "Audit log", value: "All account changes are recorded in each account's History tab." },
            ]}
          />
        </Panel>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Enumerations</h2>
          <p className="text-sm text-muted-foreground">
            Classification values are configurable on purpose: no sales rules are hardcoded. Renaming or removing a value does not
            change existing records; they keep the old value until you reclassify them.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ENUMERATION_KINDS.map((kind) => (
            <EnumerationEditor key={`${kind}:${enums[kind].join("|")}`} kind={kind} values={enums[kind]} />
          ))}
        </div>
      </section>
    </div>
  );
}
