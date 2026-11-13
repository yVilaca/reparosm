import QuickSaleRoute from '@/components/quick-sale-route';
import { frequentSales } from '@/lib/quick-sale';
import { clients } from '@/lib/repos';
import * as quickSales from '@/lib/repos/quick-sales';
import { parts } from '@/lib/repos/rest';
import { requireServerAccount } from '@/lib/server-auth';
import { todayInSaoPaulo } from '@/lib/warranty';

export default async function PaymentsPage() {
  const account = await requireServerAccount();
  const today = todayInSaoPaulo();
  const [sales, stock, people] = await Promise.all([
    quickSales.since(account.id, `${today.slice(0, 7)}-01`),
    parts.list(account.id),
    clients.list(account.id),
  ]);
  return (
    <QuickSaleRoute
      clients={people.map(({ id, data }) => ({
        id,
        name: data.name,
        ...(data.phone ? { phone: data.phone } : {}),
      }))}
      products={stock.map(({ id, data }) => ({
        id,
        name: data.name,
        ...(data.category ? { category: data.category } : {}),
        ...(data.sku ? { sku: data.sku } : {}),
        price: Number(data.price || 0),
        ...(data.cost ? { cost: Number(data.cost) } : {}),
        stock: Number(data.stock || 0),
      }))}
      // A sugestão usa o preço cheio (o que entrou mais o desconto dado). Vendas de
      // vários itens ficam de fora: a descrição delas é um resumo ("2 itens: …").
      suggestions={frequentSales(
        sales
          .filter((sale) => !/^\d+ itens: /.test(sale.description))
          .map((sale) => {
            const quantity = sale.quantity || 1;
            return {
              description: sale.description,
              value: (Math.round(((sale.value + sale.discount) / quantity) * 100) || 0) / 100,
              date: sale.date,
              ...(sale.cost === undefined
                ? {}
                : { cost: (Math.round((sale.cost / quantity) * 100) || 0) / 100 }),
            };
          }),
      )}
      todaySales={sales.filter((sale) => sale.date === today)}
    />
  );
}
