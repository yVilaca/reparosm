import { deleteRecord, getRecord, listRecords, saveRecord } from '@/lib/db';
import { currentAccount, sameOrigin } from '@/lib/auth';
import { publicRecord, businessTypes } from '@/lib/public-data';
import { filmCatalog } from '@/lib/film-catalog';
import { notifyOrder } from '@/lib/whatsapp';

export async function GET(request: Request) {
  const url=new URL(request.url),account=await currentAccount(request),isPublic=url.searchParams.get('public')==='1';
  const id = url.searchParams.get('id');
  if(id){const record=await getRecord(id);if(!account)return Response.json({error:'Não autenticado'},{status:401});const owner=record?.data?._accountId||'account-admin';return record&&businessTypes.includes(String(record.type))&&owner===account.id?Response.json({record}):Response.json({error:'Acesso negado'},{status:403})}
  const type = url.searchParams.get('type') || undefined;
  if(isPublic&&['part','shop'].includes(type||'')){
    const owner=url.searchParams.get('account'),shopAccount=owner?await getRecord(owner):null;
    if(!shopAccount||shopAccount.type!=='account'||shopAccount.data.status!=='active')return Response.json({error:'Vitrine indisponível',records:[]},{status:404});
    const records=(await listRecords(type)).filter((r:any)=>(r.data?._accountId||'account-admin')===owner&&(type!=='part'||r.data.published===true&&Number(r.data.stock)>0));
    return Response.json({records:records.map(publicRecord)});
  }
  if(!account)return Response.json({error:'Não autenticado'},{status:401});
  const records=(await listRecords(type)).filter((r:any)=>businessTypes.includes(String(r.type))&&!String(r.id).startsWith('film-default-')&&(r.data?._accountId||'account-admin')===account.id);
  return Response.json({records:[...records,...(!type||type==='film'?filmCatalog:[])]});
}

export async function POST(request: Request) {
  if(!sameOrigin(request))return Response.json({error:'Origem da solicitação inválida.'},{status:403});
  const account=await currentAccount(request);if(!account)return Response.json({error:'Não autenticado'},{status:401});
  const body = await request.json() as { id?: string; type?: string; data?: any };
  if (!body.type || !businessTypes.includes(body.type) || !body.data || typeof body.data!=='object' || Array.isArray(body.data)) return Response.json({ error: 'Dados inválidos' }, { status: 400 });
  if(body.id?.startsWith('film-default-'))return Response.json({error:'Catálogo compartilhado somente para leitura'},{status:403});
  const id = body.id || `${body.type}-${crypto.randomUUID()}`;
  if(!id.startsWith(body.type+'-'))return Response.json({error:'Identificador inválido para este cadastro'},{status:400});
  const existing=body.id?await getRecord(body.id):null;if(existing&&(!businessTypes.includes(String(existing.type))||existing.type!==body.type||(existing.data?._accountId||'account-admin')!==account.id))return Response.json({error:'Acesso negado'},{status:403});
  body.data={...body.data,_accountId:account.id};
  const record = await saveRecord(id, body.type, body.data);
  let client = null;
  if (body.type === 'order' && String(body.data?.customer || '').trim()) {
    const phone = String(body.data.phone || '').replace(/\D/g, '');
    const name = String(body.data.customer).trim();
    const clients = await listRecords('client');
    const existing = clients.filter((item:any)=>(item.data?._accountId||'account-admin')===account.id).find((item:any) => {
      const savedPhone = String(item.data?.phone || '').replace(/\D/g, '');
      return (phone.length >= 10 && savedPhone === phone) || String(item.data?.name || '').trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR');
    });
    const clientId = existing?.id || `client-${crypto.randomUUID()}`;
    const clientData = {
      ...(existing?.data || {}),
      name,
      phone: body.data.phone || existing?.data?.phone || '',
      status: body.data.status === 'Concluído' ? 'Concluído' : 'Em atendimento',
      lastOrderId: id,
      lastOrderCode: body.data.code,
      lastDevice: body.data.device,
      updatedAt: new Date().toISOString(),
      createdAt: existing?.data?.createdAt || new Date().toISOString(),
      automatic: existing?.data?.automatic ?? true,
      _accountId: account.id,
    };
    client = await saveRecord(clientId, 'client', clientData);
  }
  let notification=null;
  if(body.type==='order'&&(!existing||existing.data.stage!==body.data.stage)){
    try{notification=await notifyOrder(account.id,id,body.data,existing?'status':'created');}
    catch{notification={status:'failed',reason:'OS salva, mas não foi possível registrar a notificação.'};}
  }
  return Response.json({ record, client, notification }, { status: 201 });
}

export async function DELETE(request: Request) {
  if(!sameOrigin(request))return Response.json({error:'Origem da solicitação inválida.'},{status:403});
  const account=await currentAccount(request);if(!account)return Response.json({error:'Não autenticado'},{status:401});
  if (new URL(request.url).searchParams.get('all') === 'true') {
    return Response.json({error:'Limpeza total desativada em contas multiempresa'},{status:403});
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
  const record=await getRecord(id);if(!record||!businessTypes.includes(String(record.type))||id.startsWith('film-default-')||(record.data?._accountId||'account-admin')!==account.id)return Response.json({error:'Acesso negado'},{status:403});await deleteRecord(id);
  return Response.json({ ok: true });
}
