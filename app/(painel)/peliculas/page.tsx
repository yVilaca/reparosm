import FilmsRoute from '@/components/films-route';
import { films } from '@/lib/repos/rest';
import { requireServerAccount } from '@/lib/server-auth';

export default async function FilmsPage() {
  const account = await requireServerAccount();
  const records = await films.list(account.id);
  return (
    <FilmsRoute
      initialFilms={records.map((record) => ({ id: record.id, ...record.data, editable: true }))}
    />
  );
}
