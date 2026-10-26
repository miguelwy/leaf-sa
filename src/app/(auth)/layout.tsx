import { BrandMark } from "@/components/layout/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-12">
      <BrandMark />
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">{children}</div>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Customer information stays in your MongoDB deployment. AI processing is off until you configure it.
      </p>
    </main>
  );
}
