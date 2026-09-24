'use client';

import { useState, type ChangeEvent } from 'react';
import { formatMoney as money } from '@/lib/format';
import type { Order, OrderPriority } from '@/lib/types';

export type OrderRow = Order & { id: string };
export type SaveOrder = (data: Order, id?: string) => Promise<void>;
type FieldChange = ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;

const stages = [
  'Recebido',
  'Diagnóstico',
  'Aguardando aprovação',
  'Em reparo',
  'Teste final',
  'Retirada',
];

export function OrderEditModal({
  item,
  close,
  save,
}: {
  item: OrderRow;
  close: () => void;
  save: SaveOrder;
}) {
  const [form, setForm] = useState({ ...item }),
    [saving, setSaving] = useState(false);
  const field = (key: keyof OrderRow) => (e: FieldChange) =>
    setForm(
      (value) =>
        ({
          ...value,
          [key]: e.target.type === 'number' ? Number(e.target.value) : e.target.value,
        }) as OrderRow,
    );
  const total = Number(form.labor || 0) + Number(form.parts || 0),
    profit = total - Number(form.cost || 0);
  const submit = async () => {
    if (!String(form.customer || '').trim() || !String(form.device || '').trim()) {
      alert('Informe cliente e aparelho.');
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
    <div className="modal-backdrop">
      <form className="modal order-edit-modal" onSubmit={(e) => e.preventDefault()}>
        <div className="modal-title">
          <div>
            <span>✎</span>
            <div>
              <h2>Editar ordem {item.code}</h2>
              <p>Atualize os dados e salve as alterações</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <div className="form-row">
          <label>
            Cliente *<input value={form.customer || ''} onChange={field('customer')} />
          </label>
          <label>
            WhatsApp
            <input value={form.phone || ''} onChange={field('phone')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Aparelho *<input value={form.device || ''} onChange={field('device')} />
          </label>
          <label>
            IMEI / série
            <input value={form.imei || ''} onChange={field('imei')} />
          </label>
        </div>
        <label>
          Problema relatado
          <textarea value={form.problem || ''} onChange={field('problem')} />
        </label>
        <div className="form-row">
          <label>
            Etapa
            <select value={form.stage || 'Recebido'} onChange={field('stage')}>
              {stages.map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={form.status || 'Aberto'} onChange={field('status')}>
              <option>Aberto</option>
              <option>Pendente</option>
              <option>Aguardando pagamento</option>
              <option>Concluído</option>
              <option>Cancelado</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Prioridade
            <select value={form.priority || 'Normal'} onChange={field('priority')}>
              <option>Normal</option>
              <option>Urgente</option>
              <option>Garantia</option>
            </select>
          </label>
          <label>
            Técnico responsável
            <input value={form.technician || ''} onChange={field('technician')} />
          </label>
        </div>
        <div className="form-row three">
          <label>
            Mão de obra
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.labor || 0}
              onChange={field('labor')}
            />
          </label>
          <label>
            Peças
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.parts || 0}
              onChange={field('parts')}
            />
          </label>
          <label>
            Custo
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cost || 0}
              onChange={field('cost')}
            />
          </label>
        </div>
        <div className="estimate-grid">
          <div>
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <div>
            <span>Lucro</span>
            <strong className={profit < 0 ? 'negative' : ''}>{money(profit)}</strong>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button type="button" className="primary" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function OrderCreateModal({ close, save }: { close: () => void; save: SaveOrder }) {
  const [step, setStep] = useState(1),
    [pattern, setPattern] = useState<number[]>([]),
    [labor, setLabor] = useState(0),
    [parts, setParts] = useState(0),
    [cost, setCost] = useState(0),
    [saving, setSaving] = useState(false),
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
  const field = (key: keyof typeof form) => (e: FieldChange) =>
    setForm((value) => ({ ...value, [key]: e.target.value }));
  const toggle = (number: number) =>
    setPattern((value) =>
      value.includes(number) ? value.filter((item) => item !== number) : [...value, number],
    );
  const next = () => {
    const valid =
      step === 1 ? form.customer.trim() : step === 2 ? form.device.trim() : form.problem.trim();
    if (!valid) {
      alert('Preencha os campos obrigatórios antes de continuar.');
      return;
    }
    setStep((value) => Math.min(4, value + 1));
  };
  const create = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await save({
        code: `OS-${Date.now().toString().slice(-5)}`,
        ...form,
        whatsappConsent,
        pattern,
        labor,
        parts,
        cost,
        total,
        profit: total - cost,
        stage: 'Recebido',
        status: 'Aberto',
        createdAt: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <form
        className="modal order-modal"
        onSubmit={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'TEXTAREA')
            event.preventDefault();
        }}
      >
        <div className="modal-title">
          <div>
            <span>⚒</span>
            <div>
              <h2>Nova ordem de serviço</h2>
              <p>Etapa {step} de 4</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <div className="form-steps">
          {['Cliente', 'Aparelho', 'Diagnóstico', 'Valores'].map((label, index) => (
            <div
              className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}
              key={label}
            >
              <i>{step > index + 1 ? '✓' : index + 1}</i>
              <span>{label}</span>
            </div>
          ))}
        </div>
        {step === 1 && (
          <div className="form-section">
            <label>
              Cliente *<input value={form.customer} onChange={field('customer')} required />
            </label>
            <label>
              WhatsApp
              <input value={form.phone} onChange={field('phone')} placeholder="(DDD) número" />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={whatsappConsent}
                onChange={(event) => setWhatsappConsent(event.target.checked)}
              />{' '}
              Cliente autorizou receber atualizações desta ordem pelo WhatsApp.
            </label>
          </div>
        )}
        {step === 2 && (
          <div className="form-section">
            <label>
              Aparelho *
              <input
                value={form.device}
                onChange={field('device')}
                required
                placeholder="Marca e modelo"
              />
            </label>
            <label>
              IMEI / série
              <input value={form.imei} onChange={field('imei')} />
            </label>
            <label>
              Senha numérica
              <input value={form.password} onChange={field('password')} type="password" />
            </label>
            <label>Senha padrão desenhada</label>
            <div className="pattern-lock">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
                <button
                  type="button"
                  className={pattern.includes(number) ? 'selected' : ''}
                  onClick={() => toggle(number)}
                  key={number}
                >
                  {number}
                </button>
              ))}
            </div>
            <small className="pattern-help">Sequência: {pattern.join(' → ') || 'nenhuma'}</small>
          </div>
        )}
        {step === 3 && (
          <div className="form-section">
            <label>
              Problema relatado *
              <textarea value={form.problem} onChange={field('problem')} required />
            </label>
            <label>
              Prioridade
              <select value={form.priority} onChange={field('priority')}>
                <option>Normal</option>
                <option>Urgente</option>
                <option>Garantia</option>
              </select>
            </label>
          </div>
        )}
        {step === 4 && (
          <div className="form-section">
            <div className="form-row">
              <label>
                Mão de obra
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={labor}
                  onChange={(event) => setLabor(Number(event.target.value))}
                />
              </label>
              <label>
                Valor das peças
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={parts}
                  onChange={(event) => setParts(Number(event.target.value))}
                />
              </label>
            </div>
            <label>
              Custo total da assistência
              <input
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(event) => setCost(Number(event.target.value))}
              />
            </label>
            <div className="estimate-grid">
              <div>
                <span>Total estimado</span>
                <strong>{money(total)}</strong>
              </div>
              <div>
                <span>Lucro estimado</span>
                <strong className={total - cost < 0 ? 'negative' : ''}>
                  {money(total - cost)}
                </strong>
              </div>
            </div>
            <small className="value-confirmation">
              Revise os valores. A ordem só será criada ao clicar no botão abaixo.
            </small>
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            onClick={() => (step === 1 ? close() : setStep((value) => value - 1))}
          >
            {step === 1 ? 'Cancelar' : '← Voltar'}
          </button>
          {step < 4 ? (
            <button type="button" className="primary" onClick={next}>
              Continuar →
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={saving}
              onClick={() => void create()}
            >
              {saving ? 'Criando...' : 'Criar ordem'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
