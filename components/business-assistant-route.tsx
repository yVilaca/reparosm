'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatMoney as money } from '@/lib/format';
import type { Order, Part, Payment } from '@/lib/types';

type ChatMessage = { role: 'ai' | 'me'; text: string };

export default function BusinessAssistantRoute({
  orders,
  parts,
  payments,
}: {
  orders: (Order & { id: string })[];
  parts: (Part & { id: string })[];
  payments: (Payment & { id: string })[];
}) {
  const revenue = payments.reduce((sum, payment) => sum + Number(payment.value || 0), 0);
  const low = parts.filter((part) => Number(part.stock) < 5);
  const [input, setInput] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: 'ai',
      text: 'Olá! Sou a Reparo IA. Pergunte sobre ordens, receita, estoque ou prioridades da sua assistência.',
    },
  ]);
  const answer = (question: string) => {
    const normalized = question.toLowerCase();
    if (normalized.includes('receita') || normalized.includes('fatur'))
      return `A receita registrada é ${money(revenue)}, com ${payments.length} recebimentos.`;
    if (
      normalized.includes('estoque') ||
      normalized.includes('produto') ||
      normalized.includes('peça')
    )
      return low.length
        ? `${low.length} itens estão com estoque abaixo de 5 unidades: ${low
            .slice(0, 5)
            .map((part) => part.name)
            .join(', ')}.`
        : `Você possui ${parts.length} produtos cadastrados e nenhum está em nível crítico.`;
    if (normalized.includes('ordem') || normalized.includes('serviço'))
      return `Existem ${orders.length} ordens no total e ${orders.filter((order) => order.stage !== 'Retirada').length} ainda estão no fluxo de atendimento.`;
    if (
      normalized.includes('prioridade') ||
      normalized.includes('fazer') ||
      normalized.includes('hoje')
    )
      return low.length
        ? 'Minha sugestão: confira o estoque baixo e depois priorize as ordens mais antigas em reparo.'
        : 'Minha sugestão: priorize as ordens mais antigas e confirme os recebimentos pendentes.';
    return `Analisei seus dados: ${orders.length} ordens, ${parts.length} produtos e ${money(revenue)} em recebimentos. Você pode perguntar “como está meu estoque?”, “qual minha receita?” ou “o que devo priorizar?”.`;
  };
  const send = () => {
    const text = input.trim();
    if (!text) return;
    setChat((current) => [...current, { role: 'me', text }, { role: 'ai', text: answer(text) }]);
    setInput('');
  };
  const insights = [
    orders.length
      ? `${orders.length} ordens cadastradas, sendo ${orders.filter((order) => order.stage !== 'Retirada').length} ainda em fluxo.`
      : 'Crie ordens para receber análises de desempenho.',
    low.length
      ? `${low.length} itens estão com estoque abaixo de 5 unidades.`
      : 'Nenhum item está em nível crítico.',
    revenue
      ? `A receita registrada é ${money(revenue)}.`
      : 'Registre recebimentos para acompanhar receita e margem.',
  ];
  return (
    <>
      <header className="topbar">
        <div>
          <p>REPAROSM</p>
          <h1>Assistente IA</h1>
          <small>Resumo local baseado nos dados da sua assistência.</small>
        </div>
        <Link className="top-action-link" href="/">
          ← Painel completo
        </Link>
      </header>
      <div className="assistant-layout">
        <section className="insights">
          <div className="ai-heading">
            <div>✦</div>
            <span>
              Reparo IA<small>Assistente atual baseada nos seus dados</small>
            </span>
          </div>
          <h2>Resumo do negócio</h2>
          {insights.map((insight, index) => (
            <article className="insight" key={insight}>
              <i>{['⚒', '!', '↗'][index]}</i>
              <div>
                <strong>{['Serviços', 'Estoque', 'Financeiro'][index]}</strong>
                <p>{insight}</p>
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
            {chat.map((message, index) => (
              <div className={`message ${message.role}`} key={index}>
                {message.text}
              </div>
            ))}
          </div>
          <div className="suggestions">
            {['Como está meu estoque?', 'Qual minha receita?', 'O que devo priorizar?'].map(
              (suggestion) => (
                <button type="button" onClick={() => setInput(suggestion)} key={suggestion}>
                  {suggestion}
                </button>
              ),
            )}
          </div>
          <div className="composer">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') send();
              }}
              placeholder="Pergunte sobre sua assistência..."
            />
            <button type="button" onClick={send}>
              ➤
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
