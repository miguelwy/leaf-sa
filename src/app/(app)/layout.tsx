import { requireUser } from "@/server/auth/session";
import { listAccountExecutiveOptions } from "@/server/services/account-executives";
import { listAccountOptions } from "@/server/services/accounts";
import { listOpportunityOptions } from "@/server/services/opportunities";
import { getEnumerations } from "@/server/services/settings";
import { getAiStatus } from "@/server/ai/settings";
import { AI_PROVIDER_LABELS } from "@/domain/meetings";
import { ReferenceDataProvider } from "@/components/common/reference-data";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BreadcrumbProvider } from "@/components/layout/breadcrumbs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [enumerations, accountExecutives, accounts, opportunities, aiStatus] = await Promise.all([
    getEnumerations(),
    listAccountExecutiveOptions(),
    listAccountOptions(),
    listOpportunityOptions(),
    getAiStatus(),
  ]);
  const ai = { ready: aiStatus.ready, reason: aiStatus.reason, providerLabel: AI_PROVIDER_LABELS[aiStatus.provider] };

  return (
    <ReferenceDataProvider value={{ enumerations, accountExecutives, accounts, opportunities, ai }}>
      <BreadcrumbProvider>
        <div className="flex min-h-svh">
          <AppSidebar ai={ai} />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader user={user} />
            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </BreadcrumbProvider>
    </ReferenceDataProvider>
  );
}
