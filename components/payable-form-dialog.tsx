'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
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
import { formatMoney } from '@/lib/format';
import { recurrenceLabels, type PayableRecurrence } from '@/lib/payable-recurrence';
import {
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  installmentDueDates,
  splitInstallments,
} from '@/lib/payable-schedule';
import { todayInSaoPaulo } from '@/lib/warranty';
import type { Payable } from '@/lib/types';
import type { PayableRecord } from '@/lib/repos/payables';
import type { PayableRow } from '@/components/payable-pay-dialog';

type Kind = 'expense' | 'purchase';
type Plan = 'once' | 'installments' | 'repeat';

const brDate = (isoDate: string) => isoDate.split('-').reverse().join('/');
const shortDate = (isoDate: string) => brDate(isoDate).slice(0, 5);

/** Resumo das parcelas para o lojista conferir antes de criar. */
export function installmentPreview(amount: number, count: number, firstDueDate: string) {
  const amounts = splitInstallments(amount, count);
  if (!amounts || !firstDueDate) return null;
  const dates = installmentDueDates(firstDueDate, count);
  const last = amounts[amounts.length - 1];
  const value =
    last === amounts[0]
      ? `${count}× de ${formatMoney(amounts[0])}`
      : `${count - 1}× de ${formatMoney(amounts[0])} e a última de ${formatMoney(last)}`;
  const due =
    dates.length <= 4
      ? dates.map(shortDate).join(', ')
      : `${dates.slice(0, 3).map(shortDate).join(', ')}… até ${brDate(dates[dates.length - 1])}`;
  return { value, due };
}

function Choice<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string; detail?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <label
            className="cursor-pointer rounded-lg border p-2.5 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 hover:bg-muted/50"
            key={option.value}
          >
            <input
              checked={value === option.value}
              className="sr-only"
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span className="block font-medium">{option.label}</span>
            {option.detail && (
              <span className="block text-xs text-muted-foreground">{option.detail}</span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export default function PayableFormDialog({
  item,
  defaultKind,
  suppliers,
  categories,
  close,
  saved,
}: {
  item: PayableRow | null;
  defaultKind: Kind;
  suppliers: string[];
  categories: string[];
  close: () => void;
  saved: (records: PayableRecord[]) => void;
}) {
  const { notify } = useFeedback();
  const installment = Boolean(item?.installmentCount);
  const [kind, setKind] = useState<Kind>(
    item ? (item.source === 'purchase' ? 'purchase' : 'expense') : defaultKind,
  );
  const [plan, setPlan] = useState<Plan>(
    installment ? 'installments' : item?.recurrence ? 'repeat' : 'once',
  );
  const [recurrence, setRecurrence] = useState<PayableRecurrence>(item?.recurrence || 'monthly');
  const [count, setCount] = useState('3');
  const [form, setForm] = useState({
    description: item?.description || '',
    supplier: item?.supplier || '',
    category: item?.category || '',
    amount: item ? item.amount.toFixed(2) : '',
    dueDate: item ? item.dueDate || '' : todayInSaoPaulo(),
    paymentCode: item?.paymentCode || '',
    notes: item?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const field = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const splitting = !item && plan === 'installments';
  const repeating = plan === 'repeat' && kind === 'expense';
  const preview = splitting
    ? installmentPreview(Number(form.amount), Number(count), form.dueDate)
    : null;
  const blocked = (splitting && !preview) || (repeating && !form.dueDate);

  const chooseKind = (next: Kind) => {
    setKind(next);
    if (next === 'purchase' && plan === 'repeat') setPlan('once');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || blocked) return;
    setSaving(true);
    const data: Payable & { installments?: number } = {
      description: form.description,
      supplier: form.supplier,
      category: form.category,
      source: installment ? item!.source : kind === 'purchase' ? 'purchase' : 'other',
      recurrence: repeating ? recurrence : undefined,
      amount: Number(form.amount),
      dueDate: form.dueDate || undefined,
      paymentCode: form.paymentCode,
      notes: form.notes,
      ...(splitting ? { installments: Number(count) } : {}),
    };
    try {
      const response = await fetch('/api/payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id: item?.id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: PayableRecord;
        records?: PayableRecord[];
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar a conta.');
      saved(result.records || [result.record]);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar a conta.', 'error');
      setSaving(false);
    }
  };

  const purchase = kind === 'purchase';
  return (
    <Dialog onOpenChange={(open) => !open && !saving && close()} open>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {item ? 'Editar conta' : purchase ? 'Nova compra' : 'Nova conta a pagar'}
            </DialogTitle>
            <DialogDescription>
              {installment
                ? `Parcela ${item!.installmentNumber} de ${item!.installmentCount}. As outras parcelas não mudam.`
                : 'A conta só entra no Caixa quando você registrar o pagamento.'}
            </DialogDescription>
          </DialogHeader>
          {!installment && (
            <Choice
              legend="Tipo"
              name="payable-kind"
              onChange={chooseKind}
              options={[
                { value: 'expense', label: 'Despesa', detail: 'Aluguel, energia, serviços' },
                { value: 'purchase', label: 'Compra', detail: 'Peças, materiais, equipamentos' },
              ]}
              value={kind}
            />
          )}
          <Field id="payable-description" label="Descrição *">
            <Input
              id="payable-description"
              maxLength={200}
              onChange={field('description')}
              placeholder={purchase ? 'Ex.: Telas e baterias' : 'Ex.: Aluguel da loja'}
              required
              value={form.description}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="payable-supplier"
              label={purchase ? 'Fornecedor' : 'Fornecedor ou favorecido'}
            >
              <Input
                id="payable-supplier"
                list="payable-supplier-options"
                maxLength={120}
                onChange={field('supplier')}
                value={form.supplier}
              />
              <datalist id="payable-supplier-options">
                {suppliers.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <Field id="payable-category" label="Categoria">
              <Input
                id="payable-category"
                list="payable-category-options"
                maxLength={80}
                onChange={field('category')}
                placeholder={purchase ? 'Ex.: Peças' : 'Ex.: Aluguel'}
                value={form.category}
              />
              <datalist id="payable-category-options">
                {categories.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
          </div>
          {!item && (
            <Choice
              legend="Pagamento"
              name="payable-plan"
              onChange={setPlan}
              options={[
                { value: 'once', label: 'Uma vez' },
                { value: 'installments', label: 'Parcelado' },
                // Compra não se repete: a compra a prazo é parcelada.
                ...(purchase ? [] : [{ value: 'repeat' as const, label: 'Repete' }]),
              ]}
              value={plan}
            />
          )}
          {item && !installment && kind === 'expense' && (
            <Choice
              legend="Repetição"
              name="payable-plan"
              onChange={setPlan}
              options={[
                { value: 'once', label: 'Não repete' },
                { value: 'repeat', label: 'Repete' },
              ]}
              value={plan === 'repeat' ? 'repeat' : 'once'}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="payable-amount" label={splitting ? 'Valor total (R$) *' : 'Valor (R$) *'}>
              <Input
                id="payable-amount"
                inputMode="decimal"
                min="0.01"
                onChange={field('amount')}
                required
                step="0.01"
                type="number"
                value={form.amount}
              />
            </Field>
            <Field
              id="payable-due-date"
              label={
                splitting ? '1º vencimento *' : repeating ? 'Próximo vencimento *' : 'Vencimento'
              }
            >
              <Input
                id="payable-due-date"
                onChange={field('dueDate')}
                required={splitting || repeating}
                type="date"
                value={form.dueDate}
              />
            </Field>
          </div>
          {splitting && (
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[8rem_1fr] sm:items-end">
              <Field id="payable-installments" label="Parcelas">
                <Input
                  id="payable-installments"
                  inputMode="numeric"
                  max={MAX_INSTALLMENTS}
                  min={MIN_INSTALLMENTS}
                  onChange={(event) => setCount(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={count}
                />
              </Field>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {preview ? (
                  <>
                    <strong className="font-medium text-foreground">{preview.value}</strong>
                    <br />
                    Vencimentos todo mês: {preview.due}
                  </>
                ) : (
                  `Informe valor, 1º vencimento e de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas.`
                )}
              </p>
            </div>
          )}
          {repeating && (
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[10rem_1fr] sm:items-end">
              <Field id="payable-recurrence" label="Repete">
                <Select
                  onValueChange={(value) => setRecurrence(value as PayableRecurrence)}
                  value={recurrence}
                >
                  <SelectTrigger className="w-full" id="payable-recurrence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(recurrenceLabels) as PayableRecurrence[]).map((option) => (
                      <SelectItem key={option} value={option}>
                        {recurrenceLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <p className="text-sm text-muted-foreground">
                Fica uma conta em aberto por vez. Ao pagar, a próxima é criada com o mesmo valor.
              </p>
            </div>
          )}
          <Field id="payable-code" label="Código de pagamento">
            <Input
              autoComplete="off"
              className="font-mono"
              id="payable-code"
              maxLength={300}
              onChange={field('paymentCode')}
              placeholder="Linha digitável do boleto ou chave Pix"
              value={form.paymentCode}
            />
          </Field>
          <Field id="payable-notes" label="Observações">
            <Textarea
              id="payable-notes"
              maxLength={1000}
              onChange={field('notes')}
              rows={2}
              value={form.notes}
            />
          </Field>
          <DialogFooter>
            <Button disabled={saving} onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving || blocked} type="submit">
              {saving
                ? 'Salvando…'
                : item
                  ? 'Salvar alterações'
                  : splitting && preview
                    ? `Criar ${count} parcelas`
                    : purchase
                      ? 'Registrar compra'
                      : 'Registrar conta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
