'use client';

import { useState, type ChangeEvent } from 'react';
import { useFeedback } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/page-header';
import IconChip from '@/components/ui/icon-chip';
import Segmented from '@/components/ui/segmented';
import { Clock, FileText, Receipt, Store, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SHOP_LOGO_UPLOAD_PATH } from '@/lib/shop-logo';
import type { Shop } from '@/lib/types';

type ShopRow = Shop & { id: string };
const tabs = ['Perfil', 'Horários', 'Equipe', 'Fiscal', 'Documentos'];
const tabIcons = {
  Perfil: Store,
  Horários: Clock,
  Equipe: Users,
  Fiscal: Receipt,
  Documentos: FileText,
};

export default function MyShopRoute({ initialShop }: { initialShop?: ShopRow }) {
  const { confirm, notify } = useFeedback();
  const [shop, setShop] = useState<ShopRow | undefined>(initialShop);
  const [tab, setTab] = useState('Perfil');
  const [warranty, setWarranty] = useState(shop?.warranty || '90 dias');
  const [taxRegime, setTaxRegime] = useState(shop?.taxRegime || 'MEI');
  const [uploadingLogo, setUploadingLogo] = useState(false);
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
  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/shops/logo', { method: 'POST', body: form });
      const result = (await response.json()) as { error?: string; logo?: string };
      if (!response.ok || result.logo !== SHOP_LOGO_UPLOAD_PATH)
        throw new Error(result.error || 'Não foi possível anexar a logo.');
      setShop((current) => ({
        ...(current || { id: 'shop-main', name: '', phone: '' }),
        logo: result.logo,
      }));
      notify('Logo anexada com segurança.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível anexar a logo.', 'error');
    } finally {
      event.currentTarget.value = '';
      setUploadingLogo(false);
    }
  };
  const removeLogo = async () => {
    if (!(await confirm('Remover a logo anexada desta assistência?'))) return;
    try {
      const response = await fetch('/api/shops/logo', { method: 'DELETE' });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível remover a logo.');
      setShop((current) => {
        if (!current) return current;
        const next = { ...current };
        delete next.logo;
        return next;
      });
      notify('Logo removida.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível remover a logo.', 'error');
    }
  };
  return (
    <>
      <PageHeader
        title="Minha assistência"
        description="Dados úteis da assistência organizados em um só lugar."
      />
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-4">
          <IconChip icon={Store} size="lg" tone="brand" />
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Minha assistência
            </p>
            <h2 className="text-lg font-semibold">{shop?.name || 'Configure sua empresa'}</h2>
            <p className="text-sm text-muted-foreground">
              {shop?.phone || 'Adicione os dados que aparecerão nos documentos e links.'}
            </p>
          </div>
          <Badge variant={shop?.name ? 'success' : 'warning'}>
            {shop?.name ? 'Perfil completo' : 'Configuração pendente'}
          </Badge>
        </CardContent>
      </Card>
      <Segmented
        className="mb-4"
        label="Seções da assistência"
        onChange={setTab}
        options={tabs.map((item) => ({
          value: item,
          label: item,
          icon: tabIcons[item as keyof typeof tabIcons],
        }))}
        value={tab}
      />
      <Card className="mb-4">
        <form
          className="grid gap-6 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const formData = Object.fromEntries(form);
            const submittedLogo = typeof formData.logo === 'string' ? formData.logo.trim() : '';
            void saveShop(
              {
                ...shop,
                ...Object.fromEntries(Object.entries(formData).filter(([key]) => key !== 'logo')),
                logo: shop?.logo === SHOP_LOGO_UPLOAD_PATH ? shop.logo : submittedLogo,
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
                <Label htmlFor="shop-logo">Logo da loja (URL opcional)</Label>
                <Input
                  defaultValue={shop?.logo?.startsWith('http') ? shop.logo : ''}
                  id="shop-logo"
                  name="logo"
                  placeholder="https://exemplo.com/logo.png"
                  type="url"
                />
                <p className="text-xs text-muted-foreground">
                  Links continuam disponíveis, mas o anexo abaixo é armazenado com validação de
                  conteúdo e isolamento por loja.
                </p>
                <div className="grid gap-2 rounded-lg border border-dashed p-3">
                  <Label htmlFor="shop-logo-file">Anexar arquivo de imagem</Label>
                  <Input
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploadingLogo}
                    id="shop-logo-file"
                    onChange={uploadLogo}
                    type="file"
                  />
                  <p className="text-xs text-muted-foreground">
                    PNG, JPEG ou WebP. Até 1 MB e 2048 × 2048 pixels. O arquivo é validado no
                    servidor.
                  </p>
                </div>
                {shop?.logo === SHOP_LOGO_UPLOAD_PATH && (
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- logo servida pelo endpoint autenticado */}
                    <img
                      alt={`Logo de ${shop.name || 'assistência técnica'}`}
                      className="size-14 rounded object-contain"
                      src={SHOP_LOGO_UPLOAD_PATH}
                    />
                    <div className="grid flex-1 gap-1">
                      <span className="text-sm font-medium">Logo anexada</span>
                      <span className="text-xs text-muted-foreground">
                        Ela será usada na impressão da OS.
                      </span>
                    </div>
                    <Button
                      onClick={() => void removeLogo()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Remover logo
                    </Button>
                  </div>
                )}
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
                <Label htmlFor="shop-customer-print-message">Mensagem da via do cliente</Label>
                <Textarea
                  defaultValue={shop?.customerPrintMessage || ''}
                  id="shop-customer-print-message"
                  name="customerPrintMessage"
                  maxLength={500}
                  placeholder="Ex.: Obrigado pela confiança! Guarde esta via para retirar seu aparelho."
                />
                <p className="text-xs text-muted-foreground">
                  Aparece no topo da segunda via da OS, abaixo da linha de recorte. Até 500
                  caracteres.
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
