import { currentAccount, sameOrigin } from '@/lib/auth';
import { isPaymentMethod } from '@/lib/payment-methods';
import * as quickSales from '@/lib/repos/quick-sales';
import { todayInSaoPaulo } from '@/lib/warranty';

const MAX = 9_999_999_999.99;
const MAX_QUANTITY = 9999;
const MAX_ITEMS = 50;
const invalid = (error: string) => Response.json({ error }, { status: 400 });
const cents = (value: number) => Math.round(value * 100) / 100;
const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX;

const saleItem = (input: Record<string, unknown>) => {
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!description || description.length > 200)
    return { error: 'Informe o que foi vendido (até 200 caracteres).' } as const;
  if (!isAmount(input.price) || input.price <= 0)
    return { error: 'Informe um preço maior que zero.' } as const;
  const quantity =
    typeof input.quantity === 'number'
      ? input.quantity
      : input.quantity === undefined
        ? 1
        : Number.NaN;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY)
    return { error: 'Quantidade inválida.' } as const;
  const discount = input.discount ?? 0;
  if (!isAmount(discount)) return { error: 'Desconto inválido.' } as const;
  if (discount >= input.price * quantity)
    return { error: 'O desconto precisa ser menor que o preço.' } as const;
  const cost = input.cost ?? undefined;
  if (cost !== undefined && !isAmount(cost)) return { error: 'Custo inválido.' } as const;
  const partId = input.partId;
  if (partId !== undefined && (typeof partId !== 'string' || !partId.trim()))
    return { error: 'Produto inválido.' } as const;
  return {
    item: {
      description,
      price: cents(input.price),
      discount: cents(discount),
      ...(cost === undefined ? {} : { cost: cents(cost) }),
      quantity,
      ...(typeof partId === 'string' ? { partId } : {}),
    },
  } as const;
};

/**
 * Registra uma venda de balcão: preço e custo são unitários; o caixa recebe o
 * preço vezes a quantidade, menos o desconto, na data de hoje.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!input || typeof input !== 'object') return invalid('Dados inválidos');

  const rawItems = input.items;
  if (
    rawItems !== undefined &&
    (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > MAX_ITEMS)
  )
    return invalid(`Informe entre 1 e ${MAX_ITEMS} itens.`);
  const parsed = (rawItems === undefined ? [input] : rawItems).map((value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? saleItem(value as Record<string, unknown>)
      : { error: 'Item inválido.' },
  );
  const invalidItem = parsed.find((result): result is { error: string } => 'error' in result);
  if (invalidItem) return invalid(invalidItem.error);
  const items = parsed.flatMap((result) => ('item' in result && result.item ? [result.item] : []));
  if (!isPaymentMethod(input.method)) return invalid('Escolha a forma de pagamento.');
  if (
    input.acknowledgeNegativeStock !== undefined &&
    typeof input.acknowledgeNegativeStock !== 'boolean'
  )
    return invalid('Confirmação de estoque inválida.');

  try {
    const sale = await quickSales.create(
      account.id,
      {
        items,
        method: input.method,
        acknowledgeNegativeStock: input.acknowledgeNegativeStock === true,
      },
      todayInSaoPaulo(),
    );
    return Response.json({ sale }, { status: 201 });
  } catch (error) {
    if (error instanceof quickSales.QuickSaleError)
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
}
