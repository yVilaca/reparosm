'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MessageCircle, Star, Wrench } from 'lucide-react';
import { ClientForm, type ClientRow, type SaveClient } from '@/components/client-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import RecordDialog, { RecordField, RecordSection } from '@/components/ui/record-dialog';
import { formatMoney, hasValidWhatsapp } from '@/lib/format';
import type { QuickSaleRecord } from '@/lib/repos/quick-sales';
import { badgeFor, clientStatusTone } from '@/lib/status-tones';

const brDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value.includes('T') ? value : `${value}T12:00:00-03:00`);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(parsed);
};

/** Vendas rápidas feitas para o cliente, com o que levou em cada uma. */
function ClientPurchases({ clientId }: { clientId: string }) {
  const [sales, setSales] = useState<QuickSaleRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    fetch(`/api/clients/${encodeURIComponent(clientId)}/sales`)
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((result: { sales: QuickSaleRecord[] }) => current && setSales(result.sales))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [clientId]);
  const total = sales?.reduce((sum, sale) => sum + sale.value, 0) ?? 0;
  return (
    <section aria-label="Compras" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Compras</h3>
        {sales && sales.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {sales.length === 1 ? '1 venda' : `${sales.length} vendas`} ·{' '}
            <span className="font-medium text-foreground tabular-nums">{formatMoney(total)}</span>
          </p>
        )}
      </div>
      {failed ? (
        <p className="text-sm text-destructive">Não foi possível carregar as compras.</p>
      ) : !sales ? (
        <p className="text-sm text-muted-foreground">Carregando compras…</p>
      ) : !sales.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma venda rápida para este cliente. Escolha o cliente na Venda rápida para registrar.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sales.map((sale) => (
            <li className="grid gap-1 px-3 py-2.5" key={sale.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {brDate(sale.date)} · {sale.method}
                </span>
                <Link
                  className="font-semibold tabular-nums underline-offset-4 hover:underline"
                  href={`/pagamentos/${encodeURIComponent(sale.id)}/comprovante`}
                  rel="noopener noreferrer"
                  target="_blank"
                  title="Abrir comprovante"
                >
                  {formatMoney(sale.value)}
                </Link>
              </div>
              <ul className="text-sm">
                {(sale.items?.length
                  ? sale.items
                  : [{ description: sale.description, quantity: sale.quantity }]
                ).map((item, index) => (
                  <li key={`${item.description}-${index}`}>
                    {item.quantity}× {item.description}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Ficha do cliente: abre para ver; "Editar" troca para o formulário na mesma janela. */
export default function ClientRecordDialog({
  client,
  close,
  save,
  startEditing = false,
  onChat,
}: {
  client: ClientRow;
  close: () => void;
  save: SaveClient;
  startEditing?: boolean;
  onChat: () => void;
}) {
  const status = client.status || 'Novo';
  return (
    <RecordDialog
      actions={
        <Button asChild variant="outline">
          <Link href={`/ordens?busca=${encodeURIComponent(client.name)}`}>
            <Wrench aria-hidden="true" />
            Ver ordens
          </Link>
        </Button>
      }
      badge={
        <>
          <Badge variant={badgeFor(clientStatusTone(status))}>{status}</Badge>
          {client.vip && (
            <Badge variant="warning">
              <Star aria-hidden="true" />
              VIP
            </Badge>
          )}
        </>
      }
      close={close}
      description={client.phone || 'Sem WhatsApp cadastrado'}
      primary={
        hasValidWhatsapp(client.phone) && (
          <Button onClick={onChat}>
            <MessageCircle aria-hidden="true" />
            Conversar
          </Button>
        )
      }
      renderEdit={(controls) => (
        <ClientForm
          item={client}
          markDirty={controls.markDirty}
          onCancel={controls.cancel}
          onSaved={controls.saved}
          save={save}
        />
      )}
      startEditing={startEditing}
      title={client.name}
    >
      <div className="grid gap-6">
        <RecordSection title="Contato">
          <RecordField label="WhatsApp">{client.phone || 'Não informado'}</RecordField>
          <RecordField label="E-mail">{client.email || 'Não informado'}</RecordField>
          <RecordField label="CPF / CNPJ">{client.document || 'Não informado'}</RecordField>
          <RecordField label="Data de nascimento">
            {brDate(client.birth) || 'Não informada'}
          </RecordField>
          <RecordField className="sm:col-span-2" label="Endereço">
            {client.address || 'Não informado'}
          </RecordField>
        </RecordSection>
        <RecordSection columns={1} title="Observações">
          <RecordField label="Anotações sobre o cliente">
            {client.notes || 'Nenhuma observação'}
          </RecordField>
        </RecordSection>
        <ClientPurchases clientId={client.id} />
        <p className="text-xs text-muted-foreground">
          {client.automatic
            ? 'Cadastrado automaticamente por uma OS ou venda'
            : 'Cadastrado manualmente'}
          {brDate(client.createdAt) ? ` em ${brDate(client.createdAt)}` : ''}.
        </p>
      </div>
    </RecordDialog>
  );
}
