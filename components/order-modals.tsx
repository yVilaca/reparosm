'use client';

import { useState, type ChangeEvent } from 'react';
import { useFeedback } from '@/components/feedback';
import OrderPhotos from '@/components/order-photos';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { formatMoney as money } from '@/lib/format';
import { addOrderPhotoSelection } from '@/lib/order-photo-selection';
import type { Order, OrderPriority } from '@/lib/types';

export type OrderRow = Order & { id: string };
export type SaveOrder = (data: Order, id?: string, photos?: File[]) => Promise<void>;
type FieldChange = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

const stages = [
  'Recebido',
  'Diagnóstico',
  'Aguardando aprovação',
  'Em reparo',
  'Teste final',
  'Retirada',
];
const statuses = ['Aberto', 'Pendente', 'Aguardando pagamento', 'Concluído', 'Cancelado'];
const priorities: OrderPriority[] = ['Normal', 'Urgente', 'Garantia'];

export function OrderEditModal({
  item,
  close,
  save,
}: {
  item: OrderRow;
  close: () => void;
  save: SaveOrder;
}) {
  const { notify } = useFeedback();
  const [form, setForm] = useState({ ...item }),
    [saving, setSaving] = useState(false);
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
  const total = Number(form.labor || 0) + Number(form.parts || 0);
  const profit = total - Number(form.cost || 0);
  const submit = async () => {
    if (!String(form.customer || '').trim() || !String(form.device || '').trim()) {
      notify('Informe cliente e aparelho.', 'error');
      return;
    }
    setSaving(true);
    try {
      await save({ ...form, total, profit, updatedAt: new Date().toISOString() }, item.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-3xl p-0">
        <form
          className="grid max-h-[90dvh] gap-6 overflow-y-auto p-6"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader className="pr-8">
            <DialogTitle>Editar ordem {item.code}</DialogTitle>
            <DialogDescription>Atualize os dados e salve as alterações.</DialogDescription>
          </DialogHeader>

          <OrderPhotos orderId={item.id} />

          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="order-edit-problem">Problema relatado</Label>
              <Textarea
                id="order-edit-problem"
                onChange={field('problem')}
                value={form.problem || ''}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="order-edit-stage">Etapa</Label>
              <Select
                onValueChange={(value) => setChoice('stage', value)}
                value={form.stage || 'Recebido'}
              >
                <SelectTrigger id="order-edit-stage">
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
                <SelectTrigger id="order-edit-status">
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
                <SelectTrigger id="order-edit-priority">
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  step="0.01"
                  type="number"
                  value={form[key] || 0}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-4">
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

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OrderCreateModal({
  close,
  save,
  defaultWarrantyDays = 90,
}: {
  close: () => void;
  save: SaveOrder;
  defaultWarrantyDays?: number;
}) {
  const { notify } = useFeedback();
  const [step, setStep] = useState(1),
    [pattern, setPattern] = useState<number[]>([]),
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
      priority: 'Normal' as OrderPriority,
    });
  const total = labor + parts;
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
      await save(
        {
          // The server assigns the real, unique code; this placeholder is discarded.
          code: '',
          ...form,
          whatsappConsent,
          pattern,
          labor,
          parts,
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-2xl p-0">
        <form
          className="grid max-h-[90dvh] gap-6 overflow-y-auto p-6"
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
            <section aria-label="Dados do aparelho" className="grid gap-4 sm:grid-cols-2">
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
                <Input id="order-create-imei" onChange={field('imei')} value={form.imei} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="order-create-password">Senha numérica</Label>
                <Input
                  autoComplete="off"
                  id="order-create-password"
                  onChange={field('password')}
                  type="password"
                  value={form.password}
                />
              </div>
              <fieldset className="grid gap-2 sm:col-span-2">
                <legend className="text-sm font-medium">Senha padrão desenhada</legend>
                <div
                  className="grid w-fit grid-cols-3 gap-2"
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
                <p className="text-xs text-muted-foreground">
                  Sequência: {pattern.join(' → ') || 'nenhuma'}
                </p>
              </fieldset>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="order-create-photos">Fotos de prova (opcional)</Label>
                <p className="text-xs text-muted-foreground">
                  Fotografe ou selecione imagens do aparelho. Até 5 fotos, 8 MB cada.
                </p>
                <Button asChild size="sm" variant="outline" className="w-fit">
                  <label htmlFor="order-create-photos" className="cursor-pointer">
                    📷 Fotografar / selecionar fotos
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Fotografar ou selecionar fotos de prova do aparelho"
                      capture="environment"
                      className="sr-only"
                      id="order-create-photos"
                      multiple
                      onChange={selectPhotos}
                      type="file"
                    />
                  </label>
                </Button>
                <p aria-live="polite" className="text-xs text-muted-foreground">
                  {photos.length} de 5 fotos selecionadas
                </p>
                {photoError && (
                  <p className="text-sm text-destructive" role="alert">
                    {photoError}
                  </p>
                )}
                {photos.length > 0 && (
                  <ul aria-label="Fotos selecionadas" className="grid gap-1">
                    {photos.map((photo, index) => (
                      <li
                        className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
                        key={`${photo.name}-${photo.lastModified}-${index}`}
                      >
                        <span className="truncate">{photo.name}</span>
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
                  step="0.01"
                  type="number"
                  value={parts}
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
              <Button disabled={saving} onClick={() => void create()} type="button">
                {saving ? 'Criando…' : 'Criar ordem'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
