import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const worker=fileURLToPath(new URL('../dist/worker.js',import.meta.url));
test('real SDK worker accepts distinct company config replay and shuts down cleanly',async()=>{
 const child=spawn(process.execPath,[worker],{stdio:['pipe','pipe','pipe']});
 let stdout='';let stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
 let id=0;
 async function rpc(method,params){
  const requestId=++id;const marker=`"id":${requestId}`;
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})+'\n');
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
   const lines=stdout.split('\n');const line=lines.find(s=>s.includes(marker));
   if(line){stdout=lines.filter(s=>s!==line).join('\n');return JSON.parse(line);}
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error(`RPC ${method} timed out; stderr=${stderr}; stdout=${stdout}`);
 }
 const cfg=(companyId,secretId)=>({enabled:true,baseUrl:'https://forgejo.example',webhookSecret:{type:'secret_ref',secretId:'22222222-2222-4222-8222-222222222222'},repositories:[{name:'acme/app',companyId,agentId:'agent-1',forgejoUsername:'bot',allowedOperations:['list_issues'],readSecret:{type:'secret_ref',secretId}}]});
 try{
  const init=await rpc('initialize',{manifest:{},config:cfg('company-a','11111111-1111-4111-8111-111111111111')});
  assert.ifError(init.error);assert.ok(init.result?.supportedMethods?.includes('configChanged'));
  const a=await rpc('configChanged',{companyId:'company-a',config:cfg('company-a','11111111-1111-4111-8111-111111111111')});assert.ifError(a.error);
  const b=await rpc('configChanged',{companyId:'company-b',config:cfg('company-b','33333333-3333-4333-8333-333333333333')});assert.ifError(b.error);
  const stop=await rpc('shutdown',{});assert.ifError(stop.error);
  const [code]=await once(child,'exit');assert.equal(code,0,stderr);
 }finally{if(child.exitCode===null)child.kill('SIGKILL');}
});