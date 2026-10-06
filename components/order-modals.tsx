'use client';

import { useState, type ChangeEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useFeedback } from '@/components/feedback';
import StockAlertDialog, { StockCheckStatus } from '@/components/stock-alert-dialog';
import { useStockCheck } from '@/components/use-stock-check';
import OrderPhotos from '@/components/order-photos';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { formatMoney as money } from '@/lib/format';
import { addOrderPhotoSelection } from '@/lib/order-photo-selection';
import type { Order, OrderItem, OrderPriority, Part } from '@/lib/types';
import { orderStages as stages } from '@/lib/order-stages';

export type OrderRow = Order & { id: string };
export type PartRow = Part & { id: string };
export type SaveOrder = (data: Order, id?: string, photos?: File[]) => Promise<void>;
type FieldChange = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

const statuses = ['Aberto', 'Pendente', 'Aguardando pagamento', 'Concluído', 'Cancelado'];
const priorities: OrderPriority[] = ['Normal', 'Urgente', 'Garantia'];

export function OrderEditModal({
  item,
  close,
  save,
  parts = [],
}: {
  item: OrderRow;
  close: () => void;
  save: SaveOrder;
  parts?: PartRow[];
}) {
  const { notify } = useFeedback();
  const [form, setForm] = useState({ ...item }),
    [selectedItems, setSelectedItems] = useState<OrderItem[]>(item.items || []),
    [saving, setSaving] = useState(false);
  const stock = useStockCheck(form.status === 'Cancelado' ? [] : selectedItems, item.id);
  const field = (key: keyof OrderRow) => (event: FieldChange) =>
    setForm(
      (value) =>
        ({
          ...value,
          [key]: event.target.type === 'number' ? Number(event.target.value) : event.target.value,
        }) as OrderRow,
    );
  const setChoice = (key: 'stage' | 'status' | 'priority', value: string) =>
    setForm((current) => ({ ...current, [key]: value }) as OrderRow);
  const partsTotal = selectedItems.length
    ? selectedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    : Number(form.parts || 0);
  const total = Number(form.labor || 0) + partsTotal;
  const profit = total - Number(form.cost || 0);
  const submit = async () => {
    if (saving) return;
    if (!String(form.customer || '').trim() || !String(form.device || '').trim()) {
      notify('Informe cliente e aparelho.', 'error');
      return;
    }
    setSaving(true);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const stockDecision = await stock.confirm();
        if (!stockDecision) return;
        try {
          await save(
            {
              ...form,
              acknowledgeNegativeStock: stockDecision.acknowledgeNegativeStock,
              items: selectedItems,
              parts: partsTotal,
              total,
              profit: total - Number(form.cost || 0),
              updatedAt: new Date().toISOString(),
            },
            item.id,
          );
          return;
        } catch (error) {
          if (
            !attempt &&
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'INSUFFICIENT_STOCK'
          )
            continue;
          throw error;
        }
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar a ordem.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-6 sm:pr-12">
            <DialogTitle>Editar ordem {item.code}</DialogTitle>
            <DialogDescription>Atualize os dados e salve as alterações.</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto overscroll-contain p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-4 text-sm font-semibold">Cliente e aparelho</legend>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-customer">Cliente *</Label>
                  <Input
                    autoComplete="name"
                    id="order-edit-customer"
                    onChange={field('customer')}
                    required
                    value={form.customer || ''}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-phone">WhatsApp</Label>
                  <Input
                    autoComplete="tel"
                    id="order-edit-phone"
                    onChange={field('phone')}
                    value={form.phone || ''}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-device">Aparelho *</Label>
                  <Input
                    id="order-edit-device"
                    onChange={field('device')}
                    required
                    value={form.device || ''}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-imei">IMEI / série</Label>
                  <Input id="order-edit-imei" onChange={field('imei')} value={form.imei || ''} />
                </div>
              </fieldset>
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-4 text-sm font-semibold">Serviço</legend>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-problem">Problema relatado</Label>
                  <Textarea
                    id="order-edit-problem"
                    className="min-h-24"
                    onChange={field('problem')}
                    value={form.problem || ''}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-notes">Observações</Label>
                  <Textarea
                    className="min-h-24"
                    id="order-edit-notes"
                    onChange={field('notes')}
                    value={form.notes || ''}
                  />
                </div>
              </fieldset>
              <OrderProductsPicker
                parts={parts}
                value={selectedItems}
                onChange={setSelectedItems}
                stock={stock}
              />
              <OrderPhotos orderId={item.id} />
            </div>

            <div className="grid min-w-0 content-start gap-6 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <legend className="mb-4 text-sm font-semibold">Acompanhamento</legend>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-stage">Etapa</Label>
                  <Select
                    onValueChange={(value) => setChoice('stage', value)}
                    value={form.stage || 'Recebido'}
                  >
                    <SelectTrigger className="w-full" id="order-edit-stage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stage}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-status">Status</Label>
                  <Select
                    onValueChange={(value) => setChoice('status', value)}
                    value={form.status || 'Aberto'}
                  >
                    <SelectTrigger className="w-full" id="order-edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-priority">Prioridade</Label>
                  <Select
                    onValueChange={(value) => setChoice('priority', value)}
                    value={form.priority || 'Normal'}
                  >
                    <SelectTrigger className="w-full" id="order-edit-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorities.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-technician">Técnico responsável</Label>
                  <Input
                    id="order-edit-technician"
                    onChange={field('technician')}
                    value={form.technician || ''}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="order-edit-warranty">Garantia (dias)</Label>
                  <Input
                    id="order-edit-warranty"
                    max="3650"
                    min="1"
                    onChange={field('warrantyDays')}
                    step="1"
                    type="number"
                    value={form.warrantyDays ?? ''}
                  />
                </div>
              </fieldset>
              <fieldset className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                <legend className="mb-4 text-sm font-semibold">Valores (R$)</legend>
                {[
                  { label: 'Mão de obra', key: 'labor' as const },
                  { label: 'Peças', key: 'parts' as const },
                  { label: 'Custo', key: 'cost' as const },
                ].map(({ label, key }) => (
                  <div className="grid gap-2" key={key}>
                    <Label htmlFor={`order-edit-${key}`}>{label}</Label>
                    <Input
                      id={`order-edit-${key}`}
                      min="0"
                      onChange={field(key)}
                      readOnly={key === 'parts' && selectedItems.length > 0}
                      step="0.01"
                      type="number"
                      value={key === 'parts' ? partsTotal : form[key] || 0}
                    />
                  </div>
                ))}
              </fieldset>
            </div>
          </div>

          <div className="grid shrink-0 gap-4 border-t bg-muted/30 px-5 py-4 sm:flex sm:items-center sm:justify-between sm:px-6">
            <div className="grid grid-cols-2 gap-6 sm:gap-8" aria-label="Resumo de valores">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="mt-1 font-semibold tabular-nums">{money(total)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lucro</p>
                <p
                  className={`mt-1 font-semibold tabular-nums ${profit < 0 ? 'text-destructive' : ''}`}
                >
                  {money(profit)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button onClick={close} type="button" variant="outline">
                Cancelar
              </Button>
              <Button disabled={saving || stock.checking || Boolean(stock.error)} type="submit">
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
      <StockAlertDialog alert={stock.alert} onDecision={stock.decide} />
    </Dialog>
  );
}

export function OrderCreateModal({
  close,
  save,
  defaultWarrantyDays = 90,
  parts: availableParts = [],
}: {
  close: () => void;
  save: SaveOrder;
  defaultWarrantyDays?: number;
  parts?: PartRow[];
}) {
  const { notify } = useFeedback();
  const [step, setStep] = useState(1),
    [pattern, setPattern] = useState<number[]>([]),
    [selectedItems, setSelectedItems] = useState<OrderItem[]>([]),
    [labor, setLabor] = useState(0),
    [parts, setParts] = useState(0),
    [cost, setCost] = useState(0),
    [warrantyDays, setWarrantyDays] = useState(defaultWarrantyDays),
    [saving, setSaving] = useState(false),
    [photos, setPhotos] = useState<File[]>([]),
    [photoError, setPhotoError] = useState(''),
    [whatsappConsent, setWhatsappConsent] = useState(false),
    [form, setForm] = useState({
      customer: '',
      phone: '',
      device: '',
      imei: '',
      password: '',
      problem: '',
      notes: '',
      priority: 'Normal' as OrderPriority,
    });
  const partsTotal = selectedItems.length
    ? selectedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    : parts;
  const total = labor + partsTotal;
  const stock = useStockCheck(selectedItems);
  const field = (key: keyof typeof form) => (event: FieldChange) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  const selectPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    const result = addOrderPhotoSelection(photos, selected);
    if (result.error) setPhotoError(result.error);
    else {
      setPhotos([...result.files]);
      setPhotoError('');
    }
  };
  const toggle = (number: number) =>
    setPattern((value) =>
      value.includes(number) ? value.filter((item) => item !== number) : [...value, number],
    );
  const next = () => {
    const valid =
      step === 1 ? form.customer.trim() : step === 2 ? form.device.trim() : form.problem.trim();
    if (!valid) {
      notify('Preencha os campos obrigatórios antes de continuar.', 'error');
      return;
    }
    setStep((value) => Math.min(4, value + 1));
  };
  const create = async () => {
    if (saving) return;
    setSaving(true);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const stockDecision = await stock.confirm();
        if (!stockDecision) return;
        try {
          await save(
            {
              // The server assigns the real, unique code; this placeholder is discarded.
              code: '',
              ...form,
              ...stockDecision,
              whatsappConsent,
              pattern,
              labor,
              parts: partsTotal,
              items: selectedItems,
              cost,
              warrantyDays,
              total,
              profit: total - cost,
              stage: 'Recebido',
              status: 'Aberto',
              createdAt: new Date().toISOString(),
            },
            undefined,
            photos,
          );
          return;
        } catch (error) {
          if (
            !attempt &&
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'INSUFFICIENT_STOCK'
          )
            continue;
          throw error;
        }
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível criar a ordem.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-2xl p-0">
        <form
          autoComplete="off"
          className="grid min-w-0 max-w-full gap-6 p-6"
          onSubmit={(event) => event.preventDefault()}
        >
          <DialogHeader className="pr-8">
            <DialogTitle>Nova ordem de serviço</DialogTitle>
            <DialogDescription>
              Etapa {step} de 4 · preencha os dados do atendimento.
            </DialogDescription>
          </DialogHeader>

          <ol aria-label="Etapas da nova ordem" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {['Cliente', 'Aparelho', 'Diagnóstico', 'Valores'].map((label, index) => (
              <li
                aria-current={step === index + 1 ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                  step === index + 1
                    ? 'border-primary bg-primary/5 text-foreground'
                    : step > index + 1
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                      : 'text-muted-foreground'
                }`}
                key={label}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted font-medium">
                  {step > index + 1 ? '✓' : index + 1}
                </span>
                <span className="truncate">{label}</span>
              </li>
            ))}
          </ol>

          {step === 1 && (
            <section aria-label="Dados do cliente" className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="order-create-customer">Cliente *</Label>
                <Input
                  autoComplete="name"
                  id="order-create-customer"
                  onChange={field('customer')}
                  required
                  value={form.customer}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="order-create-phone">WhatsApp</Label>
                <Input
                  autoComplete="tel"
                  id="order-create-phone"
                  onChange={field('phone')}
                  placeholder="(DDD) número"
                  value={form.phone}
                />
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Input
                  checked={whatsappConsent}
                  className="mt-1 size-4 shrink-0"
                  id="order-whatsapp-consent"
                  onChange={(event) => setWhatsappConsent(event.target.checked)}
                  type="checkbox"
                />
                <Label
                  className="text-sm leading-relaxed text-muted-foreground"
                  htmlFor="order-whatsapp-consent"
                >
                  Cliente autorizou receber atualizações desta ordem pelo WhatsApp.
                </Label>
              </div>
            </section>
          )}

          {step === 2 && (
            <section aria-label="Dados do aparelho" className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="order-create-device">Aparelho *</Label>
                <Input
                  id="order-create-device"
                  onChange={field('device')}
                  placeholder="Marca e modelo"
                  required
                  value={form.device}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="order-create-imei">IMEI / série</Label>
                <Input
                  autoComplete="off"
                  id="order-create-imei"
                  inputMode="text"
                  name="device-imei"
                  onChange={field('imei')}
                  spellCheck={false}
                  value={form.imei}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="order-create-password">Senha numérica</Label>
                <Input
                  autoComplete="new-password"
                  id="order-create-password"
                  inputMode="numeric"
                  name="device-unlock-password"
                  onChange={field('password')}
                  spellCheck={false}
                  type="password"
                  value={form.password}
                />
              </div>
              <fieldset className="grid justify-items-center gap-2 sm:col-span-2">
                <legend className="justify-self-center px-1 text-center text-sm font-medium">
                  Senha padrão desenhada
                </legend>
                <div
                  className="grid w-fit grid-cols-3 gap-2 justify-self-center"
                  role="group"
                  aria-label="Padrão de desbloqueio"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
                    <Button
                      aria-pressed={pattern.includes(number)}
                      className="size-10 rounded-full p-0"
                      key={number}
                      onClick={() => toggle(number)}
                      type="button"
                      variant={pattern.includes(number) ? 'default' : 'outline'}
                    >
                      {number}
                    </Button>
                  ))}
                </div>
                <p className="justify-self-center text-center text-xs text-muted-foreground">
                  Sequência: {pattern.join(' → ') || 'nenhuma'}
                </p>
              </fieldset>
              <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/20 p-4 sm:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="order-create-camera">Fotos de prova (opcional)</Label>
                    <p className="text-xs text-muted-foreground">
                      Use a câmera quando disponível ou escolha imagens da galeria/computador. Até 5
                      fotos, 8 MB cada.
                    </p>
                  </div>
                  <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {photos.length}/5 fotos
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <label htmlFor="order-create-camera" className="cursor-pointer">
                      📷 Abrir câmera
                      <input
                        accept="image/jpeg,image/png,image/webp"
                        aria-label="Abrir câmera para tirar foto de prova do aparelho"
                        capture="environment"
                        className="sr-only"
                        id="order-create-camera"
                        onChange={selectPhotos}
                        type="file"
                      />
                    </label>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <label htmlFor="order-create-gallery" className="cursor-pointer">
                      🖼️ Galeria / computador
                      <input
                        accept="image/jpeg,image/png,image/webp"
                        aria-label="Selecionar fotos de prova da galeria ou computador"
                        className="sr-only"
                        id="order-create-gallery"
                        multiple
                        onChange={selectPhotos}
                        type="file"
                      />
                    </label>
                  </Button>
                </div>
                <p aria-live="polite" className="text-xs text-muted-foreground">
                  {photos.length ? 'Fotos selecionadas:' : 'Nenhuma foto selecionada ainda.'}
                </p>
                {photoError && (
                  <p className="text-sm text-destructive" role="alert">
                    {photoError}
                  </p>
                )}
                {photos.length > 0 && (
                  <ul aria-label="Fotos selecionadas" className="grid min-w-0 gap-2">
                    {photos.map((photo, index) => (
                      <li
                        className="flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                        key={`${photo.name}-${photo.lastModified}-${index}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{photo.name}</span>
                        <Button
                          aria-label={`Remover foto ${photo.name}`}
                          onClick={() =>
                            setPhotos((current) => current.filter((_, i) => i !== index))
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Remover
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {step === 3 && (
            <section aria-label="Diagnóstico da ordem" className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="order-create-problem">Problema relatado *</Label>
                <Textarea
                  id="order-create-problem"
                  onChange={field('problem')}
                  required
                  value={form.problem}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="order-create-notes">Observações do diagnóstico</Label>
                <Textarea
                  id="order-create-notes"
                  onChange={field('notes')}
                  placeholder="Anote testes, condições do aparelho ou orientações importantes."
                  value={form.notes}
                />
              </div>
              <div className="grid max-w-sm gap-2">
                <Label htmlFor="order-create-priority">Prioridade</Label>
                <Select
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, priority: value as OrderPriority }))
                  }
                  value={form.priority}
                >
                  <SelectTrigger id="order-create-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorities.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>
          )}

          {step === 4 && (
            <section aria-label="Valores da ordem" className="grid gap-4 sm:grid-cols-2">
              <OrderProductsPicker
                parts={availableParts}
                value={selectedItems}
                onChange={setSelectedItems}
                stock={stock}
              />
              <div className="grid gap-2">
                <Label htmlFor="order-create-labor">Mão de obra</Label>
                <Input
                  id="order-create-labor"
                  min="0"
                  onChange={(event) => setLabor(Number(event.target.value))}
                  step="0.01"
                  type="number"
                  value={labor}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="order-create-parts">Valor das peças</Label>
                <Input
                  id="order-create-parts"
                  min="0"
                  onChange={(event) => setParts(Number(event.target.value))}
                  readOnly={selectedItems.length > 0}
                  step="0.01"
                  type="number"
                  value={partsTotal}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="order-create-cost">Custo total da assistência</Label>
                <Input
                  id="order-create-cost"
                  min="0"
                  onChange={(event) => setCost(Number(event.target.value))}
                  step="0.01"
                  type="number"
                  value={cost}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="order-create-warranty">Garantia (dias)</Label>
                <Input
                  id="order-create-warranty"
                  max="3650"
                  min="1"
                  onChange={(event) => setWarrantyDays(Number(event.target.value))}
                  step="1"
                  type="number"
                  value={warrantyDays}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-4 sm:col-span-2">
                <div>
                  <p className="text-sm text-muted-foreground">Total estimado</p>
                  <p className="mt-1 font-semibold tabular-nums">{money(total)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Lucro estimado</p>
                  <p
                    className={`mt-1 font-semibold tabular-nums ${total - cost < 0 ? 'text-destructive' : ''}`}
                  >
                    {money(total - cost)}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Revise os valores. A ordem só será criada ao clicar no botão abaixo.
              </p>
            </section>
          )}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
            <Button
              onClick={() => (step === 1 ? close() : setStep((value) => value - 1))}
              type="button"
              variant="outline"
            >
              {step === 1 ? 'Cancelar' : 'Voltar'}
            </Button>
            {step < 4 ? (
              <Button onClick={next} type="button">
                Continuar
              </Button>
            ) : (
              <Button
                disabled={saving || stock.checking || Boolean(stock.error)}
                onClick={() => void create()}
                type="button"
              >
                {saving ? 'Criando…' : 'Criar ordem'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
      <StockAlertDialog alert={stock.alert} onDecision={stock.decide} />
    </Dialog>
  );
}

function OrderProductsPicker({
  parts,
  value,
  onChange,
  stock,
}: {
  parts: PartRow[];
  value: OrderItem[];
  onChange: (items: OrderItem[]) => void;
  stock: ReturnType<typeof useStockCheck>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = (partId: string) => value.find((item) => item.partId === partId);
  const toggle = (part: PartRow, checked: boolean) => {
    if (checked) {
      onChange([
        ...value,
        { partId: part.id, name: part.name, quantity: 1, unitPrice: Number(part.price || 0) },
      ]);
    } else onChange(value.filter((item) => item.partId !== part.id));
  };
  const quantity = (partId: string, next: number) =>
    onChange(value.map((item) => (item.partId === partId ? { ...item, quantity: next } : item)));
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR');
  const query = normalize(search.trim());
  const matches = parts.filter((part) =>
    normalize(`${part.name} ${part.sku || ''} ${part.category || ''}`).includes(query),
  );

  return (
    <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/20 p-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Produtos do estoque</p>
          <p className="text-xs text-muted-foreground">
            Adicione os produtos usados ou vendidos nesta OS.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setSearch('');
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Plus className="size-4" />
              Adicionar produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Escolher produtos do estoque</DialogTitle>
              <DialogDescription>
                Selecione um ou mais produtos. Eles serão incluídos ao salvar a OS.
              </DialogDescription>
            </DialogHeader>
            <Input
              aria-label="Buscar produtos"
              placeholder="Buscar por nome, código ou categoria"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <p role="status" className="text-xs text-muted-foreground">
              {matches.length} produtos encontrados · {value.length} selecionados
            </p>
            <div className="max-h-[45dvh] min-h-0 overflow-y-auto overscroll-contain">
              {matches.length ? (
                <div className="grid gap-2">
                  {matches.map((part) => (
                    <label
                      key={part.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
                    >
                      <Input
                        type="checkbox"
                        aria-label={`Adicionar ${part.name}`}
                        checked={Boolean(selected(part.id))}
                        className="size-4 shrink-0"
                        onChange={(event) => toggle(part, event.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium">{part.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[part.sku, part.category].filter(Boolean).join(' · ')}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {money(part.price)} ·{' '}
                          {stock.check?.parts.find((item) => item.id === part.id)?.available ??
                            part.stock}{' '}
                          em estoque
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {query
                    ? 'Nenhum produto encontrado. Tente outro nome, código ou categoria.'
                    : 'Nenhum produto disponível no estoque.'}
                </p>
              )}
            </div>
            <Button type="button" onClick={() => setOpen(false)}>
              Concluir seleção
            </Button>
          </DialogContent>
        </Dialog>
      </div>
      <StockCheckStatus
        checking={stock.checking}
        error={stock.error}
        shortages={stock.shortages}
        retry={() => void stock.refresh()}
      />
      {value.length ? (
        <div className="grid min-w-0 gap-2">
          {value.map((item) => (
            <div
              className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border bg-background p-3"
              key={item.partId}
            >
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{money(item.unitPrice)} por unidade</p>
                <p className="text-xs text-muted-foreground">
                  Disponível:{' '}
                  {stock.check?.parts.find((part) => part.id === item.partId)?.available ??
                    'verificando…'}
                </p>
              </div>
              <Input
                aria-label={`Quantidade de ${item.name}`}
                className="w-20"
                min="1"
                step="1"
                onChange={(event) => quantity(item.partId, Math.max(1, Number(event.target.value)))}
                type="number"
                value={item.quantity}
              />
              <span className="text-sm font-medium tabular-nums">
                {money(item.quantity * item.unitPrice)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover ${item.name}`}
                title="Remover produto da OS"
                onClick={() => onChange(value.filter((current) => current.partId !== item.partId))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum produto adicionado. Você também pode informar o valor das peças abaixo.
        </p>
      )}
      {value.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Produtos selecionados:{' '}
          <strong>
            {money(value.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))}
          </strong>
        </p>
      )}
    </div>
  );
}
