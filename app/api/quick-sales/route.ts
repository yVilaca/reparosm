import { currentAccount, sameOrigin } from '@/lib/auth';
import { isPaymentMethod } from '@/lib/payment-methods';
import * as quickSales from '@/lib/repos/quick-sales';
import { todayInSaoPaulo } from '@/lib/warranty';

const MAX = 9_999_999_999.99;
const invalid = (error: string) => Response.json({ error }, { status: 400 });
const cents = (value: number) => Math.round(value * 100) / 100;
const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX;

/**
 * Registra uma venda de balcão: o caixa recebe o preço menos o desconto, na
 * data de hoje. O custo é opcional e serve para saber o lucro.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: 'Não autenticado' }, { status: 401 });
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!input || typeof input !== 'object') return invalid('Dados inválidos');

  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!description || description.length > 200)
    return invalid('Informe o que foi vendido (até 200 caracteres).');
  if (!isAmount(input.price) || input.price <= 0)
    return invalid('Informe um preço maior que zero.');
  const discount = input.discount ?? 0;
  if (!isAmount(discount)) return invalid('Desconto inválido.');
  if (cents(discount) >= cents(input.price))
    return invalid('O desconto precisa ser menor que o preço.');
  const cost = input.cost ?? undefined;
  if (cost !== undefined && !isAmount(cost)) return invalid('Custo inválido.');
  const partId = input.partId;
  if (partId !== undefined && (typeof partId !== 'string' || !partId.trim()))
    return invalid('Produto inválido.');
  if (!isPaymentMethod(input.method)) return invalid('Escolha a forma de pagamento.');

  try {
    const sale = await quickSales.create(
      account.id,
      {
        description,
        price: cents(input.price),
        discount: cents(discount),
        cost: cost === undefined ? undefined : cents(cost),
        partId: typeof partId === 'string' ? partId : undefined,
        method: input.method,
      },
      todayInSaoPaulo(),
    );
    return Response.json({ sale }, { status: 201 });
  } catch (error) {
    if (error instanceof quickSales.QuickSaleError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
