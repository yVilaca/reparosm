# Carrinho de venda rápida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar uma única venda rápida com vários itens, estoque transacional e comprovante detalhado.

**Architecture:** `cash_entries` permanece como cabeçalho financeiro. Uma nova tabela de linhas associa cada item à venda; o repositório cria e desfaz as linhas na mesma transação. A tela mantém um carrinho local e envia as linhas ao endpoint.

**Tech Stack:** Next.js, React, TypeScript, PostgreSQL, node:test.

**Spec:** `docs/superpowers/specs/2026-10-30-quick-sale-cart-design.md`

## Global Constraints

- Não adicionar dependências.
- Compatibilidade com payloads e vendas antigas de item único.
- Todas as mudanças de estoque da venda devem estar na mesma transação.

## Review Focus

- Linhas com o mesmo produto: a interface consolida a quantidade e a API não baixa estoque parcialmente.
- Estoque insuficiente em qualquer linha: a venda inteira é revertida.
- Desfazer venda múltipla: restaura cada quantidade exata.
- Vendas antigas: continuam listáveis, imprimíveis e reversíveis.
- Total e desconto: são a soma exata das linhas em centavos.

### Task 1: Linhas e persistência da venda

**Files:**
- Create: `netlify/database/migrations/0032_quick_sale_items.sql`
- Modify: `lib/repos/quick-sales.ts`
- Modify: `app/api/quick-sales/route.ts`
- Test: `tests/quick-sales-flow.test.mjs`

- [ ] Escrever testes de integração para criação e desfazimento de uma venda com dois itens.
- [ ] Verificar que os testes falham antes da implementação.
- [ ] Criar a tabela de linhas, validar `items`, persistir linhas e aplicar/restaurar estoque na transação.
- [ ] Verificar os testes focados e a suíte completa.

### Task 2: Carrinho e comprovante

**Files:**
- Modify: `lib/quick-sale.ts`
- Modify: `tests/quick-sale.test.mjs`
- Modify: `components/quick-sale-route.tsx`
- Modify: `components/sale-receipt.tsx`

- [ ] Escrever testes unitários para o total de linhas e consolidação de estoque.
- [ ] Verificar falha antes da implementação.
- [ ] Implementar helpers, carrinho acessível e comprovante de múltiplas linhas.
- [ ] Verificar testes, tipos, lint e build.
