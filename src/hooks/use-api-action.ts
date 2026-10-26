"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";

interface Options {
  success?: string;
  /** Refresh Server Components after success (default true). */
  refresh?: boolean;
  /** Rethrow so callers (forms) can map field errors. */
  rethrow?: boolean;
}

/**
 * Runs a mutation with pending state, error toasts and a Server Component refresh,
 * so every write in the UI behaves the same way.
 */
export function useApiAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async <T,>(fn: () => Promise<T>, options: Options = {}): Promise<T | undefined> => {
      setPending(true);
      try {
        const result = await fn();
        if (options.success) toast.success(options.success);
        if (options.refresh !== false) router.refresh();
        return result;
      } catch (error) {
        if (options.rethrow) throw error;
        toast.error(errorMessage(error));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  return { run, pending };
}
