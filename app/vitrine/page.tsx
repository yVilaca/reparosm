import PublicStoreRoute from '@/components/public-store-route';
import { publicStoreTransaction } from '@/lib/db';
import { getAccountStatus } from '@/lib/repos/accounts';
import { parts, shops } from '@/lib/repos';

export default async function VitrinePage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>;
}) {
  const accountId = (await searchParams).loja;
  if (!accountId)
    return (
      <PublicStoreRoute
        items={[]}
        shop={{ name: 'ReparoSM', phone: '' }}
        error="Link incompleto. Peça à assistência o link exclusivo da vitrine."
      />
    );
  const store = await publicStoreTransaction(accountId, async (run) => {
    const status = await getAccountStatus(accountId, run);
    if (status !== 'active') return null;
    const [partRecords, shopRecords] = await Promise.all([
      parts.list(accountId, run),
      shops.list(accountId, run),
    ]);
    return { partRecords, shopRecords };
  });
  if (!store)
    return (
      <PublicStoreRoute
        items={[]}
        shop={{ name: 'ReparoSM', phone: '' }}
        error="Esta vitrine está indisponível. Confira o link com a assistência."
      />
    );
  const { partRecords, shopRecords } = store;
  const shop = shopRecords[0]?.data;
  return (
    <PublicStoreRoute
      items={partRecords
        .filter((record) => record.data.published === true && Number(record.data.stock) > 0)
        .map(({ data }) => ({
          name: data.name,
          category: data.category,
          price: data.price,
          stock: data.stock,
          published: data.published,
          image: data.image,
        }))}
      shop={
        shop
          ? {
              name: shop.name,
              phone: shop.phone,
              address: shop.address,
              description: shop.description,
              logo: shop.logo,
            }
          : { name: 'ReparoSM', phone: '' }
      }
    />
  );
}
