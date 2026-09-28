'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import OrdersTable from '@/components/orders-table';
import {
  OrderCreateModal,
  OrderEditModal,
  type OrderRow,
  type SaveOrder,
} from '@/components/order-modals';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PageHeader from '@/components/ui/page-header';
import type { Order } from '@/lib/types';

const stages = [
  'Todas',
  'Recebido',
  'Diagnóstico',
  'Aguardando aprovação',
  'Em reparo',
  'Teste final',
  'Retirada',
];
const priorities = ['Todas', 'Normal', 'Urgente', 'Garantia'];

export default function OrdersRoute({ initialOrders }: { initialOrders: OrderRow[] }) {
  const { notify } = useFeedback();
  const [orders, setOrders] = useState(initialOrders),
    [modal, setModal] = useState<'create' | 'edit' | null>(null),
    [editing, setEditing] = useState<OrderRow | null>(null),
    [query, setQuery] = useState(''),
    [stage, setStage] = useState('Todas'),
    [priority, setPriority] = useState('Todas');
  const visible = orders.filter((order) => {
    const search = query.trim().toLowerCase();
    const matchesQuery =
      !search ||
      `${order.code} ${order.customer} ${order.device} ${order.phone}`
        .toLowerCase()
        .includes(search);
    const matchesStage = stage === 'Todas' || (order.stage || 'Recebido') === stage;
    const matchesPriority = priority === 'Todas' || (order.priority || 'Normal') === priority;
    return matchesQuery && matchesStage && matchesPriority;
  });
  const filtered = Boolean(query || stage !== 'Todas' || priority !== 'Todas');
  const save: SaveOrder = async (data: Order, id?: string) => {
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Order };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar a ordem.');
      const saved = { id: result.record.id, ...result.record.data };
      setOrders((current) =>
        id ? current.map((order) => (order.id === id ? saved : order)) : [saved, ...current],
      );
      setEditing(null);
      setModal(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar a ordem.', 'error');
      throw error;
    }
  };
  const create = () => {
    setEditing(null);
    setModal('create');
  };
  const edit = (order: OrderRow) => {
    setEditing(order);
    setModal('edit');
  };
  const clearFilters = () => {
    setQuery('');
    setStage('Todas');
    setPriority('Todas');
  };

  return (
    <>
      <PageHeader
        title="Ordens de serviço"
        description="Acompanhe o andamento dos reparos, filtre a fila e atualize cada OS."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/">Painel completo</Link>
            </Button>
            <Button className="w-full sm:w-auto" onClick={create}>
              Nova ordem
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Encontre uma ordem</CardTitle>
            <CardDescription>Busque por OS, cliente ou aparelho.</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{visible.length}</span> de{' '}
              {orders.length} ordens
            </p>
            {filtered && (
              <Button onClick={clearFilters} size="sm" variant="ghost">
                Limpar filtros
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1.5fr)_minmax(12rem,1fr)_minmax(12rem,1fr)]">
          <div className="grid gap-2">
            <Label htmlFor="orders-search">Buscar</Label>
            <Input
              autoComplete="off"
              id="orders-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Número, cliente ou aparelho"
              value={query}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="orders-stage">Etapa</Label>
            <Select onValueChange={setStage} value={stage}>
              <SelectTrigger id="orders-stage">
                <SelectValue placeholder="Todas as etapas" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="orders-priority">Prioridade</Label>
            <Select onValueChange={setPriority} value={priority}>
              <SelectTrigger id="orders-priority">
                <SelectValue placeholder="Todas as prioridades" />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <OrdersTable
        orders={visible}
        emptyMessage={
          orders.length && filtered ? 'Nenhuma ordem corresponde aos filtros.' : undefined
        }
        onCreate={create}
        onEdit={edit}
        onRemoved={(id) => setOrders((current) => current.filter((order) => order.id !== id))}
      />
      {modal === 'create' && <OrderCreateModal close={() => setModal(null)} save={save} />}
      {modal === 'edit' && editing && (
        <OrderEditModal item={editing} close={() => setModal(null)} save={save} />
      )}
    </>
  );
}
