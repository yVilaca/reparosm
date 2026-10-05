import { plainText } from '@/lib/payable-schedule';

/**
 * Lê valores como se digita no Brasil: "25", "25,9", "1.234,56", "R$ 30".
 * Devolve NaN quando não é um valor em reais válido.
 */
export function parseMoney(text: string): number {
  const clean = text.replace(/R\$|\s/g, '');
  if (!clean) return Number.NaN;
  let normalized: string;
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.');
  // Sem vírgula, ponto seguido de três dígitos é separador de milhar ("1.234").
  else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) normalized = clean.replace(/\./g, '');
  else normalized = clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100) / 100;
}

/** Troco do pagamento em dinheiro, ou quanto ainda falta. */
export function cashChange(total: number, given: number) {
  if (!Number.isFinite(total) || !Number.isFinite(given)) return null;
  const cents = Math.round(given * 100) - Math.round(total * 100);
  return cents >= 0
    ? { kind: 'change' as const, amount: cents / 100 }
    : { kind: 'short' as const, amount: -cents / 100 };
}

/** Notas que o cliente provavelmente vai entregar: próxima dezena, cinquenta e cem. */
export function billSuggestions(total: number): number[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  const above = (step: number) => {
    const rounded = Math.ceil(total / step) * step;
    return rounded > total ? rounded : rounded + step;
  };
  return [...new Set([10, 50, 100].map(above))].sort((a, b) => a - b).slice(0, 3);
}

type Sold = { description: string; value: number; date: string; cost?: number };

/**
 * Os itens vendidos com mais frequência (mesma descrição e mesmo valor), para
 * preencher a venda com um toque. Empate: o vendido mais recentemente primeiro.
 */
export function frequentSales(sales: Sold[], limit = 6) {
  const groups = new Map<
    string,
    { description: string; value: number; count: number; last: string; cost?: number }
  >();
  for (const sale of sales) {
    const description = sale.description.trim();
    if (!description || !(sale.value > 0)) continue;
    const key = `${description.toLocaleLowerCase('pt-BR')}|${sale.value}`;
    const group = groups.get(key);
    if (!group)
      groups.set(key, {
        description,
        value: sale.value,
        count: 1,
        last: sale.date,
        cost: sale.cost,
      });
    else {
      group.count += 1;
      if (sale.date >= group.last) {
        group.last = sale.date;
        group.description = description;
        // O custo mais recente vale para a próxima venda.
        if (sale.cost !== undefined) group.cost = sale.cost;
      }
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map(({ description, value, cost }) => ({
      description,
      value,
      ...(cost === undefined ? {} : { cost }),
    }));
}

/** Produto do estoque oferecido na busca da venda rápida. */
export type ProductOption = {
  id: string;
  name: string;
  category?: string;
  sku?: string;
  price: number;
  cost?: number;
  stock: number;
};

/**
 * Produtos que combinam com o que está sendo digitado (todas as palavras, em
 * nome, categoria ou código, sem diferenciar acentos). Primeiro os que começam
 * com o texto, depois os que têm estoque.
 */
export function matchProducts<P extends ProductOption>(products: P[], query: string, limit = 8) {
  const wanted = plainText(query.trim());
  if (!wanted) return [];
  const words = wanted.split(/\s+/);
  return products
    .map((product) => ({
      product,
      name: plainText(product.name),
      text: plainText(`${product.name} ${product.category || ''} ${product.sku || ''}`),
    }))
    .filter(({ text }) => words.every((word) => text.includes(word)))
    .sort(
      (a, b) =>
        Number(b.name.startsWith(wanted)) - Number(a.name.startsWith(wanted)) ||
        Number(b.product.stock > 0) - Number(a.product.stock > 0) ||
        a.product.name.localeCompare(b.product.name, 'pt-BR'),
    )
    .slice(0, limit)
    .map(({ product }) => product);
}

/** Desconto em reais ("5", "5,50") ou em percentual do preço ("10%"). Vazio é zero. */
export function parseDiscount(text: string, price: number): number {
  const typed = text.trim();
  if (!typed) return 0;
  if (!typed.endsWith('%')) return parseMoney(typed);
  const percent = parseMoney(typed.slice(0, -1));
  if (!(percent >= 0) || percent > 100 || !Number.isFinite(price)) return Number.NaN;
  return Math.round(price * percent) / 100;
}

/** Resultado líquido da venda: valor recebido menos o custo conhecido. */
export function saleProfit(received: number, cost?: number) {
  if (!Number.isFinite(received) || cost === undefined || !Number.isFinite(cost)) return null;
  return (Math.round(received * 100) - Math.round(cost * 100)) / 100;
}

/** Valor líquido usado no botão e no resumo; sem custo, é o valor recebido. */
export function saleResultTotal(received: number, profit: number | null) {
  return profit ?? received;
}

/** Quanto receber (preço menos desconto) e, com o custo, o lucro e a margem em %. */
export function saleTotals(price: number, discount: number, cost?: number) {
  const received = Math.round(price * 100) - Math.round((discount || 0) * 100);
  const total = received / 100;
  const profit = saleProfit(total, cost);
  if (profit === null) return { total, profit: null, margin: null };
  return {
    total,
    profit,
    margin: total > 0 ? Math.round((profit / total) * 1000) / 10 : null,
  };
}
