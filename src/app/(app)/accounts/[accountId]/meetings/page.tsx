import { redirect } from "next/navigation";

/** Meetings are listed on the account page. */
export default async function AccountMeetingsRedirect({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  redirect(`/accounts/${accountId}`);
}
