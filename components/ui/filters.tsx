'use client';

import { useId, useState } from 'react';
import { Popover } from 'radix-ui';
import { ListFilter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type Filter = { field: string; value: string };
export type FilterField = { key: string; label: string; options?: string[] };

export default function Filters({
  fields,
  value,
  onChange,
}: {
  fields: FilterField[];
  value: Filter[];
  onChange: (filters: Filter[]) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [fieldKey, setFieldKey] = useState(fields[0]?.key || '');
  const [draft, setDraft] = useState('');
  const field = fields.find((item) => item.key === fieldKey);
  const selectClass =
    'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button size="sm" type="button" variant="outline">
            <ListFilter aria-hidden="true" /> Filtros
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            aria-label="Adicionar filtro"
            className="z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-4 text-popover-foreground shadow-md"
          >
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const next = draft.trim();
                if (!field || !next || (field.options && !field.options.includes(next))) return;
                onChange([
                  ...value.filter((item) => item.field !== field.key),
                  { field: field.key, value: next },
                ]);
                setDraft('');
                setOpen(false);
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-field`}>Campo</Label>
                <Select
                  value={fieldKey}
                  onValueChange={(value) => {
                    setFieldKey(value);
                    setDraft('');
                  }}
                >
                  <SelectTrigger id={`${id}-field`} className={selectClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" position="popper">
                    {fields.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-value`}>Valor</Label>
                {field?.options ? (
                  <Select value={draft} onValueChange={setDraft} required>
                    <SelectTrigger id={`${id}-value`} className={selectClass}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent align="start" position="popper">
                      {field.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`${id}-value`}
                    autoComplete="off"
                    placeholder="Digite um valor"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    required
                  />
                )}
              </div>
              <Button size="sm" type="submit" disabled={!field || !draft.trim()}>
                Adicionar filtro
              </Button>
            </form>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {value.map((filter) => {
        const label = fields.find((item) => item.key === filter.field)?.label || filter.field;
        return (
          <button
            key={filter.field}
            type="button"
            aria-label={`Remover filtro ${label}: ${filter.value}`}
            title="Clique para remover este filtro"
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange(value.filter((item) => item.field !== filter.field))}
          >
            <span className="truncate">
              {label}: {filter.value}
            </span>
            <X className="size-3 shrink-0" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
