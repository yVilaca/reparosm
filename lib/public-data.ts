// Explicit public fields: never serialize inventory costs, margins, credentials or internal notes.
const fields=(data:any,keys:string[])=>Object.fromEntries(keys.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
export function publicRecord(record:any){
  const keys:Record<string,string[]>={
    part:['name','category','price','stock','published','image'],
    shop:['name','phone','address','description','logo'],
    quote:['code','customer','device','problem','service','notes','total','validUntil','status'],
  };
  return {id:record.id,type:record.type,data:fields(record.data,keys[record.type]||[])};
}
export const businessTypes=['order','quote','part','shop','film','client','payment','expense','automation','message','tutorial'];
