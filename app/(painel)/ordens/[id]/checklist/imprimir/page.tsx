import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ChecklistPrintDocument from '@/components/checklist-print';
import { orders, shops } from '@/lib/repos';
import * as checklists from '@/lib/repos/order-checklist';
import { requireServerAccount } from '@/lib/server-auth';

export const metadata: Metadata = { title: 'Checklist para assinatura' };

export default async function ChecklistPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, account] = await Promise.all([params, requireServerAccount()]);
  const [order, checklist, shop] = await Promise.all([
    orders.get(account.id, id),
    checklists.get(account.id, id),
    shops.get(account.id, 'shop-main'),
  ]);
  if (!order || !checklist) notFound();

  return (
    <ChecklistPrintDocument
      checklist={checklist.checklist}
      copies={2}
      order={order.data}
      shop={shop?.data}
    />
  );
}
