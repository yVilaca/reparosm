import { redirect } from 'next/navigation';

export default async function MesaPage() {
  redirect('/ordens?view=kanban');
}
