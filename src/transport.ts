import { forgejoUrl } from './core.js';
type Fetcher=(input: string|URL|Request,init?:RequestInit)=>Promise<Response>;
export async function requestForgejo(baseUrl:string,path:string,token:string,method:'GET'|'POST',body?:unknown,fetcher:Fetcher=fetch):Promise<string>{
 const url=forgejoUrl(baseUrl,path);
 const response=await fetcher(url,{method,redirect:'error',headers:{Authorization:`token ${token}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 if(!response.ok) { await response.body?.cancel(); throw new Error(`upstream status ${response.status}`); }
 const reader=response.body?.getReader(); if(!reader)return '';
 const chunks:Uint8Array[]=[]; let total=0;
 try { while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>100000){await reader.cancel();throw new Error('response too large');}chunks.push(value);} }
 finally {reader.releaseLock();}
 return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
}
