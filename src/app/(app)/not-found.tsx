import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <SearchX className="size-5" />
      </span>
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">This record does not exist or was deleted.</p>
      <Button asChild size="sm" variant="outline">
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
