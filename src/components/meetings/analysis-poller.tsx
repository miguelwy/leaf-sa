"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

/** Polls the meeting status while an analysis runs and refreshes the page when it finishes. */
export function AnalysisPoller({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    let stopped = false;
    const started = Date.now();
    const tick = async () => {
      if (stopped) return;
      setElapsed(Math.round((Date.now() - started) / 1000));
      try {
        const status = await api<{ analysisStatus: string }>("GET", `/api/meetings/${meetingId}/status`);
        if (status.analysisStatus !== "analyzing") {
          stopped = true;
          router.refresh();
          return;
        }
      } catch {
        // Keep polling through transient errors.
      }
      if (!stopped) timer = setTimeout(tick, 3000);
    };
    let timer = setTimeout(tick, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [meetingId, router]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-info/30 bg-info-subtle px-4 py-3 text-sm">
      <Loader2 className="size-4 animate-spin text-info" />
      <div>
        <p className="font-medium">Analyzing the transcript…</p>
        <p className="text-xs text-muted-foreground">
          Usually takes 30–120 seconds{elapsed > 5 ? ` · ${elapsed}s elapsed` : ""}. You can leave this page; results are saved.
        </p>
      </div>
    </div>
  );
}
