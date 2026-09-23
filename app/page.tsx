'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import './accounts.css';
import './recovery.css';
import './mesa.css';
import './whatsapp.css';

type RecordItem = { id: string; type: string; data: any };
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

async function api(type?: string, data?: any, id?: string) {
  if (!type) {
    const r = await fetch('/api/state');
    return (await r.json()).records as RecordItem[];
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
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const whatsappUrl = (phone: string, message: string) => {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};
const openWhatsApp = (phone: string, message: string) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return false;
  window.open(whatsappUrl(phone, message), '_blank', 'noopener,noreferrer');
  return true;
};

export default function Home() {
  const [active, setActive] = useState('Dashboard');
  const [account, setAccount] = useState<any>(null),
    [authLoading, setAuthLoading] = useState(true);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [modal, setModal] = useState<
    'order' | 'quote' | 'part' | 'film' | 'client' | 'payment' | 'expense' | 'tutorial' | null
  >(null);
  const [toast, setToast] = useState('');
  const load = () =>
    api()
      .then(setRecords)
      .catch(() => setRecords([]));
  useEffect(() => {
    fetch('/api/auth')
      .then(async (r) => {
        const x = await r.json();
        setAccount(x.account);
        if (x.account) await load();
      })
      .catch(() => setAccount(null))
      .finally(() => setAuthLoading(false));
  }, []);
  const save = async (type: string, data: any, id?: string) => {
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
  const removeOrder = async (order: any) => {
    if (!confirm(`Excluir definitivamente a ordem ${order.code}?`)) return;
    await fetch(`/api/state?id=${encodeURIComponent(order.id)}`, { method: 'DELETE' });
    await load();
    setToast('Ordem excluída');
    setTimeout(() => setToast(''), 2200);
  };
  const by = (type: string) =>
    records.filter((r) => r.type === type).map((r) => ({ id: r.id, ...r.data }));
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
          {visibleMenu.map((x, i) => (
            <button key={x} onClick={() => setActive(x)} className={active === x ? 'active' : ''}>
              <span>{i < icons.length ? icons[i] : '♙'}</span>
              {x}
            </button>
          ))}
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
            {(active === 'Mesa' || active === 'Ordens de serviço') && (
              <button className="primary" onClick={() => setModal('order')}>
                + Nova ordem
              </button>
            )}
            {active === 'Orçamentos' && (
              <button className="primary" onClick={() => setModal('quote')}>
                + Novo orçamento
              </button>
            )}
            {(active === 'Peças & Vitrine' || active === 'Estoque') && (
              <button className="primary" onClick={() => setModal('part')}>
                + Adicionar peça
              </button>
            )}
            {active === 'Películas' && (
              <button className="primary" onClick={() => setModal('film')}>
                + Compatibilidade
              </button>
            )}
            {active === 'Clientes' && (
              <button className="primary" onClick={() => setModal('client')}>
                + Novo cliente
              </button>
            )}
            {active === 'Pagamentos' && (
              <>
                <button onClick={() => setModal('expense')}>+ Despesa</button>
                <button className="primary" onClick={() => setModal('payment')}>
                  + Recebimento
                </button>
              </>
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
        {active === 'Orçamentos' && <QuotesManage items={quotes} open={() => setModal('quote')} />}
        {active === 'Ordens de serviço' && (
          <OrdersManage
            items={orders}
            save={save}
            open={() => {
              setEditingOrder(null);
              setModal('order');
            }}
            edit={(o) => {
              setEditingOrder(o);
              setModal('order');
            }}
            remove={removeOrder}
          />
        )}
        {active === 'Peças & Vitrine' && (
          <Parts accountId={account.id} items={parts} save={save} open={() => setModal('part')} />
        )}
        {active === 'Estoque' && <Inventory items={parts} open={() => setModal('part')} />}
        {active === 'Películas' && <FilmsSorted items={films} open={() => setModal('film')} />}
        {active === 'Pagamentos' && <Finance payments={payments} expenses={expenses} />}
        {active === 'Clientes' && (
          <Clients items={clients} save={save} open={() => setModal('client')} />
        )}
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
      {modal === 'order' &&
        (editingOrder ? (
          <OrderEditModal
            item={editingOrder}
            close={() => {
              setEditingOrder(null);
              setModal(null);
            }}
            save={save}
          />
        ) : (
          <OrderModalSafe close={() => setModal(null)} save={save} />
        ))}
      {modal === 'quote' && <QuoteModalSafe close={() => setModal(null)} save={save} />}
      {modal === 'part' && <PartModal close={() => setModal(null)} save={save} />}
      {modal === 'film' && <FilmModal close={() => setModal(null)} save={save} />}
      {modal === 'client' && <ClientModal close={() => setModal(null)} save={save} />}
      {modal === 'payment' && (
        <MoneyModal kind="payment" close={() => setModal(null)} save={save} />
      )}
      {modal === 'expense' && (
        <MoneyModal kind="expense" close={() => setModal(null)} save={save} />
      )}
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
  orders: any[];
  quotes: any[];
  parts: any[];
  clients: any[];
  payments: any[];
  expenses: any[];
  messages: any[];
}) {
  const revenue = payments.reduce((s, p) => s + Number(p.value || 0), 0),
    out = expenses.reduce((s, p) => s + Number(p.value || 0), 0),
    profit = revenue - out,
    goal = 50000,
    open = orders.filter((o) => o.status !== 'Concluído' && o.stage !== 'Retirada'),
    low = parts.filter((p) => Number(p.stock) < 5),
    approved = quotes.filter((q) => q.status === 'Aprovado');
  const activity = [
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

function Mesa({ orders, save, open }: { orders: any[]; save: any; open: () => void }) {
  const move = (o: any, dir: number) => {
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
function Quotes({ items, save, open }: { items: any[]; save: any; open: () => void }) {
  const [preview, setPreview] = useState<any>(null);
  const status = (q: any, s: string) => save('quote', { ...q, status: s }, q.id);
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
                    <Badge>{q.status}</Badge>
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
function Orders({ items, save, open }: { items: any[]; save: any; open: () => void }) {
  const send = (o: any) => {
    const message = `Olá, ${o.customer}! Atualização da ${o.code}: seu ${o.device} está na etapa “${o.stage || 'Recebido'}”. Qualquer dúvida, estamos à disposição. — ReparoSM`;
    if (openWhatsApp(o.phone, message))
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
                <Badge>{o.stage}</Badge>
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

function Parts({
  items,
  save,
  open,
  accountId,
}: {
  items: any[];
  save: any;
  open: () => void;
  accountId: string;
}) {
  const published = items.filter((p) => p.published);
  const openStore = () =>
    window.open(
      `${window.location.origin}/vitrine?loja=${encodeURIComponent(accountId)}`,
      '_blank',
      'noopener,noreferrer',
    );
  const copyStore = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/vitrine?loja=${encodeURIComponent(accountId)}`,
    );
    alert('Link da vitrine copiado!');
  };
  return (
    <>
      <article className="showcase-banner">
        <div>
          <span>VITRINE ONLINE</span>
          <h2>Minha vitrine de produtos</h2>
          <p>{published.length} produtos publicados</p>
          <code>
            {typeof window === 'undefined'
              ? `/vitrine?loja=${encodeURIComponent(accountId)}`
              : `${window.location.origin}/vitrine?loja=${encodeURIComponent(accountId)}`}
          </code>
        </div>
        <div className="showcase-actions">
          <button onClick={openStore}>Abrir vitrine ↗</button>
          <button onClick={copyStore}>Copiar link</button>
        </div>
      </article>
      {items.length ? (
        <div className="catalog-grid">
          {items.map((p) => (
            <article key={p.id}>
              <div className="part-art">
                {p.category === 'Capinhas'
                  ? '▣'
                  : p.category === 'Carregadores'
                    ? '⌁'
                    : p.category === 'Acessórios'
                      ? '◇'
                      : '⚙'}
              </div>
              <span>{p.category}</span>
              <h3>{p.name}</h3>
              <p>{p.stock} unidades</p>
              <strong>{money(Number(p.price))}</strong>
              <footer>
                <label>
                  <input
                    type="checkbox"
                    checked={p.published}
                    onChange={(e) => void save('part', { ...p, published: e.target.checked }, p.id)}
                  />{' '}
                  Publicar na vitrine
                </label>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Nenhum produto cadastrado"
          text="Adicione peças, carregadores, capinhas, acessórios ou qualquer produto da sua loja."
          action="Adicionar produto"
          onAction={open}
        />
      )}
    </>
  );
}

function OrderModal({ close, save }: { close: () => void; save: any }) {
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
  const field = (key: keyof typeof form) => (e: any) =>
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

function QuoteModal({ close, save }: { close: () => void; save: any }) {
  const [labor, setLabor] = useState(0),
    [parts, setParts] = useState(0);
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save('quote', {
            code: `ORC-${Date.now().toString().slice(-4)}`,
            customer: f.get('customer'),
            device: f.get('device'),
            service: f.get('service'),
            labor,
            parts,
            total: labor + parts,
            status: 'Aguardando',
          });
        }}
      >
        <div className="modal-title">
          <div>
            <span>▤</span>
            <div>
              <h2>Novo orçamento</h2>
              <p>Somente para celulares</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Cliente *<input name="customer" required />
        </label>
        <label>
          Celular *<input name="device" required placeholder="Marca e modelo" />
        </label>
        <label>
          Serviço proposto *<textarea name="service" required />
        </label>
        <div className="form-row">
          <label>
            Mão de obra
            <input type="number" value={labor} onChange={(e) => setLabor(Number(e.target.value))} />
          </label>
          <label>
            Peças
            <input type="number" value={parts} onChange={(e) => setParts(Number(e.target.value))} />
          </label>
        </div>
        <div className="order-total">
          <span>Total do orçamento</span>
          <strong>{money(labor + parts)}</strong>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Criar e gerar link</button>
        </div>
      </form>
    </div>
  );
}
function OrdersManage({
  items,
  save,
  open,
  edit,
  remove,
}: {
  items: any[];
  save: any;
  open: () => void;
  edit: (o: any) => void;
  remove: (o: any) => void;
}) {
  const send = (o: any) => {
    const message = `Olá, ${o.customer}! Atualização da ${o.code}: seu ${o.device} está na etapa “${o.stage || 'Recebido'}”.`;
    if (openWhatsApp(o.phone, message))
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
    <article className="panel page-panel order-management">
      <table>
        <thead>
          <tr>
            <th>OS</th>
            <th>Cliente</th>
            <th>Aparelho</th>
            <th>Etapa</th>
            <th>Total</th>
            <th>Custo</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.id}>
              <td>
                <b>{o.code}</b>
              </td>
              <td>{o.customer || '—'}</td>
              <td>{o.device || '—'}</td>
              <td>
                <Badge>{o.stage || 'Recebido'}</Badge>
              </td>
              <td>{money(Number(o.total || 0))}</td>
              <td>{money(Number(o.cost || 0))}</td>
              <td>
                <div className="row-actions">
                  <button onClick={() => send(o)}>WhatsApp</button>
                  <button onClick={() => edit(o)}>Editar</button>
                  <button className="danger" onClick={() => remove(o)}>
                    Excluir
                  </button>
                </div>
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
function OrderEditModal({ item, close, save }: { item: any; close: () => void; save: any }) {
  const [form, setForm] = useState({ ...item }),
    [saving, setSaving] = useState(false);
  const field = (key: string) => (e: any) =>
    setForm((v: any) => ({
      ...v,
      [key]: e.target.type === 'number' ? Number(e.target.value) : e.target.value,
    }));
  const total = Number(form.labor || 0) + Number(form.parts || 0),
    profit = total - Number(form.cost || 0);
  const submit = async () => {
    if (!String(form.customer || '').trim() || !String(form.device || '').trim())
      return alert('Informe cliente e aparelho.');
    setSaving(true);
    await save('order', { ...form, total, profit, updatedAt: new Date().toISOString() }, item.id);
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
              {stages.map((s) => (
                <option key={s}>{s}</option>
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
          <button type="button" className="primary" disabled={saving} onClick={submit}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
function QuotesManage({ items, open }: { items: any[]; open: () => void }) {
  const link = (q: any) => `${window.location.origin}/o/${encodeURIComponent(q.id)}`;
  const copy = async (q: any) => {
    await navigator.clipboard.writeText(link(q));
    alert('Link do orçamento copiado!');
  };
  const send = (q: any) => {
    const text = `Olá, ${q.customer}! Seu orçamento ${q.code} para ${q.device} está pronto. Visualize, aprove ou recuse aqui: ${link(q)}`;
    if (!openWhatsApp(q.phone, text)) alert('Cadastre um WhatsApp válido no orçamento.');
  };
  return items.length ? (
    <article className="panel page-panel quote-management">
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Cliente</th>
            <th>Celular</th>
            <th>Problema</th>
            <th>Total</th>
            <th>Status</th>
            <th>Compartilhar</th>
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
              <td>{q.problem || q.service || '—'}</td>
              <td>{money(Number(q.total || 0))}</td>
              <td>
                <Badge>{q.status}</Badge>
              </td>
              <td>
                <div className="row-actions">
                  <button onClick={() => window.open(link(q), '_blank')}>Abrir</button>
                  <button onClick={() => copy(q)}>Copiar link</button>
                  <button className="whatsapp-btn small" onClick={() => send(q)}>
                    WhatsApp
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  ) : (
    <Empty
      title="Nenhum orçamento"
      text="Crie um orçamento detalhado e compartilhe o link com o cliente."
      action="Criar orçamento"
      onAction={open}
    />
  );
}
function QuoteModalSafe({ close, save }: { close: () => void; save: any }) {
  const [labor, setLabor] = useState(0),
    [parts, setParts] = useState(0),
    [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const f = new FormData(e.currentTarget);
    await save('quote', {
      code: `ORC-${Date.now().toString().slice(-5)}`,
      customer: f.get('customer'),
      phone: f.get('phone'),
      device: f.get('device'),
      problem: f.get('problem'),
      service: f.get('service'),
      notes: f.get('notes'),
      validUntil: f.get('validUntil'),
      labor,
      parts,
      total: labor + parts,
      status: 'Aguardando',
      createdAt: new Date().toISOString(),
    });
  };
  return (
    <div className="modal-backdrop">
      <form className="modal quote-modal" onSubmit={submit}>
        <div className="modal-title">
          <div>
            <span>▤</span>
            <div>
              <h2>Novo orçamento</h2>
              <p>Gere um link para aprovação do cliente</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <div className="form-row">
          <label>
            Cliente *<input name="customer" required />
          </label>
          <label>
            WhatsApp *<input name="phone" required placeholder="(DDD) número" />
          </label>
        </div>
        <label>
          Celular *<input name="device" required placeholder="Marca e modelo" />
        </label>
        <label>
          Problema relatado *
          <textarea name="problem" required placeholder="Ex.: Aparelho não liga e não carrega" />
        </label>
        <label>
          Serviço proposto *
          <textarea
            name="service"
            required
            placeholder="Descreva o diagnóstico e o que será realizado"
          />
        </label>
        <label>
          Observações para o cliente
          <textarea
            name="notes"
            placeholder="Condições, prazo, qualidade da peça, garantia ou recomendações"
          />
        </label>
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
            Peças
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
          Válido até
          <input name="validUntil" type="date" />
        </label>
        <div className="order-total">
          <span>Total do orçamento</span>
          <strong>{money(labor + parts)}</strong>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Criando...' : 'Criar e gerar link'}
          </button>
        </div>
      </form>
    </div>
  );
}
function FilmsSorted({ items, open }: { items: any[]; open: () => void }) {
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
function Login({ onLogin }: { onLogin: (account: any) => void }) {
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [forgot, setForgot] = useState(false),
    [notice, setNotice] = useState(''),
    [showPassword, setShowPassword] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setNotice('');
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: forgot ? 'forgot-password' : 'login',
          username: f.get('username'),
          ...(!forgot ? { password: f.get('password') } : {}),
        }),
      });
      const x = await r.json();
      if (!r.ok) throw new Error(x.error || 'Não foi possível continuar.');
      if (forgot) setNotice(x.message);
      else await onLogin(x.account);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span>R</span>
          <div>
            <h1>ReparoSM</h1>
            <p>Repair System Master</p>
          </div>
        </div>
        <div className="login-heading">
          <h2>{forgot ? 'Esqueci minha senha' : 'Entre na sua assistência'}</h2>
          <p>
            {forgot
              ? 'Informe seu usuário para solicitar uma nova senha ao administrador.'
              : 'Cada loja possui uma conta e dados separados.'}
          </p>
        </div>
        <label>
          Usuário
          <input
            name="username"
            required
            minLength={3}
            maxLength={80}
            autoComplete="username"
            placeholder="Digite seu usuário"
            autoFocus
          />
        </label>
        {!forgot && (
          <div>
            <label htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Digite sua senha"
            />
            <button
              type="button"
              aria-controls="login-password"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            </button>
          </div>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="account-notice" role="status">
            {notice}
          </p>
        )}
        <button className="primary login-submit" disabled={loading}>
          {loading ? 'Aguarde...' : forgot ? 'Solicitar ao administrador' : 'Entrar no sistema'}
        </button>
        <button
          type="button"
          className="logout-button"
          disabled={loading}
          onClick={() => {
            setForgot(!forgot);
            setError('');
            setNotice('');
          }}
        >
          {forgot ? 'Voltar ao login' : 'Esqueci minha senha'}
        </button>
        <small className="first-access">
          {forgot
            ? 'Sua senha só será alterada pelo administrador após confirmar sua identidade.'
            : 'A sessão expira automaticamente após 12 horas.'}
        </small>
      </form>
    </main>
  );
}

function PasswordRequests() {
  const [accounts, setAccounts] = useState<any[]>([]),
    [requests, setRequests] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
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
                  setSelected(a);
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
            setSelected(accounts.find((a) => a.id === e.target.value));
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
  const [items, setItems] = useState<any[]>([]),
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
  const update = async (a: any, status: string) => {
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
  const remove = async (a: any) => {
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

function OrderModalSafe({ close, save }: { close: () => void; save: any }) {
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
      priority: 'Normal',
    });
  const total = labor + parts,
    field = (key: keyof typeof form) => (e: any) =>
      setForm((v) => ({ ...v, [key]: e.target.value }));
  const toggle = (n: number) =>
    setPattern((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const next = () => {
    const ok =
      step === 1 ? form.customer.trim() : step === 2 ? form.device.trim() : form.problem.trim();
    if (!ok) return alert('Preencha os campos obrigatórios antes de continuar.');
    setStep((s) => Math.min(4, s + 1));
  };
  const create = async () => {
    if (saving) return;
    setSaving(true);
    await save('order', {
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
  };
  return (
    <div className="modal-backdrop">
      <form
        className="modal order-modal"
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA')
            e.preventDefault();
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
                checked={whatsappConsent}
                onChange={(e) => setWhatsappConsent(e.target.checked)}
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
            <small className="value-confirmation">
              Revise os valores. A ordem só será criada ao clicar no botão abaixo.
            </small>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" onClick={() => (step === 1 ? close() : setStep((s) => s - 1))}>
            {step === 1 ? 'Cancelar' : '← Voltar'}
          </button>
          {step < 4 ? (
            <button type="button" className="primary" onClick={next}>
              Continuar →
            </button>
          ) : (
            <button type="button" className="primary" disabled={saving} onClick={create}>
              {saving ? 'Criando...' : 'Criar ordem'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
function PartModal({ close, save }: { close: () => void; save: any }) {
  const [category, setCategory] = useState('Telas'),
    [custom, setCustom] = useState('');
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save('part', {
            name: f.get('name'),
            category: category === 'Outra' ? custom.trim() : category,
            stock: Number(f.get('stock')),
            cost: Number(f.get('cost')),
            price: Number(f.get('price')),
            sku: f.get('sku'),
            published: f.get('published') === 'on',
          });
        }}
      >
        <div className="modal-title">
          <div>
            <span>◇</span>
            <div>
              <h2>Adicionar produto</h2>
              <p>Estoque geral e vitrine online</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Nome do produto *<input name="name" required placeholder="Ex.: Carregador USB-C 20W" />
        </label>
        <div className="form-row">
          <label>
            Categoria
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>Telas</option>
              <option>Baterias</option>
              <option>Conectores</option>
              <option>Peças e componentes</option>
              <option>Carregadores</option>
              <option>Cabos</option>
              <option>Capinhas</option>
              <option>Películas</option>
              <option>Fones de ouvido</option>
              <option>Acessórios</option>
              <option>Celulares</option>
              <option>Smartwatches</option>
              <option>Outra</option>
            </select>
          </label>
          <label>
            Código / SKU
            <input name="sku" placeholder="Opcional" />
          </label>
        </div>
        {category === 'Outra' && (
          <label>
            Nome da nova categoria *
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              required
              placeholder="Digite sua categoria"
            />
          </label>
        )}
        <div className="form-row">
          <label>
            Quantidade em estoque
            <input name="stock" type="number" min="0" required />
          </label>
          <label>
            Custo unitário
            <input name="cost" type="number" min="0" step="0.01" required />
          </label>
        </div>
        <label>
          Preço de venda
          <input name="price" type="number" min="0" step="0.01" required />
        </label>
        <label className="check">
          <input name="published" type="checkbox" defaultChecked /> Publicar na vitrine online
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Salvar produto</button>
        </div>
      </form>
    </div>
  );
}

function Inventory({ items, open }: { items: any[]; open: () => void }) {
  const total = items.reduce((s, p) => s + Number(p.stock || 0) * Number(p.cost || 0), 0);
  return (
    <>
      <div className="metrics">
        <Metric
          t="Itens em estoque"
          v={String(items.reduce((s, p) => s + Number(p.stock || 0), 0))}
          d="Unidades disponíveis"
        />
        <Metric t="Valor investido" v={money(total)} d="Baseado no custo" />
        <Metric
          t="Estoque baixo"
          v={String(items.filter((p) => Number(p.stock) < 5).length)}
          d="Produtos com menos de 5"
        />
        <Metric t="Produtos cadastrados" v={String(items.length)} d="Todos os tipos" />
      </div>
      {items.length ? (
        <article className="panel page-panel inventory-table">
          <table>
            <thead>
              <tr>
                <th>Peça</th>
                <th>Categoria</th>
                <th>Quantidade</th>
                <th>Custo</th>
                <th>Venda</th>
                <th>Margem</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td>{p.category}</td>
                  <td>{p.stock} un.</td>
                  <td>{money(Number(p.cost))}</td>
                  <td>{money(Number(p.price))}</td>
                  <td>{money(Number(p.price) - Number(p.cost))}</td>
                  <td>
                    <Badge>{Number(p.stock) < 5 ? 'Estoque baixo' : 'Disponível'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ) : (
        <Empty
          title="Estoque vazio"
          text="Cadastre sua primeira peça para controlar quantidade, custo, venda e margem."
          action="Adicionar peça"
          onAction={open}
        />
      )}
    </>
  );
}
function Films({ items, open }: { items: any[]; open: () => void }) {
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
function MyShop({ item, save }: { item: any; save: any }) {
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
function FilmModal({ close, save }: { close: () => void; save: any }) {
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
function Clients({ items, save, open }: { items: any[]; save: any; open: () => void }) {
  const [search, setSearch] = useState('');
  const visible = items.filter((c) =>
    `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase()),
  );
  const change = (c: any, status: string) => void save('client', { ...c, status }, c.id);
  const chat = (c: any) => {
    const message = `Olá, ${c.name}! Aqui é da ReparoSM. Como podemos ajudar?`;
    if (openWhatsApp(c.phone, message))
      void save('message', {
        customer: c.name,
        phone: c.phone,
        kind: 'Contato direto',
        message,
        status: 'Aberto no WhatsApp',
        sentAt: new Date().toISOString(),
      });
    else alert('Cadastre um WhatsApp válido para este cliente.');
  };
  return (
    <>
      <div className="metrics">
        <Metric t="Clientes" v={String(items.length)} d="Cadastrados diretamente" />
        <Metric
          t="Em atendimento"
          v={String(items.filter((c) => c.status === 'Em atendimento').length)}
          d="Com acompanhamento"
        />
        <Metric
          t="Concluídos"
          v={String(items.filter((c) => c.status === 'Concluído').length)}
          d="Atendimentos finalizados"
        />
        <Metric t="VIP" v={String(items.filter((c) => c.vip).length)} d="Clientes prioritários" />
      </div>
      {items.length ? (
        <article className="panel page-panel clients-page">
          <div className="toolbar">
            <label>
              ⌕
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente por nome ou telefone..."
              />
            </label>
          </div>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contato</th>
                <th>Documento</th>
                <th>Status</th>
                <th>Observações</th>
                <th>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                    {c.vip && <small className="vip"> VIP</small>}
                  </td>
                  <td>
                    {c.phone}
                    <small>{c.email}</small>
                  </td>
                  <td>{c.document || '—'}</td>
                  <td>
                    <select
                      className="status-select"
                      value={c.status || 'Novo'}
                      onChange={(e) => change(c, e.target.value)}
                    >
                      <option>Novo</option>
                      <option>Em atendimento</option>
                      <option>Aguardando</option>
                      <option>Concluído</option>
                      <option>Inativo</option>
                    </select>
                  </td>
                  <td>{c.notes || '—'}</td>
                  <td>
                    <button className="whatsapp-btn small" onClick={() => chat(c)}>
                      Conversar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ) : (
        <Empty
          title="Nenhum cliente cadastrado"
          text="Você pode cadastrar clientes mesmo sem criar uma ordem de serviço."
          action="Cadastrar cliente"
          onAction={open}
        />
      )}
    </>
  );
}
function ClientModal({ close, save }: { close: () => void; save: any }) {
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save('client', {
            name: f.get('name'),
            phone: f.get('phone'),
            email: f.get('email'),
            document: f.get('document'),
            address: f.get('address'),
            birth: f.get('birth'),
            status: f.get('status'),
            vip: f.get('vip') === 'on',
            notes: f.get('notes'),
            createdAt: new Date().toISOString(),
          });
        }}
      >
        <div className="modal-title">
          <div>
            <span>◌</span>
            <div>
              <h2>Novo cliente</h2>
              <p>Cadastro independente de ordem de serviço</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Nome completo *<input name="name" required />
        </label>
        <div className="form-row">
          <label>
            WhatsApp *<input name="phone" required />
          </label>
          <label>
            E-mail
            <input name="email" type="email" />
          </label>
        </div>
        <div className="form-row">
          <label>
            CPF / CNPJ
            <input name="document" />
          </label>
          <label>
            Data de nascimento
            <input name="birth" type="date" />
          </label>
        </div>
        <label>
          Endereço
          <input name="address" />
        </label>
        <label>
          Status inicial
          <select name="status">
            <option>Novo</option>
            <option>Em atendimento</option>
            <option>Aguardando</option>
            <option>Concluído</option>
            <option>Inativo</option>
          </select>
        </label>
        <label className="check">
          <input name="vip" type="checkbox" /> Marcar como cliente VIP
        </label>
        <label>
          Observações
          <textarea name="notes" />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Cadastrar cliente</button>
        </div>
      </form>
    </div>
  );
}
function MyShopV2({ item, save }: { item: any; save: any }) {
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
function Finance({ payments, expenses }: { payments: any[]; expenses: any[] }) {
  const income = payments.reduce((s, p) => s + Number(p.value || 0), 0),
    out = expenses.reduce((s, p) => s + Number(p.value || 0), 0);
  const rows = [
    ...payments.map((p) => ({ ...p, kind: 'Receita' })),
    ...expenses.map((p) => ({ ...p, kind: 'Despesa' })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return (
    <>
      <div className="metrics">
        <Metric t="Recebimentos" v={money(income)} d="Entradas registradas" />
        <Metric t="Despesas" v={money(out)} d="Saídas registradas" />
        <Metric t="Resultado" v={money(income - out)} d="Receita menos despesas" />
        <Metric t="Lançamentos" v={String(rows.length)} d="No histórico financeiro" />
      </div>
      {rows.length ? (
        <article className="panel page-panel finance-list">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Forma</th>
                <th>Data</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Badge>{r.kind}</Badge>
                  </td>
                  <td>
                    <b>{r.description}</b>
                    <small>{r.reference || ''}</small>
                  </td>
                  <td>{r.method}</td>
                  <td>{r.date}</td>
                  <td className={r.kind === 'Despesa' ? 'negative-money' : 'positive-money'}>
                    {r.kind === 'Despesa' ? '- ' : '+ '}
                    {money(Number(r.value))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ) : (
        <Empty
          title="Financeiro sem movimentações"
          text="Registre um recebimento ou despesa para iniciar o controle do caixa."
        />
      )}
    </>
  );
}
function MoneyModal({
  kind,
  close,
  save,
}: {
  kind: 'payment' | 'expense';
  close: () => void;
  save: any;
}) {
  const receive = kind === 'payment';
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save(kind, {
            description: f.get('description'),
            reference: f.get('reference'),
            method: f.get('method'),
            date: f.get('date'),
            value: Number(f.get('value')),
            createdAt: new Date().toISOString(),
          });
        }}
      >
        <div className="modal-title">
          <div>
            <span>{receive ? '↗' : '↘'}</span>
            <div>
              <h2>{receive ? 'Registrar recebimento' : 'Registrar despesa'}</h2>
              <p>Lançamento no controle financeiro</p>
            </div>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Descrição *
          <input
            name="description"
            required
            placeholder={receive ? 'Ex.: Pagamento OS-1024' : 'Ex.: Compra de componentes'}
          />
        </label>
        <label>
          Referência
          <input name="reference" placeholder="OS, cliente, fornecedor ou documento" />
        </label>
        <div className="form-row">
          <label>
            Forma
            <select name="method">
              <option>Pix</option>
              <option>Dinheiro</option>
              <option>Cartão de débito</option>
              <option>Cartão de crédito</option>
              <option>Boleto</option>
            </select>
          </label>
          <label>
            Data
            <input
              name="date"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
        </div>
        <label>
          Valor *<input name="value" type="number" min="0.01" step="0.01" required />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Salvar lançamento</button>
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
  items: any[];
  messages: any[];
  clients: any[];
  orders: any[];
  shop: any;
  save: any;
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
    if (openWhatsApp(selected.phone, text))
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
                    <td>{new Date(m.sentAt).toLocaleString('pt-BR')}</td>
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
function Warranties({ orders }: { orders: any[] }) {
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
  orders: any[];
  parts: any[];
  payments: any[];
}) {
  const revenue = payments.reduce((s, p) => s + Number(p.value || 0), 0),
    low = parts.filter((p) => Number(p.stock) < 5),
    [input, setInput] = useState(''),
    [chat, setChat] = useState<any[]>([
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
function Support({ items, open }: { items: any[]; open: () => void }) {
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
function TutorialModal({ close, save }: { close: () => void; save: any }) {
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
  const [status, setStatus] = useState<any>(null),
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
function DataTools({ records, save }: { records: RecordItem[]; save: any }) {
  const [type, setType] = useState('client');
  const labels: any = {
    client: 'Clientes',
    order: 'Ordens de serviço',
    payment: 'Recebimentos',
    expense: 'Despesas',
    part: 'Estoque',
    quote: 'Orçamentos',
    film: 'Películas',
  };
  const csv = (kind: string) => {
    const rows = records.filter((r) => r.type === kind).map((r) => ({ id: r.id, ...r.data }));
    if (!rows.length) return alert(`Não há ${labels[kind].toLowerCase()} para exportar.`);
    const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const esc = (v: any) =>
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
        <select value={type} onChange={(e) => setType(e.target.value)}>
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
