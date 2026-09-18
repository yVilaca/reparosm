import { currentAccount } from '@/lib/auth';
import { filmCatalog } from '@/lib/film-catalog';
export async function POST(request:Request){
  if(!await currentAccount(request))return Response.json({error:'Não autenticado'},{status:401});
  return Response.json({ok:true,count:filmCatalog.length,message:'Catálogo compartilhado disponível para todas as contas.'});
}
