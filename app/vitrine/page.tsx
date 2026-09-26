import PublicStoreRoute from '@/components/public-store-route';
import { publicStoreTransaction } from '@/lib/db';
import { getAccount } from '@/lib/repos/accounts';
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
  const account = await getAccount(accountId);
  if (account?.status !== 'active')
    return (
      <PublicStoreRoute
        items={[]}
        shop={{ name: 'ReparoSM', phone: '' }}
        error="Esta vitrine está indisponível. Confira o link com a assistência."
      />
    );
  const [partRecords, shopRecords] = await publicStoreTransaction(accountId, (run) =>
    Promise.all([parts.list(accountId, run), shops.list(accountId, run)]),
  );
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
