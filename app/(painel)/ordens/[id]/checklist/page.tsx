import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ChecklistBench from '@/components/checklist-bench';
import { orders } from '@/lib/repos';
import * as checklists from '@/lib/repos/order-checklist';
import { requireServerAccount } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Checklist de entrada' };

/** A bancada de testes da OS: o estado do aparelho antes de mexer nele. */
export default async function OrderChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, account] = await Promise.all([params, requireServerAccount()]);
  const [order, initial] = await Promise.all([
    orders.get(account.id, id),
    checklists.get(account.id, id),
  ]);
  if (!order || !initial) notFound();
  return (
    <ChecklistBench
      initial={initial}
      order={{
        id,
        code: order.data.code,
        device: order.data.device,
        customer: order.data.customer,
        phone: order.data.phone,
      }}
    />
  );
}
