'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Shop } from '@/lib/types';

type ShopRow = Shop & { id: string };
const tabs = ['Perfil', 'Horários', 'Equipe', 'Fiscal', 'Documentos'];

export default function MyShopRoute({ initialShop }: { initialShop?: ShopRow }) {
  const { notify } = useFeedback();
  const [shop, setShop] = useState<ShopRow | undefined>(initialShop);
  const [tab, setTab] = useState('Perfil');
  const [warranty, setWarranty] = useState(shop?.warranty || '90 dias');
  const [taxRegime, setTaxRegime] = useState(shop?.taxRegime || 'MEI');
  const saveShop = async (data: Shop, id = 'shop-main') => {
    try {
      const response = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, id }),
      });
      const result = (await response.json()) as {
        error?: string;
        record?: { id: string; data: Shop };
      };
      if (!response.ok || !result.record)
        throw new Error(result.error || 'Não foi possível salvar a assistência.');
      setShop({ id: result.record.id, ...result.record.data });
      notify('Dados da assistência salvos.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar a assistência.',
        'error',
      );
      throw error;
    }
  };
  return (
    <>
      <PageHeader
        title="Minha assistência"
        description="Dados úteis da assistência organizados em um só lugar."
        action={
          <Button asChild variant="outline">
            <Link href="/">Painel completo</Link>
          </Button>
        }
      />
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
            RS
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Minha assistência
            </p>
            <h2 className="text-lg font-semibold">{shop?.name || 'Configure sua empresa'}</h2>
            <p className="text-sm text-muted-foreground">
              {shop?.phone || 'Adicione os dados que aparecerão nos documentos e links.'}
            </p>
          </div>
          <Badge variant={shop?.name ? 'success' : 'outline'}>
            {shop?.name ? 'Perfil completo' : 'Configuração pendente'}
          </Badge>
        </CardContent>
      </Card>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Button
            key={item}
            onClick={() => setTab(item)}
            size="sm"
            variant={tab === item ? 'default' : 'outline'}
          >
            {item}
          </Button>
        ))}
      </div>
      <Card className="mb-4">
        <form
          className="grid gap-6 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const formData = Object.fromEntries(form);
            void saveShop(
              {
                ...shop,
                ...formData,
                warranty,
                taxRegime,
                ...(tab === 'Documentos'
                  ? { showLaborOnPrint: form.get('showLaborOnPrint') === 'on' }
                  : {}),
              } as Shop,
              shop?.id || 'shop-main',
            );
          }}
        >
          <fieldset
            className="m-0 grid min-w-0 gap-6 border-0 p-0"
            disabled={tab !== 'Perfil'}
            hidden={tab !== 'Perfil'}
          >
            <>
              <div>
                <h3 className="font-semibold">Identidade e contato</h3>
                <p className="text-sm text-muted-foreground">
                  Dados exibidos na vitrine, ordens, orçamentos e comprovantes.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-name">Nome comercial *</Label>
                <Input defaultValue={shop?.name || ''} id="shop-name" name="name" required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="shop-legal-name">Razão social</Label>
                  <Input
                    defaultValue={shop?.legalName || ''}
                    id="shop-legal-name"
                    name="legalName"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-document">CPF / CNPJ</Label>
                  <Input defaultValue={shop?.document || ''} id="shop-document" name="document" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="shop-phone">WhatsApp *</Label>
                  <Input defaultValue={shop?.phone || ''} id="shop-phone" name="phone" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-email">E-mail</Label>
                  <Input
                    defaultValue={shop?.email || ''}
                    id="shop-email"
                    name="email"
                    type="email"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-address">Endereço completo</Label>
                <Input defaultValue={shop?.address || ''} id="shop-address" name="address" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="shop-instagram">Instagram</Label>
                  <Input
                    defaultValue={shop?.instagram || ''}
                    id="shop-instagram"
                    name="instagram"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-website">Site</Label>
                  <Input defaultValue={shop?.website || ''} id="shop-website" name="website" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-logo">Logo da loja (URL)</Label>
                <Input
                  defaultValue={shop?.logo || ''}
                  id="shop-logo"
                  name="logo"
                  placeholder="https://exemplo.com/logo.png"
                  type="url"
                />
                <p className="text-xs text-muted-foreground">
                  A imagem será exibida no cabeçalho da OS impressa.
                </p>
              </div>
            </>
          </fieldset>
          <fieldset
            className="m-0 grid min-w-0 gap-6 border-0 p-0"
            disabled={tab !== 'Horários'}
            hidden={tab !== 'Horários'}
          >
            <>
              <div>
                <h3 className="font-semibold">Atendimento e prazos</h3>
                <p className="text-sm text-muted-foreground">
                  Defina quando sua loja funciona e os padrões de entrega.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-hours">Horário de funcionamento</Label>
                <Input
                  defaultValue={shop?.hours || ''}
                  id="shop-hours"
                  name="hours"
                  placeholder="Seg a Sáb · 08h às 18h"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="shop-diagnosis-time">Prazo padrão de diagnóstico</Label>
                  <Input
                    defaultValue={shop?.diagnosisTime || '24 horas'}
                    id="shop-diagnosis-time"
                    name="diagnosisTime"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-warranty">Garantia padrão</Label>
                  <Select onValueChange={setWarranty} value={warranty}>
                    <SelectTrigger className="w-full" id="shop-warranty">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30 dias">30 dias</SelectItem>
                      <SelectItem value="90 dias">90 dias</SelectItem>
                      <SelectItem value="180 dias">180 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          </fieldset>
          <fieldset
            className="m-0 grid min-w-0 gap-6 border-0 p-0"
            disabled={tab !== 'Equipe'}
            hidden={tab !== 'Equipe'}
          >
            <>
              <div>
                <h3 className="font-semibold">Equipe técnica</h3>
                <p className="text-sm text-muted-foreground">
                  Configure responsáveis e contatos internos.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-technician">Técnico principal</Label>
                <Input
                  defaultValue={shop?.technician || ''}
                  id="shop-technician"
                  name="technician"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-financial">Responsável financeiro</Label>
                <Input defaultValue={shop?.financial || ''} id="shop-financial" name="financial" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-internal-phone">Contato interno</Label>
                <Input
                  defaultValue={shop?.internalPhone || ''}
                  id="shop-internal-phone"
                  name="internalPhone"
                />
              </div>
            </>
          </fieldset>
          <fieldset
            className="m-0 grid min-w-0 gap-6 border-0 p-0"
            disabled={tab !== 'Fiscal'}
            hidden={tab !== 'Fiscal'}
          >
            <>
              <div>
                <h3 className="font-semibold">Dados fiscais</h3>
                <p className="text-sm text-muted-foreground">
                  Informações para notas e comprovantes.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="shop-state-registration">Inscrição estadual</Label>
                  <Input
                    defaultValue={shop?.stateRegistration || ''}
                    id="shop-state-registration"
                    name="stateRegistration"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-city-registration">Inscrição municipal</Label>
                  <Input
                    defaultValue={shop?.cityRegistration || ''}
                    id="shop-city-registration"
                    name="cityRegistration"
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:max-w-xs">
                <Label htmlFor="shop-tax-regime">Regime tributário</Label>
                <Select onValueChange={setTaxRegime} value={taxRegime}>
                  <SelectTrigger className="w-full" id="shop-tax-regime">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEI">MEI</SelectItem>
                    <SelectItem value="Simples Nacional">Simples Nacional</SelectItem>
                    <SelectItem value="Lucro Presumido">Lucro Presumido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          </fieldset>
          <fieldset
            className="m-0 grid min-w-0 gap-6 border-0 p-0"
            disabled={tab !== 'Documentos'}
            hidden={tab !== 'Documentos'}
          >
            <>
              <div>
                <h3 className="font-semibold">Textos dos documentos</h3>
                <p className="text-sm text-muted-foreground">
                  Personalize garantia, rodapé e avaliações.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-terms">Termos de garantia</Label>
                <Textarea defaultValue={shop?.terms || ''} id="shop-terms" name="terms" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-footer">Rodapé dos comprovantes</Label>
                <Textarea defaultValue={shop?.footer || ''} id="shop-footer" name="footer" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shop-google">Link para avaliação no Google</Label>
                <Input defaultValue={shop?.google || ''} id="shop-google" name="google" />
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Input
                  defaultChecked={shop?.showLaborOnPrint !== false}
                  className="mt-1 size-4 shrink-0"
                  id="shop-show-labor-on-print"
                  name="showLaborOnPrint"
                  type="checkbox"
                />
                <div className="grid gap-1">
                  <Label htmlFor="shop-show-labor-on-print">
                    Exibir mão de obra na OS impressa
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Desative para mostrar apenas peças e total ao cliente. O cálculo da OS permanece
                    inalterado.
                  </p>
                </div>
              </div>
            </>
          </fieldset>
          <div className="flex justify-end border-t pt-4">
            <Button type="submit">Salvar alterações</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
