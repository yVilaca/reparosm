const encoder=new TextEncoder();
const hex=(bytes:ArrayBuffer|Uint8Array)=>Array.from(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=(value:string)=>new Uint8Array(value.match(/.{1,2}/g)?.map(x=>parseInt(x,16))||[]);

export const normalizeUser=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'');

export function passwordProblem(password:string){
  if(password.length<10)return 'A senha precisa ter pelo menos 10 caracteres.';
  if(!/[A-Za-zÀ-ÿ]/.test(password)||!/[0-9]/.test(password))return 'Use letras e números na senha.';
  if(/^(.)\1+$/.test(password)||['admin12345','1234567890','senha12345','password123'].includes(password.toLowerCase()))return 'Escolha uma senha menos previsível.';
  return '';
}

export async function legacyPasswordHash(username:string,password:string){
  return hex(await crypto.subtle.digest('SHA-256',encoder.encode(`${normalizeUser(username)}:${password}:reparosm-auth-v1`)));
}

export async function passwordHash(_username:string,password:string){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iterations=100000;
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const derived=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
  return `pbkdf2$${iterations}$${hex(salt)}$${hex(derived)}`;
}

function safeEqual(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}

export async function verifyPassword(username:string,password:string,stored:string){
  if(stored.startsWith('pbkdf2$')){
    const [,count,saltHex,hashHex]=stored.split('$'),iterations=Number(count);
    if(!iterations||!saltHex||!hashHex)return {valid:false,legacy:false};
    const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
    const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:fromHex(saltHex),iterations},key,256));
    return {valid:safeEqual(derived,fromHex(hashHex)),legacy:false};
  }
  const candidate=fromHex(await legacyPasswordHash(username,password));
  return {valid:safeEqual(candidate,fromHex(stored)),legacy:true};
}
