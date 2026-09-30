'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/ui/page-header';
import { formatMoney as money } from '@/lib/format';
import type { Order, Part, Payment } from '@/lib/types';

type ChatMessage = { role: 'ai' | 'me'; text: string };

const suggestions = ['Como está meu estoque?', 'Qual minha receita?', 'O que devo priorizar?'];

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
    {
      title: 'Serviços',
      text: orders.length
        ? `${orders.length} ordens cadastradas, sendo ${orders.filter((order) => order.stage !== 'Retirada').length} ainda em fluxo.`
        : 'Crie ordens para receber análises de desempenho.',
    },
    {
      title: 'Estoque',
      text: low.length
        ? `${low.length} itens estão com estoque abaixo de 5 unidades.`
        : 'Nenhum item está em nível crítico.',
    },
    {
      title: 'Financeiro',
      text: revenue
        ? `A receita registrada é ${money(revenue)}.`
        : 'Registre recebimentos para acompanhar receita e margem.',
    },
  ];
  return (
    <>
      <PageHeader
        title="Assistente IA"
        description="Resumo local baseado nos dados da sua assistência."
        action={
          <Button asChild variant="outline">
            <Link href="/">Painel completo</Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Resumo do negócio</CardTitle>
            <p className="text-sm text-muted-foreground">Reparo IA · baseada nos seus dados</p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {insights.map((insight) => (
              <article className="grid gap-1 rounded-lg border p-3" key={insight.title}>
                <strong className="text-sm">{insight.title}</strong>
                <p className="text-sm text-muted-foreground">{insight.text}</p>
              </article>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Converse com a Reparo IA</CardTitle>
            <p className="text-sm text-muted-foreground">Online · versão local em preparação</p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid max-h-[360px] gap-2 overflow-y-auto rounded-lg border p-3">
              {chat.map((message, index) => (
                <div
                  className={
                    message.role === 'me'
                      ? 'ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                      : 'mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm'
                  }
                  key={index}
                >
                  {message.text}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  size="sm"
                  variant="outline"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') send();
                }}
                placeholder="Pergunte sobre sua assistência..."
                value={input}
              />
              <Button onClick={send} size="icon" type="button">
                ➤
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
