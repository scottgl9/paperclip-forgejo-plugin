import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestHarness} from '@paperclipai/plugin-sdk/testing';
import plugin from '../dist/plugin.js';
import manifest from '../dist/manifest.js';
const ref=n=>({type:'secret_ref',secretId:`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`});
async function fixture(fn){
 const config={enabled:true,baseUrl:'https://forgejo.example',webhookSecret:ref('1'),repositories:[{name:'acme/app',companyId:'c',agentId:'a',forgejoUsername:'bot',allowedOperations:['create_issue'],readSecret:ref('2'),writeSecret:ref('3')}]};
 const h=createTestHarness({manifest,config});await plugin.definition.setup(h.ctx);h.ctx.config.get=async()=>config;h.ctx.secrets.resolve=async()=> 'fixture';
 const original=globalThis.fetch;let posts=0;let fail=false,mismatch=false;
 globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/user'))return Response.json({login:'bot'});if(init.method==='POST'){posts++;assert.deepEqual(JSON.parse(init.body),{title:'Test',body:'Body',closed:false});if(fail)throw Error('lost response');return Response.json({id:10,number:7});}assert.ok(String(url).endsWith('/issues/7'));return Response.json({id:mismatch?11:10,number:7,title:'Test',body:'Body',state:'open',repository:{full_name:'acme/app'},user:{login:'bot'}});};
 try{await fn({call:(p={},run={companyId:'c',agentId:'a'})=>h.executeTool('create_issue',{repository:'acme/app',title:'Test',body:'Body',operationId:'issue-create-001',...p},run),posts:()=>posts,fail:()=>fail=true,mismatch:()=>mismatch=true,config});}finally{globalThis.fetch=original;}
}
test('issue creation uses durable readback and rejects replay against changed effective identity',async()=>fixture(async f=>{assert.match((await f.call()).content??'',/Verified.*10/);assert.match((await f.call()).content??'',/Verified/);assert.equal(f.posts(),1);assert.match((await f.call({title:'Other'})).error??'',/different request/);f.config.baseUrl='https://other.example';assert.match((await f.call()).error??'',/different request/);}));
test('unknown issue creation outcome is never reposted',async()=>fixture(async f=>{f.fail();assert.match((await f.call()).error??'',/unknown/i);assert.match((await f.call()).error??'',/replay is disabled/i);assert.equal(f.posts(),1);}));
test('issue creation requires exact author fields ID and number readback',async()=>fixture(async f=>{f.mismatch();assert.match((await f.call()).error??'',/read-back did not match/);assert.match((await f.call()).error??'',/read-back did not match/);assert.equal(f.posts(),1);}));
test('issue creation denies another agent before external write',async()=>fixture(async f=>{assert.match((await f.call({},{companyId:'c',agentId:'other'})).error??'',/denied/i);assert.equal(f.posts(),0);}));
