import test from 'node:test';
import assert from 'node:assert/strict';
import {toolPath, TOOL_NAMES, parseConfig} from '../dist/core.js';
import manifest from '../dist/manifest.js';
const repo='acme/app', sha='a'.repeat(40);
test('bounded reads use exact installed Forgejo routes and pagination',()=>{
 const paths={get_repository:'/api/v1/repos/acme/app',get_pull_request:'/api/v1/repos/acme/app/pulls/7',get_issue:'/api/v1/repos/acme/app/issues/7',list_comments:'/api/v1/repos/acme/app/issues/7/comments?page=2&limit=12',list_branches:'/api/v1/repos/acme/app/branches?page=2&limit=12',get_commit:`/api/v1/repos/acme/app/git/commits/${sha}`,list_pull_commits:'/api/v1/repos/acme/app/pulls/7/commits?page=2&limit=12',list_pull_files:'/api/v1/repos/acme/app/pulls/7/files?page=2&limit=12'};
 for(const [op,path] of Object.entries(paths)){const p=op==='get_repository'?{}:op==='get_commit'?{sha}:['get_pull_request','get_issue','list_comments','list_pull_commits','list_pull_files'].includes(op)?{number:7,page:2,limit:12}:{page:2,limit:12}; assert.equal(toolPath(repo,op,p).path,path);assert.equal(toolPath(repo,op,p).method,'GET');}
});
test('all list endpoints default pagination and reject invalid bounds',()=>{
 for(const [op,p] of [['list_pull_requests',{}],['list_issues',{}],['list_reviews',{number:7}],['list_comments',{number:7}],['list_branches',{}],['list_pull_commits',{number:7}],['list_pull_files',{number:7}]]) assert.match(toolPath(repo,op,p).path,/page=1&limit=30$/);
 for(const bad of [{page:0},{page:10001},{page:1.5},{limit:0},{limit:51},{limit:2.1}]) assert.throws(()=>toolPath(repo,'list_branches',bad));
});
test('arbitrary refs are not accepted and commit SHA must be exactly 40 hex chars',()=>{
 assert.throws(()=>toolPath(repo,'get_commit',{sha:'main'}));assert.throws(()=>toolPath(repo,'get_commit',{sha:'a'.repeat(41)}));assert.throws(()=>toolPath(repo,'get_commit',{sha:'../'+'a'.repeat(37)}));
});
test('create_issue is a constrained explicit write and is granted as a write operation',()=>{
 assert.deepEqual(toolPath(repo,'create_issue',{title:'Bug',body:'Details'}),{path:'/api/v1/repos/acme/app/issues',method:'POST',body:{title:'Bug',body:'Details',closed:false}});
 for(const p of [{title:'',body:''},{title:'x'.repeat(256),body:''},{title:'Bug',body:'x'.repeat(10001)},{title:'Bug',body:'',assignees:['someone']},{title:'Bug',body:'',closed:true}]) assert.throws(()=>toolPath(repo,'create_issue',p));
 assert(TOOL_NAMES.includes('create_issue'));
 const t=manifest.tools.find(x=>x.name==='create_issue');assert(t);assert.deepEqual(t.parametersSchema.required,['repository','title','body','operationId']);
 const c={enabled:true,baseUrl:'https://forgejo.example',webhookSecret:{type:'secret_ref',secretId:'22222222-2222-4222-8222-222222222222'},repositories:[{name:repo,companyId:'c',agentId:'a',forgejoUsername:'bot',allowedOperations:['create_issue'],readSecret:{type:'secret_ref',secretId:'11111111-1111-4111-8111-111111111111'},writeSecret:{type:'secret_ref',secretId:'33333333-3333-4333-8333-333333333333'}}]};assert.equal(parseConfig(c).repositories[0].allowedOperations[0],'create_issue');c.repositories[0].writeSecret=undefined;assert.throws(()=>parseConfig(c));
});
test('new tools appear in manifest and allowed operation schema',()=>{for(const n of ['get_repository','get_pull_request','get_issue','list_comments','list_branches','get_commit','list_pull_commits','list_pull_files']){assert(TOOL_NAMES.includes(n));assert(manifest.tools.some(t=>t.name===n));assert(manifest.instanceConfigSchema.properties.repositories.items.properties.allowedOperations.items.enum.includes(n));}});

test('every paginated tool exposes page and limit in its schema',()=>{for(const t of manifest.tools.filter(t=>t.name.startsWith('list_'))){assert.equal(t.parametersSchema.properties.page.maximum,10000,t.name);assert.equal(t.parametersSchema.properties.limit.maximum,50,t.name);}});
