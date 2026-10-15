import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from '@paperclipai/plugin-sdk/testing';
import plugin from '../dist/plugin.js';
import manifest from '../dist/manifest.js';

test('ambiguous comment timeout is persisted and cannot be automatically replayed',async()=>{
 const config={enabled:true,baseUrl:'https://forgejo.example',webhookSecret:{type:'secret_ref',secretId:'22222222-2222-4222-8222-222222222222'},repositories:[{name:'acme/app',companyId:'company-1',agentId:'agent-1',forgejoUsername:'paperclip-bot',allowedOperations:['post_comment'],readSecret:{type:'secret_ref',secretId:'11111111-1111-4111-8111-111111111111'},writeSecret:{type:'secret_ref',secretId:'55555555-5555-4555-8555-555555555555'}}]};
 const h=createTestHarness({manifest,config});await plugin.definition.setup(h.ctx);h.ctx.secrets.resolve=async()=> 'token';
 const original=globalThis.fetch;let posts=0;globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/api/v1/user'))return new Response(JSON.stringify({login:'paperclip-bot'}),{status:200});if(init.method==='POST'){posts++;throw new Error('simulated timeout');}return new Response('{}',{status:200});};
 try {const args={repository:'acme/app',number:5,body:'hello',operationId:'comment-intent-100'};const first=await h.executeTool('post_comment',args,{companyId:'company-1',agentId:'agent-1'});assert.match(first.error,/unknown/i);const second=await h.executeTool('post_comment',args,{companyId:'company-1',agentId:'agent-1'});assert.match(second.error,/replay is disabled/i);assert.equal(posts,1);}finally{globalThis.fetch=original;}
});
