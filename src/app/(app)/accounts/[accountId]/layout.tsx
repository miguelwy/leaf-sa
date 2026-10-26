import Link from "next/link";
import { CalendarClock, ExternalLink, History, Pencil, UserRound } from "lucide-react";
import { hostname } from "@/lib/format";
import { ClassificationPills, Pill } from "@/components/common/badges";
import { LocalDateTime } from "@/components/common/local-time";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountTabs } from "@/components/accounts/account-tabs";
import { DeleteAccountButton } from "@/components/accounts/delete-account-button";
import { Button } from "@/components/ui/button";
import { listAccountExecutiveOptions } from "@/server/services/account-executives";
import { loadAccount, loadAccountOpportunities } from "./data";

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const [account, opportunities, aes] = await Promise.all([
    loadAccount(accountId),
    loadAccountOpportunities(accountId),
    listAccountExecutiveOptions(),
  ]);
  const ae = aes.find((a) => a.id === account.aeId);
  const site = hostname(account.website);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{account.name}</h1>
              <Pill>{account.status}</Pill>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <UserRound className="size-3.5" />
                {ae ? (
                  <Link href={`/account-executives/${ae.id}`} className="hover:text-foreground hover:underline">
                    {ae.name}
                  </Link>
                ) : (
                  "No AE assigned"
                )}
              </span>
              {account.industry && <span>{account.industry}</span>}
              {account.region && <span>{account.region}</span>}
              {site && account.website && (
                <a href={account.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground">
                  {site} <ExternalLink className="size-3" />
                </a>
              )}
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                Next meeting: <LocalDateTime value={account.nextMeetingAt} pattern="MMM d · HH:mm" />
              </span>
              <span className="inline-flex items-center gap-1">
                <History className="size-3.5" />
                Last interaction: <LocalDateTime value={account.lastInteractionAt} relative />
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <AccountFormDialog
              account={account}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="size-3.5" /> Edit account
                </Button>
              }
            />
            <DeleteAccountButton id={account.id} name={account.name} />
          </div>
        </div>

        {opportunities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {opportunities.map((o) => (
              <Link
                key={o.id}
                href={`/accounts/${account.id}/opportunities#${o.id}`}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1 text-xs shadow-xs hover:bg-muted/50"
              >
                <span className="max-w-56 truncate font-medium">{o.name}</span>
                <ClassificationPills salesMotion={o.salesMotion} tigerRoute={o.tigerRoute} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <AccountTabs accountId={account.id} />
      <div>{children}</div>
    </div>
  );
}
