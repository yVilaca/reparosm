'use client';

import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  Banknote,
  CreditCard,
  FileText,
  History,
  Package,
  QrCode,
  Search,
  ShoppingBag,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { useFeedback } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import IconChip from '@/components/ui/icon-chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import PageHeader from '@/components/ui/page-header';
import RowMenu from '@/components/ui/row-menu';
import { toneText } from '@/components/ui/tone';
import { formatMoney } from '@/lib/format';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/payment-methods';
import {
  billSuggestions,
  cashChange,
  matchProducts,
  parseDiscount,
  parseMoney,
  parseQuantity,
  saleProfit,
  saleResultTotal,
  saleTotals,
  type ProductOption,
} from '@/lib/quick-sale';
import { stockTone } from '@/lib/status-tones';

export type QuickSale = {
  id: string;
  description: string;
  value: number;
  method: string;
  discount?: number;
  cost?: number;
  quantity?: number;
  partId?: string;
};
export type SaleSuggestion = { description: string; value: number; cost?: number };

const methodLook: Record<PaymentMethod, { icon: LucideIcon; label: string }> = {
  Pix: { icon: QrCode, label: 'Pix' },
  Dinheiro: { icon: Banknote, label: 'Dinheiro' },
  'Cartão de débito': { icon: CreditCard, label: 'Débito' },
  'Cartão de crédito': { icon: CreditCard, label: 'Crédito' },
  Boleto: { icon: FileText, label: 'Boleto' },
};
const iconFor = (method: string) => methodLook[method as PaymentMethod]?.icon || ArrowDownLeft;
/** 25.9 → "25,90", para mostrar no campo como se tivesse sido digitado. */
const typed = (value: number) => value.toFixed(2).replace('.', ',');
const stockLabel = (stock: number) => (stock <= 0 ? 'Sem estoque' : `${stock} em estoque`);

/** Ajusta o estado local quando o servidor manda dados novos (depois de router.refresh). */
function useServerState<T>(server: T) {
  const [value, setValue] = useState(server);
  const [seen, setSeen] = useState(server);
  if (seen !== server) {
    setSeen(server);
    setValue(server);
  }
  return [value, setValue] as const;
}

/**
 * Venda de balcão sem OS. O que foi vendido pode vir do estoque (preço e custo
 * preenchidos) ou ser digitado livremente. Entra no caixa de hoje.
 */
export default function QuickSaleRoute({
  products = [],
  todaySales = [],
  suggestions = [],
}: {
  products?: ProductOption[];
  todaySales?: QuickSale[];
  suggestions?: SaleSuggestion[];
}) {
  const router = useRouter();
  const { notify, confirm } = useFeedback();
  const descriptionRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [sales, setSales] = useServerState(todaySales);
  const [description, setDescription] = useState('');
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const [priceText, setPriceText] = useState('');
  const [quantityText, setQuantityText] = useState('1');
  const [discountText, setDiscountText] = useState('');
  const [costText, setCostText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Pix');
  const [given, setGiven] = useState('');
  const [saving, setSaving] = useState(false);

  const matches = useMemo(
    () => (product ? [] : matchProducts(products, description)),
    [products, description, product],
  );
  const listOpen = searching && matches.length > 0;

  const price = parseMoney(priceText);
  const quantity = parseQuantity(quantityText);
  const subtotal = Number.isFinite(price) && Number.isFinite(quantity) ? price * quantity : price;
  const discount = parseDiscount(discountText, subtotal);
  const cost = costText.trim() ? parseMoney(costText) : undefined;
  const discountError = !Number.isFinite(discount)
    ? 'Use um valor como 5,00 ou um percentual como 10%.'
    : subtotal > 0 && discount >= subtotal
      ? 'O desconto precisa ser menor que o preço.'
      : '';
  const costError = cost !== undefined && !Number.isFinite(cost) ? 'Custo inválido.' : '';
  const quantityError = !Number.isFinite(quantity)
    ? 'Informe uma quantidade inteira maior que zero.'
    : product && quantity > product.stock
      ? `Há apenas ${product.stock} ${product.stock === 1 ? 'unidade' : 'unidades'} em estoque.`
      : '';
  const { total, profit, margin } = saleTotals(price, discount, cost, quantity);
  const resultTotal = saleResultTotal(total, profit);
  const valid =
    Boolean(description.trim()) &&
    price > 0 &&
    !quantityError &&
    !discountError &&
    !costError &&
    total > 0;
  const change = method === 'Dinheiro' && given ? cashChange(resultTotal, parseMoney(given)) : null;

  const withCost = sales.filter((sale) => sale.cost !== undefined);
  const profitToday = withCost.reduce(
    (sum, sale) => sum + (saleProfit(sale.value, sale.cost) || 0),
    0,
  );

  const fill = (next: { description: string; value: number; cost?: number }) => {
    setDescription(next.description);
    setPriceText(typed(next.value));
    setQuantityText('1');
    setCostText(next.cost !== undefined ? typed(next.cost) : '');
    setSearching(false);
    setActive(-1);
    priceRef.current?.focus();
  };
  const choose = (option: ProductOption) => {
    setProduct(option);
    fill({ description: option.name, value: option.price, cost: option.cost });
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault();
      setSearching(true);
      setActive((current) => (current + 1) % matches.length);
    } else if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault();
      setActive((current) => (current <= 0 ? matches.length - 1 : current - 1));
    } else if (event.key === 'Escape') {
      setSearching(false);
      setActive(-1);
    } else if (event.key === 'Enter') {
      // Enter escolhe o produto destacado; sem destaque, segue com o texto digitado.
      event.preventDefault();
      if (listOpen && active >= 0) choose(matches[active]);
      else {
        setSearching(false);
        priceRef.current?.focus();
      }
    }
  };

  const reset = () => {
    setDescription('');
    setProduct(null);
    setPriceText('');
    setQuantityText('1');
    setDiscountText('');
    setCostText('');
    setGiven('');
    setActive(-1);
    descriptionRef.current?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!valid) {
      notify(
        quantityError ||
          discountError ||
          costError ||
          'Informe o que foi vendido e um preço maior que zero.',
        'error',
      );
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await fetch('/api/quick-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          price,
          discount,
          quantity,
          ...(cost === undefined ? {} : { cost }),
          ...(product ? { partId: product.id } : {}),
          method,
        }),
      });
      const result = (await response.json()) as { error?: string; sale?: QuickSale };
      if (!response.ok || !result.sale)
        throw new Error(result.error || 'Não foi possível registrar a venda.');
      setSales((current) => [result.sale!, ...current]);
      notify(`Venda de ${formatMoney(result.sale.value)} registrada.`, 'success');
      reset();
      router.refresh();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível registrar a venda.',
        'error',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const undo = async (sale: QuickSale) => {
    const quantity = sale.quantity || 1;
    if (
      !(await confirm(
        `Desfazer a venda "${sale.description}"${quantity > 1 ? ` (${quantity} unidades)` : ''} de ${formatMoney(sale.value)}? A entrada sai do caixa.`,
      ))
    )
      return;
    const response = await fetch(`/api/payments?id=${encodeURIComponent(sale.id)}`, {
      method: 'DELETE',
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      notify(result.error || 'Não foi possível desfazer a venda.', 'error');
      return;
    }
    setSales((current) => current.filter((item) => item.id !== sale.id));
    router.refresh();
    notify('Venda desfeita.', 'success');
  };

  return (
    <>
      <PageHeader
        title="Venda rápida"
        description="Receba o valor líquido; o custo serve para margem e não cria conta a pagar."
        action={
          <Button asChild variant="outline">
            <Link href="/pagamentos/historico">
              <History aria-hidden="true" />
              Histórico do caixa
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <form
          aria-label="Nova venda"
          className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6"
          onSubmit={submit}
        >
          <fieldset className="grid gap-6" disabled={saving}>
            <div className="grid gap-2">
              <Label htmlFor="sale-description">O que foi vendido?</Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-activedescendant={
                    listOpen && active >= 0 ? `sale-product-${matches[active].id}` : undefined
                  }
                  aria-autocomplete="list"
                  aria-controls="sale-products"
                  aria-expanded={listOpen}
                  autoComplete="off"
                  autoFocus
                  className="h-11 pl-9 text-base"
                  id="sale-description"
                  maxLength={200}
                  name="description"
                  onBlur={() => setSearching(false)}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    // Mudou o texto: deixa de ser o produto escolhido, mas mantém os valores.
                    setProduct(null);
                    setSearching(true);
                    setActive(-1);
                  }}
                  onFocus={() => setSearching(true)}
                  onKeyDown={onSearchKey}
                  placeholder="Busque no estoque ou digite livremente"
                  ref={descriptionRef}
                  required
                  role="combobox"
                  value={description}
                />
                {listOpen && (
                  <ul
                    aria-label="Produtos do estoque"
                    className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10"
                    id="sale-products"
                    role="listbox"
                  >
                    {matches.map((option, index) => (
                      <li
                        aria-selected={index === active}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 px-3 py-2',
                          index === active ? 'bg-muted' : 'hover:bg-muted/60',
                        )}
                        id={`sale-product-${option.id}`}
                        key={option.id}
                        onClick={() => choose(option)}
                        // Escolher sem tirar o foco do campo (o blur fecharia a lista antes).
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActive(index)}
                        role="option"
                      >
                        <IconChip icon={Package} size="sm" tone={stockTone(option.stock)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{option.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[option.category, stockLabel(option.stock)]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatMoney(option.price)}
                        </span>
                      </li>
                    ))}
                    <li
                      className="border-t px-3 py-2 text-xs text-muted-foreground"
                      role="presentation"
                    >
                      Não é nenhum desses? Siga digitando: a venda sai com o texto escrito.
                    </li>
                  </ul>
                )}
              </div>
              {product ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
                    <Package aria-hidden="true" className="size-3" />
                    Do estoque
                  </span>
                  {stockLabel(product.stock)} · preço e custo preenchidos para a margem
                  <button
                    className="inline-flex items-center gap-0.5 underline-offset-4 hover:underline"
                    onClick={() => {
                      setProduct(null);
                      descriptionRef.current?.focus();
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-3" />
                    Desvincular
                  </button>
                </p>
              ) : (
                !description &&
                suggestions.length > 0 && (
                  <div className="grid gap-1.5">
                    <p className="text-xs text-muted-foreground">Vendidos com frequência</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((suggestion) => (
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          key={`${suggestion.description}-${suggestion.value}`}
                          onClick={() => fill(suggestion)}
                          type="button"
                        >
                          {suggestion.description}
                          <span className="text-muted-foreground tabular-nums">
                            {formatMoney(suggestion.value)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sale-value">Preço</Label>
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl font-medium text-muted-foreground"
                  >
                    R$
                  </span>
                  <Input
                    aria-invalid={priceText !== '' && !(price > 0)}
                    autoComplete="off"
                    className="h-16 pl-14 text-3xl font-semibold tabular-nums md:text-3xl"
                    id="sale-value"
                    inputMode="decimal"
                    name="price"
                    onChange={(event) => setPriceText(event.target.value)}
                    placeholder="0,00"
                    ref={priceRef}
                    required
                    value={priceText}
                  />
                </div>
                {priceText !== '' && !(price > 0) && (
                  <p className="text-xs text-destructive">Digite um valor como 25 ou 25,90.</p>
                )}
              </div>
              <div className="grid gap-2 sm:max-w-40">
                <Label htmlFor="sale-quantity">Quantidade</Label>
                <Input
                  aria-invalid={Boolean(quantityError)}
                  autoComplete="off"
                  id="sale-quantity"
                  inputMode="numeric"
                  max={product?.stock}
                  min={1}
                  name="quantity"
                  onChange={(event) => setQuantityText(event.target.value)}
                  step={1}
                  type="number"
                  value={quantityText}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="sale-discount">Desconto</Label>
                  <Input
                    aria-invalid={Boolean(discountError)}
                    autoComplete="off"
                    id="sale-discount"
                    inputMode="decimal"
                    name="discount"
                    onChange={(event) => setDiscountText(event.target.value)}
                    placeholder="R$ ou %"
                    value={discountText}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sale-cost">
                    Custo para margem{' '}
                    <span className="font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    aria-invalid={Boolean(costError)}
                    autoComplete="off"
                    id="sale-cost"
                    inputMode="decimal"
                    name="cost"
                    onChange={(event) => setCostText(event.target.value)}
                    placeholder="0,00"
                    value={costText}
                  />
                </div>
              </div>
              <p className="-mt-1 text-xs text-muted-foreground">
                Este custo não gera conta a pagar. Registre uma compra separadamente se houve uma
                saída real para fornecedor.
              </p>
              {(quantityError || discountError || costError) && (
                <p className="-mt-2 text-xs text-destructive">
                  {quantityError || discountError || costError}
                </p>
              )}
              {price > 0 &&
                !quantityError &&
                !discountError &&
                !costError &&
                (quantity > 1 || discount > 0 || profit !== null) && (
                  <div className="grid gap-1.5 rounded-lg bg-muted/40 p-3 text-sm">
                    <dl className="grid gap-1.5">
                      {quantity > 1 && (
                        <>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Preço unitário</dt>
                            <dd className="tabular-nums">{formatMoney(price)}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Quantidade</dt>
                            <dd className="tabular-nums">{quantity}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Subtotal</dt>
                            <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
                          </div>
                        </>
                      )}
                      {discount > 0 && (
                        <>
                          {quantity === 1 && (
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">Preço</dt>
                              <dd className="tabular-nums">{formatMoney(price)}</dd>
                            </div>
                          )}
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Desconto</dt>
                            <dd className="tabular-nums">−{formatMoney(discount)}</dd>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between gap-3 font-semibold">
                        <dt>Total líquido</dt>
                        <dd className="tabular-nums">{formatMoney(resultTotal)}</dd>
                      </div>
                      {profit !== null && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Lucro</dt>
                          <dd
                            className={cn(
                              'font-medium tabular-nums',
                              profit >= 0 ? toneText.success : toneText.danger,
                            )}
                          >
                            {formatMoney(profit)}
                            {margin !== null && (
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                ({margin.toLocaleString('pt-BR')}%)
                              </span>
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Forma de pagamento</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {PAYMENT_METHODS.map((item) => {
                  const look = methodLook[item];
                  const Icon = look.icon;
                  return (
                    <label
                      className={cn(
                        'flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-3 text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                        method === item
                          ? 'border-foreground bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                      )}
                      key={item}
                    >
                      <input
                        checked={method === item}
                        className="sr-only"
                        name="method"
                        onChange={() => setMethod(item)}
                        type="radio"
                        value={item}
                      />
                      <Icon aria-hidden="true" className="size-5" />
                      {look.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {method === 'Dinheiro' && (
              <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[12rem_1fr] sm:items-end">
                <div className="grid gap-2">
                  <Label htmlFor="sale-given">Recebi do cliente</Label>
                  <Input
                    autoComplete="off"
                    id="sale-given"
                    inputMode="decimal"
                    onChange={(event) => setGiven(event.target.value)}
                    placeholder="0,00"
                    value={given}
                  />
                </div>
                <div className="grid gap-2">
                  {total > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {billSuggestions(resultTotal).map((bill) => (
                        <Button
                          key={bill}
                          onClick={() => setGiven(String(bill))}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {formatMoney(bill)}
                        </Button>
                      ))}
                    </div>
                  )}
                  <p aria-live="polite" className="text-sm">
                    {change?.kind === 'change' ? (
                      <>
                        Troco:{' '}
                        <strong className={cn('text-lg tabular-nums', toneText.success)}>
                          {formatMoney(change.amount)}
                        </strong>
                      </>
                    ) : change?.kind === 'short' ? (
                      <>
                        Faltam{' '}
                        <strong className={cn('text-lg tabular-nums', toneText.danger)}>
                          {formatMoney(change.amount)}
                        </strong>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Informe quanto o cliente entregou para ver o troco.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Button className="h-12 w-full text-base" disabled={saving} type="submit">
                {saving
                  ? 'Registrando…'
                  : valid
                    ? `Receber ${formatMoney(resultTotal)}`
                    : 'Receber'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Entra no caixa de hoje e em Receber e pagar, em “Pagos e recebidos”.
              </p>
            </div>
          </fieldset>
        </form>

        <aside aria-label="Vendas de hoje" className="grid gap-4">
          <div className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <IconChip icon={ShoppingBag} size="lg" tone="success" />
            <div>
              <p className="text-sm text-muted-foreground">Lucro hoje</p>
              <p className="text-2xl font-semibold tabular-nums">{formatMoney(profitToday)}</p>
              <p className="text-xs text-muted-foreground">
                {sales.length} {sales.length === 1 ? 'venda rápida' : 'vendas rápidas'}
                {withCost.length > 0 && (
                  <>
                    {' · '}
                    <span className={profitToday >= 0 ? toneText.success : toneText.danger}>
                      lucro {formatMoney(profitToday)}
                    </span>
                    {withCost.length < sales.length &&
                      ` (${sales.length - withCost.length} sem custo)`}
                  </>
                )}
              </p>
            </div>
          </div>
          {sales.length ? (
            <ListGroup count={sales.length} title="Vendas de hoje">
              {sales.map((sale) => {
                const quantity = sale.quantity || 1;
                return (
                  <ListRow
                    actions={
                      <RowMenu label={sale.description}>
                        <DropdownMenuItem onSelect={() => void undo(sale)}>
                          Desfazer venda
                        </DropdownMenuItem>
                      </RowMenu>
                    }
                    dense
                    details={[
                      methodLook[sale.method as PaymentMethod]?.label || sale.method,
                      quantity > 1 ? `${quantity} unidades` : null,
                      sale.discount ? `desconto ${formatMoney(sale.discount)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    key={sale.id}
                    leading={<IconChip icon={iconFor(sale.method)} tone="success" />}
                    note={
                      sale.cost !== undefined
                        ? `lucro ${formatMoney(saleProfit(sale.value, sale.cost) || 0)}`
                        : undefined
                    }
                    title={sale.description}
                    value={`+${formatMoney(saleProfit(sale.value, sale.cost) ?? sale.value)}`}
                    valueClassName={toneText.success}
                  />
                );
              })}
            </ListGroup>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              As vendas de hoje aparecem aqui, com a opção de desfazer um engano.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
