'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function PublicQuote(){
  const {id}=useParams<{id:string}>(),[record,setRecord]=useState<any>(null),[done,setDone]=useState(''),[loading,setLoading]=useState(true),[deciding,setDeciding]=useState(false);
  useEffect(()=>{fetch(`/api/public/quote?id=${encodeURIComponent(id)}`).then(r=>r.json()).then(x=>setRecord(x.record)).finally(()=>setLoading(false))},[id]);
  if(loading)return <main className="public-page"><div className="public-card">Carregando orçamento...</div></main>;
  if(!record)return <main className="public-page"><div className="public-card"><h1>Orçamento não encontrado</h1><p>Verifique se o link recebido está completo.</p></div></main>;
  const q=record.data;
  const decide=async(status:string)=>{if(deciding)return;setDeciding(true);const response=await fetch('/api/public/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:record.id,status})});const result=await response.json();if(response.ok){setDone(status);setRecord({...record,data:{...q,status,orderId:result.orderId}})}else alert(result.error||'Não foi possível registrar a resposta.');setDeciding(false)};
  const answered=done||q.status==='Aprovado'||q.status==='Recusado';
  return <main className="public-page"><article className="public-card quote-public"><header><b>ReparoSM</b><span>Orçamento {q.code}</span></header><div className="quote-status"><span>ORÇAMENTO PARA</span><h1>{q.customer}</h1><p>{q.device}</p></div>{q.problem&&<section><small>PROBLEMA RELATADO</small><p>{q.problem}</p></section>}<section><small>SERVIÇO PROPOSTO</small><p>{q.service}</p></section>{q.notes&&<section className="quote-notes"><small>OBSERVAÇÕES</small><p>{q.notes}</p></section>}<div className="public-total"><small>Valor total</small><strong>{money(q.total)}</strong>{q.validUntil&&<span>Válido até {new Date(`${q.validUntil}T12:00:00`).toLocaleDateString('pt-BR')}</span>}</div>{answered?<div className="public-success">Resposta registrada: <b>{done||q.status}</b>{(done||q.status)==='Aprovado'&&<span>Sua ordem de serviço foi criada e a assistência já pode iniciar o atendimento.</span>}</div>:<><button disabled={deciding} onClick={()=>decide('Aprovado')}>{deciding?'Registrando...':'Aprovar orçamento'}</button><button disabled={deciding} className="outline" onClick={()=>decide('Recusado')}>Recusar orçamento</button></>}</article></main>
}
