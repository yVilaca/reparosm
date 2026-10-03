'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/ui/page-header';
import { formatMoney } from '@/lib/format';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { Payable, PayableStatus } from '@/lib/types';
import type { PayableRecord } from '@/lib/repos/payables';

type Mode = 'all' | 'purchases';
type PayableRow = Payable & { id: string };

const sourceLabels = { purchase: 'Compra', fixed: 'Fixa', other: 'Outra' } as const;

export default function PayablesRoute({
  initialPayables,
  mode = 'all',
  title = 'Contas a pagar',
  description = 'Organize compras, aluguel, mensalidades e outras saídas futuras.',
}: {
  initialPayables: PayableRecord[];
  mode?: Mode;
  title?: string;
  description?: string;
}) {
  const { notify, confirm } = useFeedback();
  const router = useRouter();
  const [rows, setRows] = useState<PayableRow[]>(
    initialPayables.map((record) => ({ id: record.id, ...record.data })),
  );
  const [editing, setEditing] = useState<PayableRow | null>(null);
  const [open, setOpen] = useState(false);
  const visible = rows.filter((row) => mode !== 'purchases' || row.source === 'purchase');
  const pending = visible.filter((row) => row.status !== 'paid');
  const pendingAmount = pending.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const overdue = pending.filter((row) => row.dueDate && row.dueDate < todayInSaoPaulo());

  const save = async (data: Payable, id?: string) => {
    try {
      const response = await fetch('/api/payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as { error?: string; record?: PayableRecord };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar a conta.');
      const saved = { id: result.record.id, ...result.record.data };
      setRows((current) =>
        id ? current.map((row) => (row.id === id ? saved : row)) : [saved, ...current],
      );
      setOpen(false);
      setEditing(null);
      router.refresh();
      notify(id ? 'Conta atualizada.' : 'Conta registrada.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar a conta.', 'error');
    }
  };

  const pay = async (row: PayableRow) => {
    // ponytail: native prompt keeps this one-field settlement flow minimal; replace it with a shared modal if more settlement fields are added.
    const method = window.prompt('Forma de pagamento:', row.method || 'Pix');
    if (!method?.trim()) return;
    try {
      const response = await fetch('/api/payables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, method: method.trim() }),
      });
      const result = (await response.json()) as { error?: string; record?: PayableRecord };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível pagar a conta.');
      const saved = { id: result.record.id, ...result.record.data };
      setRows((current) => current.map((item) => (item.id === row.id ? saved : item)));
      router.refresh();
      notify('Conta paga e saída lançada no caixa.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível pagar a conta.', 'error');
    }
  };

  const remove = async (row: PayableRow) => {
    if (!(await confirm(`Excluir a conta ${row.description}?`))) return;
    const response = await fetch(`/api/payables?id=${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      notify(result.error || 'Não foi possível excluir a conta.', 'error');
      return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    notify('Conta excluída.', 'success');
  };

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              {mode === 'purchases' ? 'Nova compra' : 'Nova conta'}
            </Button>
          </div>
        }
      />
      <section aria-label="Resumo de contas a pagar" className="mb-4 grid gap-3 sm:grid-cols-3">
        <Summary
          label="Em aberto"
          value={formatMoney(pendingAmount)}
          detail={`${pending.length} contas`}
        />
        <Summary label="Vencidas" value={String(overdue.length)} detail="Precisam de atenção" />
        <Summary label="Total listado" value={String(visible.length)} detail="Compras e despesas" />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === 'purchases' ? 'Compras registradas' : 'Contas cadastradas'}
          </CardTitle>
          <CardDescription>
            Uma conta só entra no caixa quando for marcada como paga.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visible.length ? (
            <div className="grid gap-3">
              {visible.map((row) => (
                <article
                  className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                  key={row.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium">{row.description}</h3>
                      <Badge
                        variant={
                          row.status === 'paid'
                            ? 'success'
                            : row.dueDate && row.dueDate < todayInSaoPaulo()
                              ? 'destructive'
                              : 'warning'
                        }
                      >
                        {row.status === 'paid'
                          ? 'Paga'
                          : row.dueDate && row.dueDate < todayInSaoPaulo()
                            ? 'Vencida'
                            : 'Em aberto'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[row.supplier, row.category || (row.source ? sourceLabels[row.source] : '')]
                        .filter(Boolean)
                        .join(' · ') || 'Sem categoria'}
                    </p>
                    {row.dueDate && (
                      <p className="text-xs text-muted-foreground">Vencimento: {row.dueDate}</p>
                    )}
                  </div>
                  <strong className="tabular-nums">{formatMoney(row.amount)}</strong>
                  <div className="flex flex-wrap gap-2">
                    {row.status !== 'paid' && (
                      <Button onClick={() => void pay(row)} size="sm">
                        Marcar como paga
                      </Button>
                    )}
                    {row.status !== 'paid' && (
                      <Button
                        onClick={() => {
                          setEditing(row);
                          setOpen(true);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Editar
                      </Button>
                    )}
                    {row.status !== 'paid' && (
                      <Button onClick={() => void remove(row)} size="sm" variant="destructive">
                        Excluir
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma conta cadastrada.
            </p>
          )}
        </CardContent>
      </Card>
      {open && <PayableModal item={editing} mode={mode} close={() => setOpen(false)} save={save} />}
    </>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <strong className="text-xl tabular-nums">{value}</strong>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function PayableModal({
  item,
  mode,
  close,
  save,
}: {
  item: PayableRow | null;
  mode: Mode;
  close: () => void;
  save: (data: Payable, id?: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    description: item?.description || '',
    supplier: item?.supplier || '',
    category: item?.category || '',
    source: item?.source || (mode === 'purchases' ? 'purchase' : 'other'),
    amount: item?.amount ? String(item.amount) : '',
    dueDate: item?.dueDate || todayInSaoPaulo(),
    notes: item?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const field = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await save(
        {
          description: form.description,
          supplier: form.supplier,
          category: form.category,
          source: form.source as Payable['source'],
          amount: Number(form.amount),
          dueDate: form.dueDate,
          notes: form.notes,
          status: item?.status || ('pending' as PayableStatus),
        },
        item?.id,
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0">
        <form className="grid gap-5 p-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {item ? 'Editar conta' : mode === 'purchases' ? 'Nova compra' : 'Nova conta a pagar'}
            </DialogTitle>
            <DialogDescription>
              Registre a obrigação agora e pague quando ela for quitada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="payable-description">Descrição *</Label>
            <Input
              id="payable-description"
              onChange={field('description')}
              required
              value={form.description}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="payable-supplier">Fornecedor</Label>
              <Input id="payable-supplier" onChange={field('supplier')} value={form.supplier} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payable-category">Categoria</Label>
              <Input
                id="payable-category"
                onChange={field('category')}
                placeholder="Peças, aluguel…"
                value={form.category}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="payable-amount">Valor *</Label>
              <Input
                id="payable-amount"
                min="0.01"
                onChange={field('amount')}
                required
                step="0.01"
                type="number"
                value={form.amount}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payable-due-date">Vencimento</Label>
              <Input
                id="payable-due-date"
                onChange={field('dueDate')}
                type="date"
                value={form.dueDate}
              />
            </div>
          </div>
          {mode !== 'purchases' && (
            <div className="grid gap-2">
              <Label htmlFor="payable-source">Tipo</Label>
              <Select
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    source: value as NonNullable<Payable['source']>,
                  }))
                }
                value={form.source}
              >
                <SelectTrigger id="payable-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="other">Outra</SelectItem>
                  <SelectItem value="fixed">Fixa</SelectItem>
                  <SelectItem value="purchase">Compra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="payable-notes">Observações</Label>
            <Textarea id="payable-notes" onChange={field('notes')} value={form.notes} />
          </div>
          <DialogFooter>
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Salvando…' : 'Salvar conta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
