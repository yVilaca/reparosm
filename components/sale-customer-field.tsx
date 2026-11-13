'use client';

import { useState, type KeyboardEvent } from 'react';
import { UserRound, X } from 'lucide-react';
import { cn } from 'cn';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { matchClients, saleCustomer, type ClientOption } from '@/lib/quick-sale';

/**
 * Cliente opcional da venda: busca entre os cadastrados ou, digitando um nome
 * novo, cadastra o cliente junto com a venda.
 */
export default function SaleCustomerField({
  clients,
  text,
  chosen,
  onText,
  onChoose,
  autoFocus,
}: {
  autoFocus?: boolean;
  clients: ClientOption[];
  text: string;
  chosen: ClientOption | null;
  onText: (text: string) => void;
  onChoose: (client: ClientOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = chosen ? [] : matchClients(clients, text);
  const listOpen = open && matches.length > 0;
  const customer = saleCustomer(clients, chosen, text);
  const known = customer && 'id' in customer;

  const choose = (client: ClientOption) => {
    onChoose(client);
    onText(client.name);
    setOpen(false);
    setActive(-1);
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + 1) % matches.length);
    } else if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault();
      setActive((current) => (current <= 0 ? matches.length - 1 : current - 1));
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (event.key === 'Enter' && listOpen && active >= 0) {
      event.preventDefault();
      choose(matches[active]);
    }
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor="sale-customer" className="flex-wrap gap-x-1 gap-y-0">
        Cliente <span className="font-normal text-muted-foreground">(opcional)</span>
      </Label>
      <div className="relative">
        <UserRound
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-activedescendant={
            listOpen && active >= 0 ? `sale-client-${matches[active].id}` : undefined
          }
          aria-autocomplete="list"
          aria-controls="sale-clients"
          aria-expanded={listOpen}
          autoComplete="off"
          autoFocus={autoFocus}
          className="pl-9"
          id="sale-customer"
          maxLength={120}
          name="customer"
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            onText(event.target.value);
            onChoose(null);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Nome ou WhatsApp do cliente"
          role="combobox"
          value={text}
        />
        {listOpen && (
          <ul
            aria-label="Clientes cadastrados"
            className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10"
            id="sale-clients"
            role="listbox"
          >
            {matches.map((client, index) => (
              <li
                aria-selected={index === active}
                className={cn(
                  'cursor-pointer px-3 py-2',
                  index === active ? 'bg-muted' : 'hover:bg-muted/60',
                )}
                id={`sale-client-${client.id}`}
                key={client.id}
                onClick={() => choose(client)}
                // Escolher sem tirar o foco do campo (o blur fecharia a lista antes).
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                role="option"
              >
                <span className="block truncate font-medium">{client.name}</span>
                {client.phone && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {client.phone}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {customer && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {known
            ? 'A venda entra no histórico deste cliente.'
            : 'Cliente novo: será cadastrado com este nome junto com a venda.'}
          <button
            className="inline-flex items-center gap-0.5 underline-offset-4 hover:underline"
            onClick={() => {
              onChoose(null);
              onText('');
            }}
            type="button"
          >
            <X aria-hidden="true" className="size-3" />
            Sem cliente
          </button>
        </p>
      )}
    </div>
  );
}
