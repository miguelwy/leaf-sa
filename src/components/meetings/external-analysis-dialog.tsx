"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCopy, Download, FileInput } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Analysis without an API key: copy a generated prompt into an internal assistant
 * (e.g. Glean), paste its JSON answer back, and review the suggestions as usual.
 */
export function ExternalAnalysisDialog({ meetingId, hasTranscript, trigger }: { meetingId: string; hasTranscript: boolean; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [includeTranscript, setIncludeTranscript] = React.useState(true);
  const [loadingPrompt, setLoadingPrompt] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [result, setResult] = React.useState("");
  const [source, setSource] = React.useState("Glean");
  const [importing, setImporting] = React.useState(false);
  const [issues, setIssues] = React.useState<string[]>([]);

  const fetchPrompt = async () => {
    const res = await api<{ prompt: string; chars: number }>(
      "GET",
      `/api/meetings/${meetingId}/external-prompt?transcript=${includeTranscript && hasTranscript ? 1 : 0}`,
    );
    return res.prompt;
  };

  const copyPrompt = async () => {
    setLoadingPrompt(true);
    try {
      const prompt = await fetchPrompt();
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success(`Prompt copied (${prompt.length.toLocaleString()} characters)`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not copy. Use Download instead.");
    } finally {
      setLoadingPrompt(false);
    }
  };

  const downloadPrompt = async () => {
    setLoadingPrompt(true);
    try {
      const prompt = await fetchPrompt();
      const url = URL.createObjectURL(new Blob([prompt], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "meeting-analysis-prompt.txt";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingPrompt(false);
    }
  };

  const importResult = async () => {
    setImporting(true);
    setIssues([]);
    try {
      const res = await api<{ suggestions: number }>("POST", `/api/meetings/${meetingId}/import-analysis`, { result, sourceLabel: source });
      toast.success(`Imported — ${res.suggestions} suggestions to review`);
      setOpen(false);
      setResult("");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.details?.formErrors?.length) setIssues(error.details.formErrors);
      else setIssues([errorMessage(error)]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Analyze with Glean (or another assistant)</DialogTitle>
          <DialogDescription>
            No API key needed: the app prepares the prompt, you run it in your internal assistant and paste the JSON answer back.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 overflow-y-auto px-5 py-4 text-sm">
          <section className="space-y-2">
            <h3 className="font-semibold">1. Copy the prompt</h3>
            <p className="text-xs text-muted-foreground">
              It contains the analysis rules, this account&apos;s current profile (with the ids the app needs to match updates) and the
              exact output format.
            </p>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={includeTranscript && hasTranscript} disabled={!hasTranscript} onCheckedChange={(v) => setIncludeTranscript(v === true)} />
              Include the transcript in the prompt
              <span className="text-muted-foreground">(uncheck if the assistant limits message size, then attach the transcript file there)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={copyPrompt} disabled={loadingPrompt}>
                {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
                {copied ? "Copied — copy again" : "Copy prompt"}
              </Button>
              <Button size="sm" variant="outline" onClick={downloadPrompt} disabled={loadingPrompt}>
                <Download className="size-3.5" /> Download .txt
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">2. Run it in Glean</h3>
            <p className="text-xs text-muted-foreground">
              Paste the prompt in a new Glean chat (attach the transcript if you left it out) and copy the whole answer.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">3. Paste the answer</h3>
            <Textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              rows={10}
              placeholder='{"summary": "...", "businessInsights": [...], ...}'
              className="min-h-0 font-mono text-xs"
            />
            <div className="grid max-w-xs gap-1.5">
              <Label htmlFor="ext-source" className="text-xs text-muted-foreground">
                Source label
              </Label>
              <Input id="ext-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} className="h-8" />
            </div>
            {issues.length > 0 && (
              <ul className="space-y-0.5 rounded-md border border-destructive/30 bg-danger-subtle px-3 py-2 text-xs text-destructive">
                {issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <DialogFooter className="m-0 px-5 py-3">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={importResult} disabled={importing || result.trim().length < 2}>
            <FileInput className="size-3.5" /> {importing ? "Importing…" : "Import and review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
