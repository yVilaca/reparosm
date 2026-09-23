import { deleteRecord, getRecord, listRecords, saveRecord } from '@/lib/db';
import { normalizeUser, passwordHash, passwordProblem, verifyPassword } from '@/lib/security';

export { normalizeUser, passwordHash, passwordProblem, verifyPassword };
export type AccountData={username:string;name:string;role:'admin'|'merchant';status:'active'|'suspended'|'cancelled';passwordHash:string;mustChangePassword?:boolean;createdAt:string;plan?:string;dueDate?:string};
export const publicAccount=(account:any)=>{const {passwordHash:_,...safe}=account;return safe};

export async function ensureAdmin(){
  const id='account-admin',existing=await getRecord(id);
  if(existing?.data?.accessPolicy==='admin-managed-v2')return existing;
  const hash=process.env.ADMIN_PASSWORD_HASH;
  if(!hash?.startsWith('pbkdf2$'))throw new Error('Acesso administrativo não configurado.');
  // One-time migration requested by the owner; preserve all store records.
  await revokeSessions(id);
  return saveRecord(id,'account',{...existing?.data,username:'adminreparosm',name:existing?.data?.name||'Administrador',role:'admin',status:'active',passwordHash:hash,mustChangePassword:false,createdAt:existing?.data?.createdAt||new Date().toISOString(),plan:'Administrador',accessPolicy:'admin-managed-v2'});
}

export async function accountByUsername(username:string){
  const administrator=await getRecord('account-admin');
  if(administrator?.data?.username===username)return administrator;
  if(username==='admin'||username==='adminreparosm')return null;
  return getRecord(`account-${username}`);
}

const cookie=(request:Request,name:string)=>request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1);
export async function currentSession(request:Request){
  const token=cookie(request,'reparosm_session');if(!token)return null;
  const session=await getRecord(`session-${token}`),expires=Date.parse(String(session?.data?.expiresAt||''));
  if(!session||session.type!=='session'||!Number.isFinite(expires)||expires<=Date.now()){if(session)await deleteRecord(session.id);return null;}
  return {token,record:session};
}
export async function currentAccount(request:Request){
  await ensureAdmin();const session=await currentSession(request);if(!session)return null;
  const account=await getRecord(String(session.record.data.accountId||''));
  if(!account||account.type!=='account'||account.data.status!=='active')return null;
  return {id:account.id,...account.data};
}
export async function revokeSessions(accountId:string){for(const record of await listRecords('session'))if(record.data?.accountId===accountId)await deleteRecord(record.id);}
export function sameOrigin(request:Request){const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');if(site&&site!=='same-origin'&&site!=='same-site'&&site!=='none')return false;if(!origin)return true;return origin===new URL(request.url).origin;}
export const sessionCookie=(token:string,maxAge=60*60*12,secure=false)=>`reparosm_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;
