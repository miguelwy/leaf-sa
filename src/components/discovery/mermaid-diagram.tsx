"use client";

import * as React from "react";
import { useTheme } from "next-themes";

/**
 * Renders a Mermaid diagram client-side. Mermaid is loaded lazily (it is large) and
 * runs with `securityLevel: "strict"` so diagram text cannot inject scripts.
 */
export function MermaidDiagram({ source }: { source: string }) {
  const { resolvedTheme } = useTheme();
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: resolvedTheme === "dark" ? "dark" : "neutral" });
        const { svg: rendered } = await mermaid.render(`mmd-${id}`, source);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSvg(null);
          setError(e instanceof Error ? e.message : "Invalid diagram");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, resolvedTheme, id]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-destructive">Diagram could not be rendered: {error.split("\n")[0]}</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">{source}</pre>
      </div>
    );
  }
  if (!svg) return <div className="h-24 animate-pulse rounded-md bg-muted" />;
  // Output comes from Mermaid in strict mode (sanitised), not from raw user HTML.
  return <div className="overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
