import { currentAccount } from '@/lib/auth';
import { resourceRoute } from '@/lib/resource-route';

const base = resourceRoute('expense');

// A saída de uma conta paga nasce em Contas a pagar e só se corrige por lá:
// editá-la ou apagá-la aqui deixaria a conta "paga" sem saída correspondente.
const fromPayable = (id: unknown) => typeof id === 'string' && id.startsWith('cash-payable-');
const linked = () =>
  Response.json(
    {
      error:
        'Esta saída veio do pagamento de uma conta. Para corrigir, desfaça o pagamento em Receber e pagar.',
    },
    { status: 409 },
  );

export const { GET } = base;

export async function POST(request: Request) {
  const body = (await request
    .clone()
    .json()
    .catch(() => null)) as { id?: unknown } | null;
  if (fromPayable(body?.id) && (await currentAccount(request))) return linked();
  return base.POST(request);
}

export async function DELETE(request: Request) {
  if (fromPayable(new URL(request.url).searchParams.get('id')) && (await currentAccount(request)))
    return linked();
  return base.DELETE(request);
}
