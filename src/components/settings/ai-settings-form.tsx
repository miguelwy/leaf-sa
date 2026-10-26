"use client";

import * as React from "react";
import { CheckCircle2, CircleAlert, KeyRound } from "lucide-react";
import { AI_PROVIDER_LABELS, AI_PROVIDERS, type AiProviderName, type AiStatus } from "@/domain/meetings";
import { api } from "@/lib/api";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LocalDateTime } from "@/components/common/local-time";

export interface UsageSummary {
  analyses: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export function AiSettingsForm({ status, usage, keys }: { status: AiStatus; usage: UsageSummary; keys: Record<AiProviderName, boolean> }) {
  const [enabled, setEnabled] = React.useState(status.enabled);
  const [provider, setProvider] = React.useState<AiProviderName>(status.provider);
  const [model, setModel] = React.useState(status.model ?? "");
  const [redact, setRedact] = React.useState(status.redactContactDetails);
  const { run, pending } = useApiAction();
  const dirty = enabled !== status.enabled || provider !== status.provider || (model || null) !== status.model || redact !== status.redactContactDetails;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-2 rounded-lg border px-3 py-2">
        {status.ready ? <CheckCircle2 className="mt-0.5 size-4 text-success" /> : <CircleAlert className="mt-0.5 size-4 text-warning" />}
        <div>
          <p className="font-medium">{status.ready ? `Active — ${AI_PROVIDER_LABELS[status.provider]} · ${status.effectiveModel}` : "Not active"}</p>
          <p className="text-xs text-muted-foreground">
            {status.ready
              ? <>Approved <LocalDateTime value={status.approvedAt} />. Data is sent only when you analyze a meeting.</>
              : status.reason}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as AiProviderName)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {AI_PROVIDER_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <KeyRound className="size-3" /> {provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"}:{" "}
            {keys[provider] ? <span className="text-success">configured on server</span> : <span className="text-warning">not set</span>}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ai-model" className="text-xs text-muted-foreground">
            Model
          </Label>
          <Input
            id="ai-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider === "anthropic" ? "claude-opus-5-5 (default)" : "required, e.g. your approved OpenAI model"}
          />
        </div>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2">
        <span>
          <span className="block font-medium">Redact contact details</span>
          <span className="text-xs text-muted-foreground">Emails and phone numbers are replaced before text is sent.</span>
        </span>
        <Switch checked={redact} onCheckedChange={setRedact} />
      </label>

      <label className="flex items-start justify-between gap-4 rounded-lg border border-brand/30 bg-brand-subtle/40 px-3 py-2">
        <span>
          <span className="block font-medium">Allow sending meeting data to {AI_PROVIDER_LABELS[provider]}</span>
          <span className="text-xs text-muted-foreground">
            When you analyze a meeting, its transcript plus this account&apos;s discovery profile, opportunity names, contact names and open
            tasks are sent server-side to the provider&apos;s API. Only enable this if the provider is approved for customer data.
          </span>
        </span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </label>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {usage.analyses} analyses · {(usage.inputTokens / 1000).toFixed(0)}k in / {(usage.outputTokens / 1000).toFixed(0)}k out tokens
          {usage.costUsd !== null && ` · ~$${usage.costUsd.toFixed(2)}`}
        </p>
        <Button
          size="sm"
          disabled={!dirty || pending}
          onClick={() =>
            run(() => api("PUT", "/api/settings/ai", { enabled, provider, model: model || null, redactContactDetails: redact }), {
              success: "AI settings saved",
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
