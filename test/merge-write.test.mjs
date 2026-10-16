import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from '@paperclipai/plugin-sdk/testing';
import plugin from '../dist/plugin.js';
import manifest from '../dist/manifest.js';
import { toolPath } from '../dist/core.js';
const sha='a'.repeat(40), mergeSha='b'.repeat(40);
const ref=n=>({type:'secret_ref',secretId:`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`});
const config={enabled:true,baseUrl:'https://forgejo.example',webhookSecret:ref('1'),repositories:[{name:'acme/app',companyId:'company',agentId:'merger',forgejoUsername:'merge-bot',allowedOperations:['merge_pull_request'],readSecret:ref('2'),writeSecret:ref('3')}]};
const args={repository:'acme/app',number:7,commitSha:sha,mergeMethod:'merge',operationId:'merge-test-0001'};
const run={companyId:'company',agentId:'merger'};
const repo={full_name:'acme/app'};
function fixture(){let merged=false;return {
 posts:0,wrongReadback:false,loseResponse:false,head:sha,changes:false,noChecks:false,revoked:false,
 pr(){return {id:20,number:7,state:merged?'closed':'open',merged,draft:false,mergeable:true,user:{login:'author'},head:{sha:this.head,repo},base:{repo},...(merged?{merged_by:{login:'merge-bot'},merge_commit_sha:this.wrongReadback?'wrong':mergeSha}:{})};},
 async fetch(url,init){const p=new URL(url).pathname;
  if(p==='/api/v1/user')return Response.json({login:'merge-bot'});
  if(init.method==='POST'){this.posts++;assert.deepEqual(JSON.parse(init.body),{Do:'merge',head_commit_id:sha,force_merge:false,delete_branch_after_merge:false,merge_when_checks_succeed:false});merged=true;if(this.loseResponse)throw Error('response lost');return new Response(null,{status:200});}
  if(p.endsWith('/reviews')){const page=Number(new URL(url).searchParams.get('page')??1);if(page>1)return Response.json(page===2&&this.lateChanges?[{id:4,commit_id:sha,user:{login:'second-reviewer'},state:'REQUEST_CHANGES',stale:false,dismissed:false,official:true}]:[]);return Response.json([{id:3,commit_id:sha,user:{login:'review-bot'},state:this.changes?'REQUEST_CHANGES':'APPROVED',stale:false,dismissed:false,official:true}]);}
  if(p.endsWith('/status'))return Response.json({sha,state:'success',total_count:this.noChecks?0:1,statuses:this.noChecks?[]:[{context:'ci',status:'success'}]});
  if(p.endsWith('/pulls/7'))return Response.json(this.pr());
  throw Error('Unexpected path '+p);
 }
};}
async function exercise(f,fn){const h=createTestHarness({manifest,config});await plugin.definition.setup(h.ctx);h.ctx.secrets.resolve=async()=> 'fixture-token';const orig=globalThis.fetch;globalThis.fetch=f.fetch.bind(f);try{return await fn(h);}finally{globalThis.fetch=orig;}}
test('merge path pins full SHA and explicit non-force options',()=>{assert.deepEqual(toolPath('acme/app','merge_pull_request',args),{path:'/api/v1/repos/acme/app/pulls/7/merge',method:'POST',body:{Do:'merge',head_commit_id:sha,force_merge:false,delete_branch_after_merge:false,merge_when_checks_succeed:false}});});
test('merge handler accepts empty success, verifies exact PR and does not repost',async()=>{const f=fixture();await exercise(f,async h=>{const r=await h.executeTool('merge_pull_request',args,run);assert.match(r.content??'',/Verified/,JSON.stringify(r));const again=await h.executeTool('merge_pull_request',args,run);assert.match(again.content??'',/Verified/);assert.equal(f.posts,1);const changed=await h.executeTool('merge_pull_request',{...args,mergeMethod:'squash'},run);assert.match(changed.error??'',/different request/);});});
test('merge denies ungranted agents, stale heads, change requests and absent checks before POST',async()=>{for(const setting of ['head','changes','lateChanges','noChecks','agent']){const f=fixture();if(setting==='head')f.head='c'.repeat(40);if(setting==='changes')f.changes=true;if(setting==='lateChanges')f.lateChanges=true;if(setting==='noChecks')f.noChecks=true;await exercise(f,async h=>{const r=await h.executeTool('merge_pull_request',args,setting==='agent'?{...run,agentId:'reviewer'}:run);assert.ok(r.error,setting);assert.equal(f.posts,0);});}});
test('merge unknown response never reposts and known submitted mismatch reconciles only',async()=>{for(const setting of ['loseResponse','wrongReadback']){const f=fixture();f[setting]=true;await exercise(f,async h=>{const first=await h.executeTool('merge_pull_request',args,run);assert.ok(first.error,setting);const second=await h.executeTool('merge_pull_request',args,run);assert.ok(second.error,setting);assert.equal(f.posts,1);if(setting==='wrongReadback'){f.wrongReadback=false;const final=await h.executeTool('merge_pull_request',args,run);assert.match(final.content??'',/Verified/);assert.equal(f.posts,1);}});}});
test('merge serializes distinct intents for same PR and checks changed grant before POST',async()=>{const f=fixture();await exercise(f,async h=>{const out=await Promise.all([h.executeTool('merge_pull_request',args,run),h.executeTool('merge_pull_request',{...args,operationId:'merge-test-0002'},run)]);assert.equal(out.filter(r=>r.content?.includes('Verified')).length,1);assert.equal(f.posts,1);});const g=fixture();await exercise(g,async h=>{let count=0;const orig=h.ctx.config.get;h.ctx.config.get=async(...p)=>++count>1?{enabled:false}:orig(...p);const result=await h.executeTool('merge_pull_request',args,run);assert.ok(result.error);assert.equal(g.posts,0);});});
