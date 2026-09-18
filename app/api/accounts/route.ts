import { currentAccount, normalizeUser, passwordHash, passwordProblem, publicAccount, revokeSessions, sameOrigin } from '@/lib/auth';
import { deleteRecord, getRecord, listRecords, saveRecord } from '@/lib/db';

const admin=async(request:Request)=>{const a=await currentAccount(request);return a?.role==='admin'?a:null};
const denied=()=>Response.json({error:'Acesso negado'},{status:403,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){if(!await admin(request))return denied();const accounts=(await listRecords('account')).map((a:any)=>publicAccount({id:a.id,...a.data}));const requests=(await listRecords('password-request')).filter((r:any)=>r.data.status==='pending').map((r:any)=>({id:r.id,...r.data}));return Response.json({accounts,requests},{headers:{'Cache-Control':'no-store'}})}

export async function POST(request:Request){
  if(!sameOrigin(request)||!await admin(request))return denied();let body:any;try{body=await request.json()}catch{return Response.json({error:'Dados inválidos'},{status:400})}
  if(body.action==='reset-password'){
    const account=await getRecord(String(body.id||''));if(!account||account.type!=='account'||account.id==='account-admin')return Response.json({error:'Conta não encontrada ou protegida'},{status:400});
    if(body.identityConfirmed!==true)return Response.json({error:'Confirme a identidade do lojista antes de redefinir.'},{status:400});
    const problem=passwordProblem(String(body.password||''));if(problem)return Response.json({error:problem},{status:400});
    await saveRecord(account.id,'account',{...account.data,passwordHash:await passwordHash(account.data.username,String(body.password)),mustChangePassword:false,passwordResetAt:new Date().toISOString()});await revokeSessions(account.id);const requestId=`password-request-${account.id}`,pending=await getRecord(requestId);if(pending)await saveRecord(requestId,'password-request',{...pending.data,status:'resolved',resolvedAt:new Date().toISOString()});return Response.json({ok:true});
  }
  const old=body.id?await getRecord(String(body.id)):null;
  if(old){
    if(old.type!=='account'||old.id==='account-admin')return Response.json({error:'Esta conta não pode ser alterada aqui'},{status:400});
    const status=['active','suspended','cancelled'].includes(body.status)?body.status:old.data.status,plan=['Mensal','Trimestral','Anual','Cortesia'].includes(body.plan)?body.plan:old.data.plan;
    const data={...old.data,name:String(body.name||old.data.name).trim().slice(0,80)||old.data.name,status,plan,dueDate:String(body.dueDate??old.data.dueDate??'').slice(0,10),updatedAt:new Date().toISOString()};
    await saveRecord(old.id,'account',data);if(status!=='active')await revokeSessions(old.id);return Response.json({account:publicAccount({id:old.id,...data})});
  }
  const username=normalizeUser(String(body.username||''));if(username.length<3)return Response.json({error:'Use um usuário com pelo menos 3 caracteres'},{status:400});
  if(['admin','adminreparosm'].includes(username)||await getRecord(`account-${username}`))return Response.json({error:'Este usuário já existe'},{status:409});
  const problem=passwordProblem(String(body.password||''));if(problem)return Response.json({error:problem},{status:400});
  const id=`account-${username}`,data={username,name:String(body.name||username).trim().slice(0,80),role:'merchant',status:'active',plan:['Mensal','Trimestral','Anual','Cortesia'].includes(body.plan)?body.plan:'Mensal',dueDate:String(body.dueDate||'').slice(0,10),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),passwordHash:await passwordHash(username,String(body.password)),mustChangePassword:false};
  await saveRecord(id,'account',data);return Response.json({account:publicAccount({id,...data})},{status:201});
}

export async function DELETE(request:Request){
  if(!sameOrigin(request)||!await admin(request))return denied();const id=new URL(request.url).searchParams.get('id');if(!id||id==='account-admin')return Response.json({error:'Esta conta não pode ser excluída'},{status:400});
  const account=await getRecord(id);if(!account||account.type!=='account')return Response.json({error:'Conta não encontrada'},{status:404});
  const records=await listRecords(),owned=records.filter((r:any)=>r.id!==id&&(r.data?._accountId===id||r.type==='session'&&r.data?.accountId===id));for(const record of owned)await deleteRecord(record.id);await deleteRecord(id);return Response.json({ok:true,removedRecords:owned.length});
}
