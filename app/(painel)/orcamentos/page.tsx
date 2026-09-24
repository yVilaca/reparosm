import QuotesRoute from '@/components/quotes-route';
import { quotes } from '@/lib/repos';
import { requireServerAccount } from '@/lib/server-auth';

export default async function QuotesPage() {
  const account = await requireServerAccount();
  const records = await quotes.list(account.id);
  return (
    <QuotesRoute initialQuotes={records.map((record) => ({ id: record.id, ...record.data }))} />
  );
}
