'use client';

import { FormEvent, useEffect, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import Login from '@/components/login';
import { OrderCreateModal } from '@/components/order-modals';
import { formatMoney as money, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type {
  BusinessRecordType,
  Order,
  PublicAccount,
  RecordData,
  StoredRecord,
} from '@/lib/types';
import './accounts.css';
import './recovery.css';
import './mesa.css';
import './whatsapp.css';

type RecordItem = StoredRecord;
type Item<T extends BusinessRecordType> = RecordData[T] & { id: string };
type OrderItem = Item<'order'>;
type QuoteItem = Item<'quote'>;
type PartItem = Item<'part'>;
type FilmItem = Item<'film'>;
type ClientItem = Item<'client'>;
type PaymentItem = Item<'payment'>;
type ExpenseItem = Item<'expense'>;
type MessageItem = Item<'message'>;
type ShopItem = Item<'shop'>;
type SaveAction = (type: BusinessRecordType, data: unknown, id?: string) => Promise<void>;
type PasswordRequestItem = {
  id: string;
  accountId: string;
  username: string;
  status: 'pending' | 'resolved';
  createdAt: string;
};
type FieldChange = ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
const menu = [
  'Dashboard',
  'Mesa',
  'Orçamentos',
  'Ordens de serviço',
  'Peças & Vitrine',
  'Estoque',
  'Películas',
  'Pagamentos',
  'Clientes',
  'Pós-venda',
  'Garantias',
  'Assistente IA',
  'Minha assistência',
  'Tutoriais & suporte',
  'Dados & exportação',
];
const icons = ['▦', '☷', '▤', '⚒', '◇', '▣', '▯', '↗', '◌', '✉', '◉', '✦', '⚙', '?', '⇩'];
const stages = [
  'Recebido',
  'Diagnóstico',
  'Aguardando aprovação',
  'Em reparo',
  'Teste final',
  'Retirada',
];

async function api(type?: BusinessRecordType, data?: unknown, id?: string) {
  if (!type) {
    const r = await fetch('/api/state');
    const result = (await r.json()) as { records?: RecordItem[] };
    return result.records || [];
  }
  const r = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data, id }),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || 'Não foi possível salvar.');
  return result;
}
const openWhatsApp = (phone: string, message: string) => {
  if (!hasValidWhatsapp(phone)) return false;
  window.open(whatsappUrl(phone, message), '_blank', 'noopener,noreferrer');
  return true;
};

export default function Home() {
  const [active, setActive] = useState('Dashboard');
  const [account, setAccount] = useState<PublicAccount | null>(null),
    [authLoading, setAuthLoading] = useState(true);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [modal, setModal] = useState<'order' | 'film' | null>(null);
  const [toast, setToast] = useState('');
  const load = () =>
    api()
      .then(setRecords)
      .catch(() => setRecords([]));
  useEffect(() => {
    fetch('/api/auth')
      .then(async (r) => {
        const x = (await r.json()) as { account: PublicAccount | null };
        setAccount(x.account);
        if (x.account) await load();
      })
      .catch(() => setAccount(null))
      .finally(() => setAuthLoading(false));
  }, []);
  const save = async (type: BusinessRecordType, data: unknown, id?: string) => {
    try {
      const result = await api(type, data, id);
      await load();
      setModal(null);
      setToast(result?.notification?.reason || 'Salvo com sucesso');
      setTimeout(() => setToast(''), 6000);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar.');
      throw error;
    }
  };
  const saveOrder = (data: Order, id?: string) => save('order', data, id);
  const by = <T extends BusinessRecordType>(type: T): Item<T>[] =>
    records
      .filter((record) => record.type === type)
      .map((record) => ({ id: record.id, ...record.data }) as unknown as Item<T>);
  const orders = by('order'),
    quotes = by('quote'),
    parts = by('part'),
    clients = by('client'),
    films = by('film'),
    payments = by('payment'),
    expenses = by('expense'),
    messages = by('message');
  const visibleMenu = account?.role === 'admin' ? [...menu, 'Contas de lojistas'] : menu;
  if (authLoading)
    return (
      <main className="login-page">
        <div className="login-card">Carregando ReparoSM...</div>
      </main>
    );
  if (!account)
    return (
      <Login
        onLogin={async (a) => {
          setAccount(a);
          await load();
        }}
      />
    );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>ReparoSM</strong>
            <small>Repair System Master</small>
          </div>
        </div>
        <nav>
          {visibleMenu.map((x, i) =>
            x === 'Ordens de serviço' ||
            x === 'Orçamentos' ||
            x === 'Peças & Vitrine' ||
            x === 'Estoque' ||
            x === 'Pagamentos' ||
            x === 'Clientes' ||
            x === 'Pós-venda' ||
            x === 'Garantias' ||
            x === 'Assistente IA' ||
            x === 'Minha assistência' ||
            x === 'Tutoriais & suporte' ||
            x === 'Dados & exportação' ? (
              <Link
                className="sidebar-link"
                href={
                  x === 'Ordens de serviço'
                    ? '/ordens'
                    : x === 'Orçamentos'
                      ? '/orcamentos'
                      : x === 'Pagamentos'
                        ? '/pagamentos'
                        : x === 'Clientes'
                          ? '/clientes'
                          : x === 'Pós-venda'
                            ? '/pos-venda'
                            : x === 'Garantias'
                              ? '/garantias'
                              : x === 'Assistente IA'
                                ? '/assistente'
                                : x === 'Minha assistência'
                                  ? '/minha-assistencia'
                                  : x === 'Tutoriais & suporte'
                                    ? '/suporte'
                                    : x === 'Dados & exportação'
                                      ? '/dados'
                                      : `/estoque?view=${x === 'Estoque' ? 'inventory' : 'catalog'}`
                }
                key={x}
              >
                <span>{i < icons.length ? icons[i] : '♙'}</span>
                {x}
              </Link>
            ) : (
              <button key={x} onClick={() => setActive(x)} className={active === x ? 'active' : ''}>
                <span>{i < icons.length ? icons[i] : '♙'}</span>
                {x}
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="profile">
            <span>
              {String(account.name || account.username)
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div>
              <strong>{account.name}</strong>
              <small>{account.role === 'admin' ? 'Administrador' : 'Lojista'}</small>
            </div>
          </div>
          <button
            className="logout-button"
            onClick={async () => {
              await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'logout' }),
              });
              setAccount(null);
              setRecords([]);
            }}
          >
            Sair da conta
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p>REPAROSM</p>
            <h1>{active}</h1>
            <small>
              {active === 'Dashboard'
                ? 'Visão geral da sua assistência.'
                : 'Dados salvos e integrados em tempo real.'}
            </small>
          </div>
          <div className="top-actions">
            {active === 'Mesa' && (
              <button className="primary" onClick={() => setModal('order')}>
                + Nova ordem
              </button>
            )}
            {active === 'Películas' && (
              <button className="primary" onClick={() => setModal('film')}>
                + Compatibilidade
              </button>
            )}
          </div>
        </header>
        {active === 'Dashboard' && (
          <Dashboard
            orders={orders}
            quotes={quotes}
            parts={parts}
            clients={clients}
            payments={payments}
            expenses={expenses}
            messages={messages}
          />
        )}
        {active === 'Mesa' && <Mesa orders={orders} save={save} open={() => setModal('order')} />}
        {active === 'Películas' && <FilmsSorted items={films} open={() => setModal('film')} />}
        {active === 'Contas de lojistas' && account.role === 'admin' && <AccountManager />}
      </section>
      {modal === 'order' && <OrderCreateModal close={() => setModal(null)} save={saveOrder} />}
      {modal === 'film' && <FilmModal close={() => setModal(null)} save={save} />}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}

function Dashboard({
  orders,
  quotes,
  parts,
  clients,
  payments,
  expenses,
  messages,
}: {
  orders: OrderItem[];
  quotes: QuoteItem[];
  parts: PartItem[];
  clients: ClientItem[];
  payments: PaymentItem[];
  expenses: ExpenseItem[];
  messages: MessageItem[];
}) {
  const revenue = payments.reduce((s, p) => s + Number(p.value || 0), 0),
    out = expenses.reduce((s, p) => s + Number(p.value || 0), 0),
    profit = revenue - out,
    goal = 50000,
    open = orders.filter((o) => o.status !== 'Concluído' && o.stage !== 'Retirada'),
    low = parts.filter((p) => Number(p.stock) < 5),
    approved = quotes.filter((q) => q.status === 'Aprovado');
  const activity: Array<{
    id?: string;
    activity: string;
    label: string;
    value?: number;
    when?: string;
  }> = [
    ...payments.map((x) => ({
      ...x,
      activity: 'Recebimento',
      label: x.description,
      value: Number(x.value),
      when: x.createdAt || x.date,
    })),
    ...expenses.map((x) => ({
      ...x,
      activity: 'Despesa',
      label: x.description,
      value: -Number(x.value),
      when: x.createdAt || x.date,
    })),
    ...orders.map((x) => ({
      ...x,
      activity: 'Ordem',
      label: `${x.code} · ${x.customer || 'Cliente não informado'}`,
      when: x.createdAt,
    })),
    ...messages.map((x) => ({
      ...x,
      activity: 'WhatsApp',
      label: `${x.customer} · ${x.kind}`,
      when: x.sentAt,
    })),
  ]
    .sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')))
    .slice(0, 8);
  return (
    <>
      <article className="monthly-goal">
        <div>
          <span>META MENSAL DE RECEITA</span>
          <h3>
            {money(revenue)} <small>de {money(goal)}</small>
          </h3>
          <p>
            {revenue
              ? `Faltam ${money(Math.max(0, goal - revenue))} para a meta.`
              : 'Registre seu primeiro recebimento para iniciar a meta.'}
          </p>
        </div>
        <div className="goal-visual">
          <strong>{Math.min(100, Math.round((revenue / goal) * 100))}%</strong>
          <div>
            <i style={{ width: `${Math.min(100, (revenue / goal) * 100)}%` }} />
          </div>
          <small>Baseado nos recebimentos registrados</small>
        </div>
      </article>
      <div className="metrics">
        <Metric t="Receita recebida" v={money(revenue)} d={`${payments.length} recebimentos`} />
        <Metric t="Despesas" v={money(out)} d={`${expenses.length} lançamentos`} />
        <Metric t="Resultado do caixa" v={money(profit)} d="Receita menos despesas" />
        <Metric t="Ordens abertas" v={String(open.length)} d="Em atendimento" />
      </div>
      <div className="dashboard-overview">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Visão geral da loja</h3>
              <p>Tudo que precisa da sua atenção agora.</p>
            </div>
          </div>
          <div className="overview-grid">
            <div>
              <b>{clients.length}</b>
              <span>clientes</span>
            </div>
            <div>
              <b>{approved.length}</b>
              <span>orçamentos aprovados</span>
            </div>
            <div>
              <b>{low.length}</b>
              <span>itens com estoque baixo</span>
            </div>
            <div>
              <b>{orders.filter((o) => o.stage === 'Retirada').length}</b>
              <span>aguardando retirada</span>
            </div>
            <div>
              <b>{parts.reduce((s, p) => s + Number(p.stock || 0), 0)}</b>
              <span>unidades em estoque</span>
            </div>
            <div>
              <b>{messages.length}</b>
              <span>mensagens registradas</span>
            </div>
          </div>
        </section>
        <section className="panel activity-card">
          <div className="panel-head">
            <div>
              <h3>Atividades recentes</h3>
              <p>Últimas movimentações do sistema.</p>
            </div>
          </div>
          {activity.length ? (
            <div className="activity-list">
              {activity.map((a, i) => (
                <article key={`${a.activity}-${a.id || i}`}>
                  <i>
                    {a.activity === 'Recebimento'
                      ? '↗'
                      : a.activity === 'Despesa'
                        ? '↘'
                        : a.activity === 'WhatsApp'
                          ? '✉'
                          : '⚒'}
                  </i>
                  <div>
                    <b>{a.label}</b>
                    <span>
                      {a.activity} ·{' '}
                      {a.when ? new Date(a.when).toLocaleDateString('pt-BR') : 'agora'}
                    </span>
                  </div>
                  {typeof a.value === 'number' && (
                    <strong className={a.value < 0 ? 'negative-money' : 'positive-money'}>
                      {a.value < 0 ? '- ' : '+ '}
                      {money(Math.abs(a.value))}
                    </strong>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-activity">As movimentações aparecerão aqui.</p>
          )}
        </section>
      </div>
      {!orders.length && !payments.length && !expenses.length && (
        <Empty
          title="Seu sistema está zerado"
          text="Crie uma ordem ou registre uma movimentação para começar."
        />
      )}
    </>
  );
}
function Metric({ t, v, d }: { t: string; v: string; d: string }) {
  return (
    <article>
      <div className="metric-head">
        <span>{t}</span>
        <i className="blue">↗</i>
      </div>
      <h2>{v}</h2>
      <p>{d}</p>
    </article>
  );
}

function Mesa({ orders, save, open }: { orders: OrderItem[]; save: SaveAction; open: () => void }) {
  const move = (o: OrderItem, dir: number) => {
    const i = Math.max(0, Math.min(stages.length - 1, stages.indexOf(o.stage || 'Recebido') + dir));
    void save('order', { ...o, stage: stages[i] }, o.id);
  };
  return (
    <>
      {!orders.length ? (
        <Empty
          title="A Mesa está vazia"
          text="Crie uma ordem para ela aparecer automaticamente no fluxo."
          action="Criar primeira ordem"
          onAction={open}
        />
      ) : (
        <div className="kanban kanban-enhanced">
          {stages.map((stage) => (
            <section key={stage}>
              <header>
                <span>
                  <i className="flow-dot" />
                  {stage}
                </span>
                <b>{orders.filter((o) => (o.stage || 'Recebido') === stage).length}</b>
              </header>
              {orders
                .filter((o) => (o.stage || 'Recebido') === stage)
                .map((o) => (
                  <article key={`${o.id}-${stage}`}>
                    <div>
                      <b>{o.code}</b>
                      <small>{o.priority}</small>
                    </div>
                    <h4>{o.device}</h4>
                    <p>{o.customer}</p>
                    <footer>
                      <button
                        disabled={stage === stages[0]}
                        aria-label={`Voltar etapa de ${o.code}`}
                        title="Voltar etapa"
                        onClick={() => move(o, -1)}
                      >
                        ←
                      </button>
                      <span>{money(Number(o.total || 0))}</span>
                      <button
                        disabled={stage === stages.at(-1)}
                        aria-label={`Avançar etapa de ${o.code}`}
                        title="Avançar etapa"
                        onClick={() => move(o, 1)}
                      >
                        →
                      </button>
                    </footer>
                  </article>
                ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
function Quotes({ items, save, open }: { items: QuoteItem[]; save: SaveAction; open: () => void }) {
  const [preview, setPreview] = useState<QuoteItem | null>(null);
  const status = (q: QuoteItem, s: string) => save('quote', { ...q, status: s }, q.id);
  return (
    <>
      {!items.length ? (
        <Empty
          title="Nenhum orçamento"
          text="Crie um orçamento para celular e compartilhe o link com o cliente."
          action="Criar orçamento"
          onAction={open}
        />
      ) : (
        <article className="panel page-panel">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Celular</th>
                <th>Total</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id}>
                  <td>
                    <b>{q.code}</b>
                  </td>
                  <td>{q.customer}</td>
                  <td>{q.device}</td>
                  <td>{money(Number(q.total))}</td>
                  <td>
                    <Badge>{q.status || 'Aguardando'}</Badge>
                  </td>
                  <td>
                    <button onClick={() => setPreview(q)}>Abrir link</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
      {preview && (
        <div className="client-preview">
          <button onClick={() => setPreview(null)}>×</button>
          <div className="preview-phone">
            <span>ReparoSM</span>
            <h2>Orçamento {preview.code}</h2>
            <p>
              {preview.device} · {preview.service}
            </p>
            <div>
              <small>Total</small>
              <strong>{money(Number(preview.total))}</strong>
            </div>
            <button
              onClick={() => {
                void status(preview, 'Aprovado');
                setPreview(null);
              }}
            >
              Aprovar orçamento
            </button>
            <button
              className="reject"
              onClick={() => {
                void status(preview, 'Recusado');
                setPreview(null);
              }}
            >
              Recusar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function Orders({ items, save, open }: { items: OrderItem[]; save: SaveAction; open: () => void }) {
  const send = (o: OrderItem) => {
    const message = `Olá, ${o.customer}! Atualização da ${o.code}: seu ${o.device} está na etapa “${o.stage || 'Recebido'}”. Qualquer dúvida, estamos à disposição. — ReparoSM`;
    if (openWhatsApp(o.phone || '', message))
      void save('message', {
        customer: o.customer,
        phone: o.phone,
        kind: 'Atualização da OS',
        message,
        status: 'Aberto no WhatsApp',
        sentAt: new Date().toISOString(),
      });
    else alert('Cadastre um WhatsApp válido nesta ordem.');
  };
  return items.length ? (
    <article className="panel page-panel">
      <table>
        <thead>
          <tr>
            <th>OS</th>
            <th>Cliente</th>
            <th>Aparelho</th>
            <th>Etapa</th>
            <th>Total</th>
            <th>Custo</th>
            <th>Contato</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.id}>
              <td>
                <b>{o.code}</b>
              </td>
              <td>{o.customer}</td>
              <td>{o.device}</td>
              <td>
                <Badge>{o.stage || 'Recebido'}</Badge>
              </td>
              <td>{money(Number(o.total))}</td>
              <td>{money(Number(o.cost))}</td>
              <td>
                <button className="whatsapp-btn small" onClick={() => send(o)}>
                  WhatsApp
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  ) : (
    <Empty
      title="Nenhuma ordem cadastrada"
      text="Cadastre uma ordem completa com aparelho, senha, custo e previsão."
      action="Nova ordem"
      onAction={open}
    />
  );
}

function OrderModal({ close, save }: { close: () => void; save: SaveAction }) {
  const [step, setStep] = useState(1),
    [pattern, setPattern] = useState<number[]>([]),
    [labor, setLabor] = useState(0),
    [parts, setParts] = useState(0),
    [cost, setCost] = useState(0),
    [consent, setConsent] = useState(false),
    [form, setForm] = useState({
      customer: '',
      phone: '',
      device: '',
      imei: '',
      password: '',
      problem: '',
      priority: 'Normal',
    });
  const total = labor + parts;
  const field = (key: keyof typeof form) => (e: FieldChange) =>
    setForm((v) => ({ ...v, [key]: e.target.value }));
  const toggle = (n: number) =>
    setPattern((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const valid = () =>
    step === 1
      ? !!form.customer.trim()
      : step === 2
        ? !!form.device.trim()
        : step === 3
          ? !!form.problem.trim()
          : true;
  const next = () =>
    valid() ? setStep(step + 1) : alert('Preencha os campos obrigatórios antes de continuar.');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void save('order', {
      code: `OS-${Date.now().toString().slice(-5)}`,
      ...form,
      whatsappConsent: consent,
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
  };
  return (
    <div className="modal-backdrop">
      <form className="modal order-modal" onSubmit={submit}>
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
          {['Cliente', 'Aparelho', 'Diagnóstico', 'Valores'].map((x, i) => (
            <div className={step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''} key={x}>
              <i>{step > i + 1 ? '✓' : i + 1}</i>
              <span>{x}</span>
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
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{' '}
              Cliente autorizou atualizações desta OS pelo WhatsApp.
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
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  type="button"
                  className={pattern.includes(n) ? 'selected' : ''}
                  onClick={() => toggle(n)}
                  key={n}
                >
                  {n}
                </button>
              ))}
            </div>
            <small className="pattern-help">
              Clique nos pontos na ordem do desenho. Sequência: {pattern.join(' → ') || 'nenhuma'}
            </small>
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
                  onChange={(e) => setLabor(Number(e.target.value))}
                />
              </label>
              <label>
                Valor das peças
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={parts}
                  onChange={(e) => setParts(Number(e.target.value))}
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
                onChange={(e) => setCost(Number(e.target.value))}
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
          </div>
        )}
        <div className="modal-actions">
          <button type="button" onClick={() => (step === 1 ? close() : setStep(step - 1))}>
            {step === 1 ? 'Cancelar' : '← Voltar'}
          </button>
          {step < 4 ? (
            <button type="button" className="primary" onClick={next}>
              Continuar →
            </button>
          ) : (
            <button className="primary">Criar ordem</button>
          )}
        </div>
      </form>
    </div>
  );
}

function FilmsSorted({ items, open }: { items: FilmItem[]; open: () => void }) {
  const [search, setSearch] = useState(''),
    [brand, setBrand] = useState('Todas');
  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }),
    brands = [
      'Todas',
      ...Array.from(new Set(items.map((f) => f.brand).filter(Boolean))).sort(collator.compare),
    ];
  const found = items
    .filter(
      (f) =>
        (brand === 'Todas' || f.brand === brand) &&
        `${f.brand} ${f.model} ${f.compatible}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => collator.compare(a.brand, b.brand) || collator.compare(a.model, b.model));
  return (
    <>
      <article className="film-search">
        <div>
          <span>GUIA DE COMPATIBILIDADE</span>
          <h2>Qual película serve neste aparelho?</h2>
          <p>Catálogo organizado por marca e modelo em ordem numérica.</p>
        </div>
        <label>
          ⌕
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ex.: A03, iPhone 13, Moto G54..."
          />
        </label>
      </article>
      <div className="film-brand-tabs">
        {brands.map((b) => (
          <button className={brand === b ? 'active' : ''} onClick={() => setBrand(b)} key={b}>
            {b}
          </button>
        ))}
      </div>
      {found.length ? (
        <div className="film-grid">
          {found.map((f) => (
            <article className="panel" key={f.id}>
              <span>{f.brand}</span>
              <h3>{f.model}</h3>
              <p>Também compatível com:</p>
              <strong>{f.compatible}</strong>
              <footer>
                <small>{f.size || 'Película frontal'}</small>
                <Badge>Compatível</Badge>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            items.length ? 'Nenhum resultado encontrado' : 'Nenhuma compatibilidade cadastrada'
          }
          text={
            items.length
              ? 'Tente outro modelo ou marca.'
              : 'Cadastre equivalências entre modelos de celulares.'
          }
          action="Cadastrar compatibilidade"
          onAction={open}
        />
      )}
    </>
  );
}
function PasswordRequests() {
  const [accounts, setAccounts] = useState<PublicAccount[]>([]),
    [requests, setRequests] = useState<PasswordRequestItem[]>([]),
    [selected, setSelected] = useState<PublicAccount | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const r = await fetch('/api/accounts');
      const x = await r.json();
      if (!r.ok) throw new Error(x.error || 'Falha ao carregar solicitações.');
      setAccounts(x.accounts || []);
      setRequests(x.requests || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão.');
    }
  };
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, []);
  const reset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    if (!selected) return setError('Selecione uma conta.');
    const f = new FormData(e.currentTarget);
    if (f.get('password') !== f.get('confirmPassword'))
      return setError('As senhas não correspondem.');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset-password',
          id: selected.id,
          password: f.get('password'),
          identityConfirmed: f.get('identityConfirmed') === 'on',
        }),
      });
      const x = await r.json();
      if (!r.ok) throw new Error(x.error || 'Não foi possível redefinir.');
      setNotice('Senha redefinida. Informe a nova senha ao lojista pelo contato já conhecido.');
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="panel recovery-panel">
      <div className="panel-head">
        <div>
          <h3>Solicitações de senha ({requests.length})</h3>
          <p>Confirme a identidade pelo contato já cadastrado antes de liberar o acesso.</p>
        </div>
        <button onClick={() => void load()}>Atualizar</button>
      </div>
      {notice && (
        <p role="status" className="account-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="login-error">
          {error}
        </p>
      )}
      {requests.length ? (
        requests.map((r) => {
          const a = accounts.find((a) => a.id === r.accountId);
          return (
            <div className="recovery-row" key={r.id}>
              <div>
                <strong>{a?.name || r.username}</strong>
                <p>
                  Usuário: {r.username} · {new Date(r.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <button
                disabled={!a}
                onClick={() => {
                  setSelected(a || null);
                  setError('');
                }}
              >
                Definir nova senha
              </button>
            </div>
          );
        })
      ) : (
        <p>Nenhuma solicitação pendente.</p>
      )}
      <label>
        Redefinir acesso de um lojista
        <select
          value=""
          onChange={(e) => {
            setSelected(accounts.find((a) => a.id === e.target.value) || null);
            setError('');
          }}
        >
          <option value="">Selecione uma conta</option>
          {accounts
            .filter((a) => a.role !== 'admin')
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.username})
              </option>
            ))}
        </select>
      </label>
      {selected && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={reset}>
            <h2>Nova senha de {selected.name}</h2>
            <p>Usuário: {selected.username}</p>
            <label>
              Nova senha
              <input
                name="password"
                type="password"
                minLength={10}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirmar senha
              <input
                name="confirmPassword"
                type="password"
                minLength={10}
                required
                autoComplete="new-password"
              />
            </label>
            <small>Use pelo menos 10 caracteres, com letras e números.</small>
            <label className="check">
              <input name="identityConfirmed" type="checkbox" required /> Confirmei a identidade do
              lojista pelo contato já conhecido.
            </label>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={() => setSelected(null)}>
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </div>
          </form>
        </div>
      )}
    </article>
  );
}

function AccountManager() {
  const [items, setItems] = useState<PublicAccount[]>([]),
    [modal, setModal] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState('');
  const load = () =>
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((x) => setItems(x.accounts || []))
      .finally(() => setLoading(false));
  useEffect(() => {
    void load();
  }, []);
  const update = async (a: PublicAccount, status: string) => {
    const r = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, status }),
    });
    const x = await r.json();
    if (!r.ok) return alert(x.error || 'Não foi possível atualizar a conta.');
    setNotice(status === 'active' ? 'Conta ativada.' : 'Conta atualizada.');
    await load();
  };
  const remove = async (a: PublicAccount) => {
    if (!confirm(`Excluir a conta de ${a.name} e todos os dados dessa loja?`)) return;
    const r = await fetch(`/api/accounts?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' });
    if (!r.ok) {
      const x = await r.json();
      return alert(x.error || 'Não foi possível excluir.');
    }
    await load();
  };
  const active = items.filter((x) => x.status === 'active').length,
    suspended = items.filter((x) => x.status !== 'active').length;
  return (
    <>
      <article className="accounts-hero">
        <div>
          <span>GESTÃO MULTILOJAS</span>
          <h2>Contas dos lojistas</h2>
          <p>
            Crie acessos individuais, acompanhe planos e bloqueie contas com pagamento pendente.
          </p>
        </div>
        <button className="primary" onClick={() => setModal(true)}>
          + Nova conta
        </button>
      </article>
      <div className="metrics account-metrics">
        <Metric t="Total de contas" v={String(items.length)} d="Incluindo administrador" />
        <Metric t="Contas ativas" v={String(active)} d="Com acesso liberado" />
        <Metric t="Suspensas ou canceladas" v={String(suspended)} d="Sem acesso ao sistema" />
      </div>
      <PasswordRequests />
      <article className="panel accounts-table">
        <div className="panel-head">
          <div>
            <h3>Lojistas cadastrados</h3>
            <p>Cada conta visualiza somente os dados da própria assistência.</p>
          </div>
        </div>
        {notice && <p className="account-notice">✓ {notice}</p>}
        {loading ? (
          <p>Carregando contas...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Loja</th>
                <th>Usuário</th>
                <th>Plano</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.name}</b>
                    <small>{a.role === 'admin' ? 'Administrador' : 'Lojista'}</small>
                  </td>
                  <td>{a.username}</td>
                  <td>{a.plan || 'Mensal'}</td>
                  <td>
                    {a.dueDate
                      ? new Date(`${a.dueDate}T12:00:00`).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td>
                    <Badge>
                      {a.status === 'active'
                        ? 'Ativa'
                        : a.status === 'suspended'
                          ? 'Suspensa'
                          : 'Cancelada'}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      {a.role !== 'admin' && (
                        <>
                          {a.status === 'active' ? (
                            <button onClick={() => update(a, 'suspended')}>Suspender</button>
                          ) : (
                            <button onClick={() => update(a, 'active')}>Ativar</button>
                          )}
                          <button onClick={() => update(a, 'cancelled')}>Cancelar</button>
                          <button className="danger" onClick={() => remove(a)}>
                            Excluir
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
      {modal && (
        <AccountModal
          close={() => setModal(false)}
          saved={async () => {
            setModal(false);
            setNotice('Nova conta criada com sucesso.');
            await load();
          }}
        />
      )}
    </>
  );
}

function AccountModal({ close, saved }: { close: () => void; saved: () => void }) {
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: f.get('name'),
        username: f.get('username'),
        password: f.get('password'),
        plan: f.get('plan'),
        dueDate: f.get('dueDate'),
        status: 'active',
      }),
    });
    const x = await r.json();
    setSaving(false);
    if (!r.ok) return setError(x.error || 'Não foi possível criar a conta.');
    saved();
  };
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-title">
          <div>
            <span>♙</span>
            <div>
              <h2>Nova conta de lojista</h2>
              <p>Crie um ambiente separado para a nova assistência</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Nome da loja ou responsável *<input name="name" required />
        </label>
        <div className="form-row">
          <label>
            Usuário de acesso *<input name="username" minLength={3} required autoComplete="off" />
          </label>
          <label>
            Senha inicial *
            <input
              name="password"
              type="password"
              minLength={10}
              required
              autoComplete="new-password"
            />
            <small>
              Use no mínimo 10 caracteres, com letras e números. A recuperação de acesso é feita
              pelo administrador.
            </small>
          </label>
        </div>
        <div className="form-row">
          <label>
            Plano
            <select name="plan">
              <option>Mensal</option>
              <option>Trimestral</option>
              <option>Anual</option>
              <option>Cortesia</option>
            </select>
          </label>
          <label>
            Próximo vencimento
            <input name="dueDate" type="date" />
          </label>
        </div>
        {error && <p className="login-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Criando...' : 'Criar conta'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Films({ items, open }: { items: FilmItem[]; open: () => void }) {
  const [search, setSearch] = useState('');
  const found = items.filter((f) =>
    `${f.model} ${f.compatible}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <article className="film-search">
        <div>
          <span>GUIA DE COMPATIBILIDADE</span>
          <h2>Qual película serve neste aparelho?</h2>
          <p>Pesquise um modelo para encontrar todas as equivalências cadastradas.</p>
        </div>
        <label>
          ⌕
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ex.: iPhone 13, Galaxy A54..."
          />
        </label>
      </article>
      {found.length ? (
        <div className="film-grid">
          {found.map((f) => (
            <article className="panel" key={f.id}>
              <span>{f.brand}</span>
              <h3>{f.model}</h3>
              <p>Também compatível com:</p>
              <strong>{f.compatible}</strong>
              <footer>
                <small>{f.size || 'Tamanho não informado'}</small>
                <Badge>Compatível</Badge>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            items.length ? 'Nenhum resultado encontrado' : 'Nenhuma compatibilidade cadastrada'
          }
          text={
            items.length
              ? 'Tente buscar outro modelo.'
              : 'Cadastre equivalências entre modelos de celulares.'
          }
          action="Cadastrar compatibilidade"
          onAction={open}
        />
      )}
    </>
  );
}
function MyShop({ item, save }: { item?: ShopItem; save: SaveAction }) {
  return (
    <div className="shop-settings">
      <aside>
        <button className="active">Perfil</button>
        <button>Horários</button>
        <button>Equipe</button>
        <button>Dados fiscais</button>
        <button>Links</button>
      </aside>
      <form
        className="panel shop-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save('shop', Object.fromEntries(f), item?.id || 'shop-main');
        }}
      >
        <div className="shop-logo">RS</div>
        <div>
          <h2>Minha assistência</h2>
          <p>Esses dados aparecem em ordens, orçamentos, comprovantes e vitrine.</p>
        </div>
        <label>
          Nome da empresa *
          <input
            name="name"
            required
            defaultValue={item?.name || ''}
            placeholder="Nome da assistência"
          />
        </label>
        <div className="form-row">
          <label>
            CNPJ / CPF
            <input name="document" defaultValue={item?.document || ''} />
          </label>
          <label>
            WhatsApp *<input name="phone" required defaultValue={item?.phone || ''} />
          </label>
        </div>
        <label>
          Endereço completo
          <input name="address" defaultValue={item?.address || ''} />
        </label>
        <div className="form-row">
          <label>
            Instagram
            <input name="instagram" defaultValue={item?.instagram || ''} />
          </label>
          <label>
            E-mail
            <input name="email" type="email" defaultValue={item?.email || ''} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Horário de atendimento
            <input
              name="hours"
              defaultValue={item?.hours || ''}
              placeholder="Seg a Sáb, 8h às 18h"
            />
          </label>
          <label>
            Garantia padrão
            <select name="warranty" defaultValue={item?.warranty || '90 dias'}>
              <option>30 dias</option>
              <option>90 dias</option>
              <option>180 dias</option>
            </select>
          </label>
        </div>
        <label>
          Link de avaliação do Google
          <input name="google" defaultValue={item?.google || ''} />
        </label>
        <label>
          Observações dos documentos
          <textarea
            name="terms"
            defaultValue={item?.terms || ''}
            placeholder="Termos de garantia e informações importantes..."
          />
        </label>
        <div className="modal-actions">
          <button className="primary">Salvar assistência</button>
        </div>
      </form>
    </div>
  );
}
function FilmModal({ close, save }: { close: () => void; save: SaveAction }) {
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save('film', Object.fromEntries(f));
        }}
      >
        <div className="modal-title">
          <div>
            <span>▯</span>
            <div>
              <h2>Películas compatíveis</h2>
              <p>Cadastre equivalências entre aparelhos</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Marca
          <input name="brand" required placeholder="Ex.: Apple" />
        </label>
        <label>
          Modelo principal
          <input name="model" required placeholder="Ex.: iPhone 13" />
        </label>
        <label>
          Modelos compatíveis
          <textarea name="compatible" required placeholder="Ex.: iPhone 13 Pro, iPhone 14" />
        </label>
        <label>
          Tamanho / observação
          <input name="size" placeholder="Ex.: 6,1 polegadas" />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Salvar compatibilidade</button>
        </div>
      </form>
    </div>
  );
}
function Badge({ children }: { children: string }) {
  return (
    <span
      className={`tag ${children?.includes('Aprov') || children === 'Disponível' || children === 'Compatível' || children?.includes('completo') || children === 'Receita' || children === 'Ativa' ? 'ready' : children?.includes('Recus') || children?.includes('baixo') || children?.includes('pendente') || children === 'Despesa' ? 'red' : 'progress'}`}
    >
      {children}
    </span>
  );
}
function Empty({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <article className="empty-state">
      <div>✦</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button className="primary" onClick={onAction}>
          {action}
        </button>
      )}
    </article>
  );
}
function Simple({ title, text }: { title: string; text: string }) {
  return (
    <article className="panel simple-page">
      <span>✦</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}
