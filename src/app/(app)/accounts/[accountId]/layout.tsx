import Link from "next/link";
import { CalendarClock, ExternalLink, FileText, History, Pencil, UserRound } from "lucide-react";
import { hostname } from "@/lib/format";
import { Pill } from "@/components/common/badges";
import { LocalDateTime } from "@/components/common/local-time";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { DeleteAccountButton } from "@/components/accounts/delete-account-button";
import { Button } from "@/components/ui/button";
import { listAccountExecutiveOptions } from "@/server/services/account-executives";
import { loadAccount } from "./data";

export default async function AccountLayout({ children, params }: { children: React.ReactNode; params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const [account, aes] = await Promise.all([loadAccount(accountId), listAccountExecutiveOptions()]);
  const ae = aes.find((a) => a.id === account.aeId);
  const site = hostname(account.website);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/accounts/${account.id}`} className="truncate text-2xl font-semibold tracking-tight hover:underline">
              {account.name}
            </Link>
            <Pill>{account.status}</Pill>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-4" />
              {ae ? (
                <Link href={`/account-executives/${ae.id}`} className="hover:text-foreground hover:underline">
                  {ae.name}
                </Link>
              ) : (
                "No AE assigned"
              )}
            </span>
            {account.industry && <span>{account.industry}</span>}
            {site && account.website && (
              <a href={account.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground">
                {site} <ExternalLink className="size-3.5" />
              </a>
            )}
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" />
              Next meeting: <LocalDateTime value={account.nextMeetingAt} pattern="MMM d · HH:mm" />
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/accounts/${account.id}/notes`}>
              <FileText className="size-4" /> Notes
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/accounts/${account.id}/history`}>
              <History className="size-4" /> History
            </Link>
          </Button>
          <AccountFormDialog
            account={account}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="size-4" /> Edit
              </Button>
            }
          />
          <DeleteAccountButton id={account.id} name={account.name} />
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
