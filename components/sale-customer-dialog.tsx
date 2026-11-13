'use client';

import { useState, type FormEvent } from 'react';
import SaleCustomerField from '@/components/sale-customer-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatMoney } from '@/lib/format';
import { saleCustomer, type ClientOption } from '@/lib/quick-sale';
import type { SaleCustomer } from '@/lib/repos/quick-sales';

/**
 * Último passo da venda: para quem ela é. O cliente é opcional; Enter (ou
 * "Receber") com o campo vazio recebe sem cliente.
 */
export default function SaleCustomerDialog({
  open,
  total,
  method,
  clients,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  total: number;
  method: string;
  clients: ClientOption[];
  onCancel: () => void;
  onConfirm: (customer: SaleCustomer | undefined) => void;
}) {
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<ClientOption | null>(null);
  const customer = saleCustomer(clients, chosen, text);
  const reset = () => {
    setText('');
    setChosen(null);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onConfirm(customer);
    reset();
  };
  const name = customer && ('name' in customer ? customer.name : chosen?.name || text.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        onCancel();
        reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Para quem é a venda?</DialogTitle>
          <DialogDescription>
            {formatMoney(total)} · {method}. O cliente é opcional: deixe em branco para receber sem
            cliente.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" noValidate onSubmit={submit}>
          <SaleCustomerField
            autoFocus
            chosen={chosen}
            clients={clients}
            onChoose={setChosen}
            onText={setText}
            text={text}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              onClick={() => {
                onCancel();
                reset();
              }}
              type="button"
              variant="outline"
            >
              Voltar à venda
            </Button>
            <Button type="submit">
              {name ? `Receber de ${name.split(/\s+/)[0]}` : `Receber ${formatMoney(total)}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
