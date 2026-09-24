'use client';

import { FormEvent, useEffect, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import Login from '@/components/login';
import { OrderCreateModal } from '@/components/order-modals';
import { formatMoney as money, hasValidWhatsapp, whatsappUrl } from '@/lib/format';
import type {
  BusinessRecordType,
  DataObject,
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
type AutomationItem = Item<'automation'>;
type MessageItem = Item<'message'>;
type TutorialItem = Item<'tutorial'>;
type ShopItem = Item<'shop'>;
type SaveAction = (type: BusinessRecordType, data: unknown, id?: string) => Promise<void>;
type PasswordRequestItem = {
  id: string;
  accountId: string;
  username: string;
  status: 'pending' | 'resolved';
  createdAt: string;
};
type ChatMessage = { role: 'ai' | 'me'; text: string };
type WhatsAppStatus = {
  configured: boolean;
  phoneNumberId?: string;
  displayPhone?: string;
  verifiedName?: string;
  orderTemplate?: string;
  statusTemplate?: string;
  language?: string;
  version?: string;
  qualityRating?: string;
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
  const [modal, setModal] = useState<'order' | 'film' | 'tutorial' | null>(null);
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
    shops = by('shop'),
    payments = by('payment'),
    expenses = by('expense'),
    automations = by('automation'),
    messages = by('message'),
    tutorials = by('tutorial');
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
            x === 'Clientes' ? (
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
        {active === 'Pós-venda' && (
          <AfterSales
            items={automations}
            messages={messages}
            clients={clients}
            orders={orders}
            shop={shops[0]}
            save={save}
          />
        )}
        {active === 'Garantias' && <Warranties orders={orders} />}
        {active === 'Assistente IA' && (
          <BusinessAssistant orders={orders} parts={parts} payments={payments} />
        )}
        {active === 'Minha assistência' && (
          <>
            <MyShopV2 item={shops[0]} save={save} />
            <WhatsAppConnection />
          </>
        )}
        {active === 'Tutoriais & suporte' && (
          <Support items={tutorials} open={() => setModal('tutorial')} />
        )}
        {active === 'Dados & exportação' && <DataTools records={records} save={save} />}
        {active === 'Contas de lojistas' && account.role === 'admin' && <AccountManager />}
      </section>
      {modal === 'order' && <OrderCreateModal close={() => setModal(null)} save={saveOrder} />}
      {modal === 'film' && <FilmModal close={() => setModal(null)} save={save} />}
      {modal === 'tutorial' && <TutorialModal close={() => setModal(null)} save={save} />}
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
function MyShopV2({ item, save }: { item?: ShopItem; save: SaveAction }) {
  const [tab, setTab] = useState('Perfil');
  const tabs = ['Perfil', 'Horários', 'Equipe', 'Fiscal', 'Documentos'];
  return (
    <div className="shop-v2">
      <div className="shop-cover">
        <div className="shop-avatar">RS</div>
        <div>
          <span>MINHA ASSISTÊNCIA</span>
          <h2>{item?.name || 'Configure sua empresa'}</h2>
          <p>{item?.phone || 'Adicione os dados que aparecerão nos documentos e links.'}</p>
        </div>
        <Badge>{item?.name ? 'Perfil completo' : 'Configuração pendente'}</Badge>
      </div>
      <div className="shop-tabs">
        {tabs.map((t) => (
          <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>
            {t}
          </button>
        ))}
      </div>
      <form
        className="panel shop-edit"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save('shop', { ...item, ...Object.fromEntries(f) }, item?.id || 'shop-main');
        }}
      >
        {tab === 'Perfil' && (
          <>
            <div className="form-heading">
              <h3>Identidade e contato</h3>
              <p>Dados exibidos na vitrine, ordens, orçamentos e comprovantes.</p>
            </div>
            <label>
              Nome comercial *<input name="name" required defaultValue={item?.name || ''} />
            </label>
            <div className="form-row">
              <label>
                Razão social
                <input name="legalName" defaultValue={item?.legalName || ''} />
              </label>
              <label>
                CPF / CNPJ
                <input name="document" defaultValue={item?.document || ''} />
              </label>
            </div>
            <div className="form-row">
              <label>
                WhatsApp *<input name="phone" required defaultValue={item?.phone || ''} />
              </label>
              <label>
                E-mail
                <input name="email" type="email" defaultValue={item?.email || ''} />
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
                Site
                <input name="website" defaultValue={item?.website || ''} />
              </label>
            </div>
          </>
        )}
        {tab === 'Horários' && (
          <>
            <div className="form-heading">
              <h3>Atendimento e prazos</h3>
              <p>Defina quando sua loja funciona e os padrões de entrega.</p>
            </div>
            <label>
              Horário de funcionamento
              <input
                name="hours"
                defaultValue={item?.hours || ''}
                placeholder="Seg a Sáb · 08h às 18h"
              />
            </label>
            <div className="form-row">
              <label>
                Prazo padrão de diagnóstico
                <input name="diagnosisTime" defaultValue={item?.diagnosisTime || '24 horas'} />
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
          </>
        )}
        {tab === 'Equipe' && (
          <>
            <div className="form-heading">
              <h3>Equipe técnica</h3>
              <p>Configure responsáveis e contatos internos.</p>
            </div>
            <label>
              Técnico principal
              <input name="technician" defaultValue={item?.technician || ''} />
            </label>
            <label>
              Responsável financeiro
              <input name="financial" defaultValue={item?.financial || ''} />
            </label>
            <label>
              Contato interno
              <input name="internalPhone" defaultValue={item?.internalPhone || ''} />
            </label>
          </>
        )}
        {tab === 'Fiscal' && (
          <>
            <div className="form-heading">
              <h3>Dados fiscais</h3>
              <p>Informações para notas e comprovantes.</p>
            </div>
            <div className="form-row">
              <label>
                Inscrição estadual
                <input name="stateRegistration" defaultValue={item?.stateRegistration || ''} />
              </label>
              <label>
                Inscrição municipal
                <input name="cityRegistration" defaultValue={item?.cityRegistration || ''} />
              </label>
            </div>
            <label>
              Regime tributário
              <select name="taxRegime" defaultValue={item?.taxRegime || 'MEI'}>
                <option>MEI</option>
                <option>Simples Nacional</option>
                <option>Lucro Presumido</option>
              </select>
            </label>
          </>
        )}
        {tab === 'Documentos' && (
          <>
            <div className="form-heading">
              <h3>Textos dos documentos</h3>
              <p>Personalize garantia, rodapé e avaliações.</p>
            </div>
            <label>
              Termos de garantia
              <textarea name="terms" defaultValue={item?.terms || ''} />
            </label>
            <label>
              Rodapé dos comprovantes
              <textarea name="footer" defaultValue={item?.footer || ''} />
            </label>
            <label>
              Link para avaliação no Google
              <input name="google" defaultValue={item?.google || ''} />
            </label>
          </>
        )}
        <div className="modal-actions">
          <button className="primary">Salvar alterações</button>
        </div>
      </form>
    </div>
  );
}
function AfterSales({
  items,
  messages,
  clients,
  orders,
  shop,
  save,
}: {
  items: AutomationItem[];
  messages: MessageItem[];
  clients: ClientItem[];
  orders: OrderItem[];
  shop?: ShopItem;
  save: SaveAction;
}) {
  const templates = [
    [
      'Atualização do reparo',
      'Ao mudar a etapa',
      'Olá, {cliente}! Seu {aparelho} está na etapa: {status}.',
    ],
    [
      'Aparelho pronto',
      'Ao concluir o reparo',
      'Olá, {cliente}! Seu {aparelho} está pronto para retirada.',
    ],
    [
      'Avaliação no Google',
      '7 dias após a entrega',
      `Olá, {cliente}! Como ficou seu aparelho? Sua avaliação ajuda muito nossa assistência.${shop?.google ? ` ${shop.google}` : ''}`,
    ],
    [
      'Acompanhamento',
      '24 horas após a entrega',
      'Olá, {cliente}! Passando para confirmar se está tudo funcionando perfeitamente.',
    ],
    [
      'Lembrete de garantia',
      '15 dias antes do fim',
      'Olá, {cliente}! Sua garantia está perto do vencimento. Se notar algo, fale conosco.',
    ],
  ];
  const [target, setTarget] = useState(''),
    [template, setTemplate] = useState(templates[0][0]),
    [custom, setCustom] = useState('');
  const contacts = [
    ...clients.map((c) => ({
      id: `c-${c.id}`,
      name: c.name,
      phone: c.phone,
      device: 'seu aparelho',
      status: c.status || 'Em atendimento',
    })),
    ...orders
      .filter((o) => o.phone)
      .map((o) => ({
        id: `o-${o.id}`,
        name: o.customer,
        phone: o.phone,
        device: o.device,
        status: o.stage || 'Recebido',
      })),
  ];
  const selected = contacts.find((c) => c.id === target);
  const current = templates.find((t) => t[0] === template) || templates[0];
  const text = (custom || current[2])
    .replaceAll('{cliente}', selected?.name || 'cliente')
    .replaceAll('{aparelho}', selected?.device || 'seu aparelho')
    .replaceAll('{status}', selected?.status || 'em atendimento');
  const existing = (name: string) => items.find((i) => i.name === name);
  const toggle = (t: string[]) => {
    const old = existing(t[0]);
    void save(
      'automation',
      { name: t[0], schedule: t[1], message: t[2], enabled: !old?.enabled },
      old?.id,
    );
  };
  const send = () => {
    if (!selected) return alert('Escolha um cliente ou uma ordem.');
    if (openWhatsApp(selected.phone || '', text))
      void save('message', {
        customer: selected.name,
        phone: selected.phone,
        kind: template,
        message: text,
        status: 'Aberto no WhatsApp',
        sentAt: new Date().toISOString(),
      });
    else alert('O contato escolhido não possui um WhatsApp válido.');
  };
  return (
    <>
      <article className="after-hero">
        <div>
          <span>✉</span>
          <div>
            <h2>Central do WhatsApp</h2>
            <p>Prepare, envie e acompanhe mensagens para seus clientes.</p>
          </div>
        </div>
        <div>
          <b>{messages.length}</b>
          <small>contatos registrados</small>
        </div>
      </article>
      <section className="whatsapp-compose panel">
        <div className="wa-title">
          <span>WA</span>
          <div>
            <h3>Nova mensagem</h3>
            <p>A mensagem abre pronta no WhatsApp para você confirmar o envio.</p>
          </div>
        </div>
        <div className="form-row">
          <label>
            Cliente ou ordem
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Selecione...</option>
              {contacts.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name} · {c.device}
                </option>
              ))}
            </select>
          </label>
          <label>
            Modelo de mensagem
            <select
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                setCustom('');
              }}
            >
              {templates.map((t) => (
                <option key={t[0]}>{t[0]}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Mensagem
          <textarea value={custom || text} onChange={(e) => setCustom(e.target.value)} />
        </label>
        <div className="wa-preview">
          <div>
            <b>{selected?.name || 'Escolha um contato'}</b>
            <small>{selected?.phone || 'O número aparecerá aqui'}</small>
          </div>
          <button className="whatsapp-btn" onClick={send}>
            Abrir no WhatsApp →
          </button>
        </div>
      </section>
      <h2 className="section-title">Automações preparadas</h2>
      <div className="automation-grid">
        {templates.map((t) => (
          <article className="panel" key={t[0]}>
            <header>
              <i>✉</i>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={!!existing(t[0])?.enabled}
                  onChange={() => toggle(t)}
                />
                <span />
              </label>
            </header>
            <small>{t[1]}</small>
            <h3>{t[0]}</h3>
            <p>{t[2]}</p>
            <footer>
              <span>{existing(t[0])?.enabled ? 'Ativa para a API' : 'Ativar lembrete'}</span>
            </footer>
          </article>
        ))}
      </div>
      {messages.length > 0 && (
        <article className="panel page-panel wa-history">
          <h2>Histórico de mensagens</h2>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {messages
                .slice()
                .reverse()
                .slice(0, 10)
                .map((m) => (
                  <tr key={m.id}>
                    <td>
                      <b>{m.customer}</b>
                      <small>{m.phone}</small>
                    </td>
                    <td>{m.kind}</td>
                    <td>{new Date(m.sentAt || '').toLocaleString('pt-BR')}</td>
                    <td>
                      <Badge>{m.status}</Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </article>
      )}
    </>
  );
}
function Warranties({ orders }: { orders: OrderItem[] }) {
  const covered = orders
    .filter((o) => o.stage === 'Retirada' || o.status === 'Concluído')
    .map((o) => ({ ...o, days: Number(o.warrantyDays || 90) }));
  return (
    <>
      <div className="metrics">
        <Metric t="Garantias ativas" v={String(covered.length)} d="Ordens entregues" />
        <Metric
          t="Vencem em breve"
          v={String(covered.filter((o) => o.days <= 15).length)}
          d="Até 15 dias"
        />
        <Metric
          t="Retornos"
          v={String(orders.filter((o) => o.priority === 'Garantia').length)}
          d="Em atendimento"
        />
        <Metric t="Prazo padrão" v="90 dias" d="Configurável na assistência" />
      </div>
      {covered.length ? (
        <article className="panel page-panel">
          <table>
            <thead>
              <tr>
                <th>OS</th>
                <th>Cliente</th>
                <th>Aparelho</th>
                <th>Serviço</th>
                <th>Prazo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {covered.map((o) => (
                <tr key={o.id}>
                  <td>
                    <b>{o.code}</b>
                  </td>
                  <td>{o.customer}</td>
                  <td>{o.device}</td>
                  <td>{o.problem}</td>
                  <td>{o.days} dias</td>
                  <td>
                    <Badge>Ativa</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ) : (
        <Empty
          title="Nenhuma garantia ativa"
          text="Ao entregar uma ordem, a garantia aparecerá automaticamente aqui."
        />
      )}
    </>
  );
}
function BusinessAssistant({
  orders,
  parts,
  payments,
}: {
  orders: OrderItem[];
  parts: PartItem[];
  payments: PaymentItem[];
}) {
  const revenue = payments.reduce((s, p) => s + Number(p.value || 0), 0),
    low = parts.filter((p) => Number(p.stock) < 5),
    [input, setInput] = useState(''),
    [chat, setChat] = useState<ChatMessage[]>([
      {
        role: 'ai',
        text: 'Olá! Sou a Reparo IA. Pergunte sobre ordens, receita, estoque ou prioridades da sua assistência.',
      },
    ]);
  const answer = (question: string) => {
    const q = question.toLowerCase();
    if (q.includes('receita') || q.includes('fatur'))
      return `A receita registrada é ${money(revenue)}, com ${payments.length} recebimentos.`;
    if (q.includes('estoque') || q.includes('produto') || q.includes('peça'))
      return low.length
        ? `${low.length} itens estão com estoque abaixo de 5 unidades: ${low
            .slice(0, 5)
            .map((p) => p.name)
            .join(', ')}.`
        : `Você possui ${parts.length} produtos cadastrados e nenhum está em nível crítico.`;
    if (q.includes('ordem') || q.includes('serviço'))
      return `Existem ${orders.length} ordens no total e ${orders.filter((o) => o.stage !== 'Retirada').length} ainda estão no fluxo de atendimento.`;
    if (q.includes('prioridade') || q.includes('fazer') || q.includes('hoje'))
      return low.length
        ? 'Minha sugestão: confira o estoque baixo e depois priorize as ordens mais antigas em reparo.'
        : 'Minha sugestão: priorize as ordens mais antigas e confirme os recebimentos pendentes.';
    return `Analisei seus dados: ${orders.length} ordens, ${parts.length} produtos e ${money(revenue)} em recebimentos. Você pode perguntar “como está meu estoque?”, “qual minha receita?” ou “o que devo priorizar?”.`;
  };
  const send = () => {
    const text = input.trim();
    if (!text) return;
    setChat((c) => [...c, { role: 'me', text }, { role: 'ai', text: answer(text) }]);
    setInput('');
  };
  const insights = [
    orders.length
      ? `${orders.length} ordens cadastradas, sendo ${orders.filter((o) => o.stage !== 'Retirada').length} ainda em fluxo.`
      : 'Crie ordens para receber análises de desempenho.',
    low.length
      ? `${low.length} itens estão com estoque abaixo de 5 unidades.`
      : 'Nenhum item está em nível crítico.',
    revenue
      ? `A receita registrada é ${money(revenue)}.`
      : 'Registre recebimentos para acompanhar receita e margem.',
  ];
  return (
    <div className="assistant-layout">
      <section className="insights">
        <div className="ai-heading">
          <div>✦</div>
          <span>
            Reparo IA<small>Assistente atual baseada nos seus dados</small>
          </span>
        </div>
        <h2>Resumo do negócio</h2>
        {insights.map((x, i) => (
          <article className="insight" key={x}>
            <i>{['⚒', '!', '↗'][i]}</i>
            <div>
              <strong>{['Serviços', 'Estoque', 'Financeiro'][i]}</strong>
              <p>{x}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="chat panel">
        <div className="chat-head">
          <span>✦</span>
          <div>
            <strong>Converse com a Reparo IA</strong>
            <small>Online · versão local em preparação</small>
          </div>
        </div>
        <div className="messages">
          {chat.map((m, i) => (
            <div className={`message ${m.role}`} key={i}>
              {m.text}
            </div>
          ))}
        </div>
        <div className="suggestions">
          {['Como está meu estoque?', 'Qual minha receita?', 'O que devo priorizar?'].map((s) => (
            <button onClick={() => setInput(s)} key={s}>
              {s}
            </button>
          ))}
        </div>
        <div className="composer">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder="Pergunte sobre sua assistência..."
          />
          <button onClick={send}>➤</button>
        </div>
      </section>
    </div>
  );
}
function Support({ items, open }: { items: TutorialItem[]; open: () => void }) {
  const guides = [
    ['Começando', 'Cadastre sua assistência e o primeiro cliente.'],
    ['Ordens de serviço', 'Crie uma OS, registre custos e acompanhe pela Mesa.'],
    ['Estoque', 'Cadastre produtos, custos, preços e disponibilidade.'],
    ['Financeiro', 'Registre entradas e despesas para acompanhar o resultado.'],
    ['Orçamentos', 'Envie propostas e registre a decisão do cliente.'],
    ['Garantias', 'Acompanhe aparelhos entregues e retornos.'],
  ];
  const youtube = (url: string) => {
    const match = String(url).match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/,
    );
    return match?.[1];
  };
  return (
    <>
      <div className="support-hero">
        <span>CENTRAL DE AJUDA</span>
        <h2>Aprenda a usar o ReparoSM</h2>
        <button className="support-add" onClick={open}>
          + Adicionar vídeo
        </button>
      </div>
      {items.length > 0 && (
        <>
          <h2 className="section-title">Vídeos da assistência</h2>
          <div className="tutorial-grid">
            {items.map((v) => (
              <article className="panel" key={v.id}>
                {youtube(v.url) ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${youtube(v.url)}`}
                    title={v.title}
                    allowFullScreen
                  />
                ) : (
                  <div className="video-link">▶</div>
                )}
                <small>{v.category || 'Tutorial'}</small>
                <h3>{v.title}</h3>
                <p>{v.description}</p>
                <a href={v.url} target="_blank" rel="noreferrer">
                  Assistir vídeo →
                </a>
              </article>
            ))}
          </div>
        </>
      )}
      <h2 className="section-title">Guias rápidos</h2>
      <div className="lesson-grid">
        {guides.map((g, i) => (
          <article className="panel" key={g[0]}>
            <div>
              <span>{i + 1}</span>▶
            </div>
            <small>GUIA RÁPIDO</small>
            <h3>{g[0]}</h3>
            <p>{g[1]}</p>
          </article>
        ))}
      </div>
      <div className="support-contact">
        <div>
          <strong>Como adicionar um vídeo?</strong>
          <span>
            Clique em “Adicionar vídeo”, cole o link do YouTube e preencha o título. Ele aparecerá
            nesta página automaticamente.
          </span>
        </div>
        <button onClick={open}>Adicionar vídeo</button>
      </div>
    </>
  );
}
function TutorialModal({ close, save }: { close: () => void; save: SaveAction }) {
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save('tutorial', {
            title: f.get('title'),
            url: f.get('url'),
            category: f.get('category'),
            description: f.get('description'),
            createdAt: new Date().toISOString(),
          });
        }}
      >
        <div className="modal-title">
          <div>
            <span>▶</span>
            <div>
              <h2>Adicionar vídeo</h2>
              <p>Publique um tutorial na central de ajuda</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Título do vídeo *
          <input name="title" required placeholder="Ex.: Como criar uma ordem de serviço" />
        </label>
        <label>
          Link do YouTube *
          <input name="url" type="url" required placeholder="https://youtube.com/watch?v=..." />
        </label>
        <label>
          Categoria
          <select name="category">
            <option>Começando</option>
            <option>Ordens de serviço</option>
            <option>Estoque</option>
            <option>Financeiro</option>
            <option>Orçamentos</option>
            <option>Garantias</option>
            <option>Outros</option>
          </select>
        </label>
        <label>
          Descrição
          <textarea
            name="description"
            placeholder="Explique rapidamente o que o usuário aprenderá."
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Adicionar vídeo</button>
        </div>
      </form>
    </div>
  );
}
function WhatsAppConnection() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [testPhone, setTestPhone] = useState('');
  const refresh = () =>
    fetch('/api/whatsapp')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false }));
  useEffect(() => {
    void refresh();
  }, []);
  const saveConfig = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const f = new FormData(e.currentTarget),
      r = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          token: f.get('token'),
          phoneNumberId: f.get('phoneNumberId'),
          wabaId: f.get('wabaId'),
          orderTemplate: f.get('orderTemplate'),
          statusTemplate: f.get('statusTemplate'),
          language: f.get('language'),
          version: 'v25.0',
        }),
      }),
      x = await r.json();
    setBusy(false);
    if (!r.ok) return setError(x.error || 'Não foi possível conectar.');
    setStatus(x);
    setEditing(false);
    setNotice('Número validado e conectado com segurança.');
  };
  const test = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    const r = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', to: testPhone }),
      }),
      x = await r.json();
    setBusy(false);
    if (!r.ok) return setError(x.error || 'Falha no teste.');
    setNotice('Mensagem aceita pela Meta. Confira o WhatsApp do destinatário.');
  };
  const disconnect = async () => {
    if (!confirm('Desconectar o WhatsApp desta loja?')) return;
    await fetch('/api/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect' }),
    });
    setStatus({ configured: false });
    setNotice('WhatsApp desconectado.');
  };
  return (
    <article className="panel whatsapp-status whatsapp-connect">
      <div className={status?.configured ? 'wa-connected' : 'wa-offline'}>WA</div>
      <div>
        <span>WHATSAPP BUSINESS · CONEXÃO POR LOJA</span>
        <h3>
          {!status
            ? 'Verificando configuração...'
            : status.configured
              ? `${status.verifiedName || 'Número comercial'} conectado`
              : 'Conecte o número desta assistência'}
        </h3>
        <p>
          {status?.configured
            ? `${status.displayPhone || status.phoneNumberId} · mensagens automáticas liberadas para OS autorizadas.`
            : 'Use o token permanente e os identificadores exibidos no painel da Meta. Cada lojista conecta apenas o próprio número.'}
        </p>
        {notice && <p className="wa-success">✓ {notice}</p>}
        {error && <p className="login-error">{error}</p>}
        {status?.configured && !editing ? (
          <>
            <small>
              Nova OS: {status.orderTemplate} · Atualização: {status.statusTemplate} · Idioma:{' '}
              {status.language}
            </small>
            <div className="wa-test">
              <input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="WhatsApp para teste com DDD"
              />
              <button type="button" disabled={busy || !testPhone} onClick={() => void test()}>
                {busy ? 'Enviando...' : 'Enviar teste'}
              </button>
            </div>
            <div className="wa-actions">
              <button type="button" onClick={() => setEditing(true)}>
                Atualizar configuração
              </button>
              <button type="button" className="danger" onClick={() => void disconnect()}>
                Desconectar
              </button>
            </div>
          </>
        ) : (
          <form className="wa-config" onSubmit={saveConfig}>
            <label>
              Token permanente da Meta
              <input
                name="token"
                type="password"
                required={!status?.configured}
                autoComplete="off"
                placeholder={
                  status?.configured ? 'Deixe vazio para manter o atual' : 'Cole o token permanente'
                }
              />
            </label>
            <div className="form-row">
              <label>
                ID do número de telefone
                <input
                  name="phoneNumberId"
                  required
                  defaultValue={status?.configured ? '' : undefined}
                  placeholder={status?.phoneNumberId || 'Ex.: 1355087011013166'}
                />
              </label>
              <label>
                ID da conta WhatsApp Business
                <input name="wabaId" placeholder="WABA ID" />
              </label>
            </div>
            <div className="form-row">
              <label>
                Modelo para nova OS
                <input
                  name="orderTemplate"
                  required
                  defaultValue={status?.orderTemplate || 'reparosm_nova_os'}
                />
              </label>
              <label>
                Modelo para atualização
                <input
                  name="statusTemplate"
                  required
                  defaultValue={status?.statusTemplate || 'reparosm_status_os'}
                />
              </label>
            </div>
            <label>
              Idioma do modelo
              <select name="language" defaultValue={status?.language || 'pt_BR'}>
                <option value="pt_BR">Português (Brasil)</option>
                <option value="en_US">Inglês (EUA)</option>
              </select>
            </label>
            <small>
              Os dois modelos precisam estar aprovados na Meta e possuir quatro variáveis: cliente,
              código da OS, aparelho e etapa.
            </small>
            <div className="wa-actions">
              {status?.configured && (
                <button type="button" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              )}
              <button className="primary" disabled={busy}>
                {busy ? 'Validando com a Meta...' : 'Validar e conectar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}
function DataTools({ records, save }: { records: RecordItem[]; save: SaveAction }) {
  const [type, setType] = useState<BusinessRecordType>('client');
  const labels: Record<string, string> = {
    client: 'Clientes',
    order: 'Ordens de serviço',
    payment: 'Recebimentos',
    expense: 'Despesas',
    part: 'Estoque',
    quote: 'Orçamentos',
    film: 'Películas',
  };
  const csv = (kind: string) => {
    const rows = records
      .filter((r) => r.type === kind)
      .map((r) => ({ id: r.id, ...r.data }) as DataObject & { id: string });
    if (!rows.length)
      return alert(`Não há ${(labels[kind] || 'registros').toLowerCase()} para exportar.`);
    const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const esc = (v: unknown) =>
      `"${String(Array.isArray(v) ? v.join(' | ') : (v ?? '')).replaceAll('"', '""')}"`;
    const content =
      '\uFEFF' +
      [keys.join(';'), ...rows.map((r) => keys.map((k) => esc(r[k])).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    a.download = `reparosm-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const lines = String(reader.result || '')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter(Boolean);
      const parse = (line: string) =>
        line
          .split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)
          .map((x) => x.replace(/^"|"$/g, '').replaceAll('""', '"'));
      const headers = parse(lines[0]);
      for (const line of lines.slice(1)) {
        const values = parse(line),
          data: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (h !== 'id') data[h] = values[i] || '';
        });
        await save(type, data);
      }
      alert(`${Math.max(0, lines.length - 1)} registros importados.`);
    };
    reader.readAsText(file, 'utf-8');
  };
  return (
    <>
      <article className="data-hero">
        <div>
          <span>⇩</span>
          <div>
            <h2>Central de dados</h2>
            <p>Exporte cópias, importe planilhas CSV e gere o relatório completo da loja.</p>
          </div>
        </div>
        <button onClick={() => window.open('/relatorio', '_blank')}>Gerar relatório PDF ↗</button>
      </article>
      <div className="export-grid">
        {Object.entries(labels).map(([kind, label]) => (
          <article className="panel" key={kind}>
            <span>ARQUIVO CSV</span>
            <h3>{String(label)}</h3>
            <p>{records.filter((r) => r.type === kind).length} registros disponíveis</p>
            <button onClick={() => csv(kind)}>Baixar CSV</button>
          </article>
        ))}
      </div>
      <article className="panel import-card">
        <div>
          <h3>Importar arquivo CSV</h3>
          <p>
            Use ponto e vírgula como separador. A primeira linha deve conter os nomes dos campos.
          </p>
        </div>
        <select value={type} onChange={(e) => setType(e.target.value as BusinessRecordType)}>
          {Object.entries(labels).map(([kind, label]) => (
            <option value={kind} key={kind}>
              {String(label)}
            </option>
          ))}
        </select>
        <label>
          Selecionar CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
          />
        </label>
      </article>
    </>
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
