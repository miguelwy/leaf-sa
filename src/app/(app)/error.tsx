"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-danger-subtle text-destructive">
        <AlertTriangle className="size-5" />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        The page could not be loaded. If the database is unreachable, check that MongoDB is running and MONGODB_URI is correct.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <Button size="sm" onClick={reset}>
        <RotateCcw className="size-3.5" /> Try again
      </Button>
    </div>
  );
}
