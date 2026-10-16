import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { forgejoUrl, parseConfig, verifySignature, repositoryKey, toolPath } from '../dist/core.js';

test('configuration rejects empty grant lists, non-HTTPS origins, credentials and paths', () => {
  assert.throws(() => parseConfig({ enabled:true,baseUrl: 'https://forge.example', webhookSecret: {type:'secret_ref',secretId:'s'}, repositories: [] }));
  for (const baseUrl of ['http://forge.example','https://u:p@forge.example','https://forge.example/path']) {
    assert.throws(() => parseConfig({ enabled:true,baseUrl, webhookSecret:{type:'secret_ref',secretId:'s'}, repositories:[{name:'o/r',companyId:'c',agentId:'a',allowedOperations:['list_issues'],readSecret:{type:'secret_ref',secretId:'r'}}]}));
  }
});

test('request paths are allowlisted and safely encoded', () => {
  assert.equal(forgejoUrl('https://forge.example','/api/v1/repos/acme/project/issues?state=open'), 'https://forge.example/api/v1/repos/acme/project/issues?state=open');
  assert.equal(forgejoUrl('https://forge.example','/api/v1/user'),'https://forge.example/api/v1/user');
  for (const path of ['//evil.test/x','/api/v1/../admin','/api/v1/repos/a/%2e%2e/admin','/api/v1/user?x=1','/api/v1/users']) assert.throws(() => forgejoUrl('https://forge.example',path));
});

test('signature validation covers exact original bytes', () => {
  const body=Buffer.from('{ "x": 1 }');
  const good=createHmac('sha256','secret').update(body).digest('hex');
  assert.equal(verifySignature(body,good,'secret'),true);
  assert.equal(verifySignature(Buffer.from('{"x":1}'),good,'secret'),false);
  assert.equal(verifySignature(body,'sha256=bad','secret'),false);
});

test('repository identity is normalized exactly as owner/name', () => {
 assert.equal(repositoryKey('Acme','Project'),'acme/project');
 assert.throws(()=>repositoryKey('../acme','project'));
});

test('pull request creation is restricted to same-repository branches and bounded metadata',()=>{
 const req=toolPath('acme/app','create_pull_request',{head:'feature/topic',base:'main',title:'A change',body:'Details'});
 assert.deepEqual(req,{path:'/api/v1/repos/acme/app/pulls',method:'POST',body:{head:'feature/topic',base:'main',title:'A change',body:'Details'}});
 assert.throws(()=>toolPath('acme/app','create_pull_request',{head:'../other',base:'main',title:'x',body:''}));
});

test('list operations need no item number and review approval is pinned to a full commit SHA',()=>{
 assert.equal(toolPath('acme/app','list_pull_requests',{state:'open'}).path,'/api/v1/repos/acme/app/pulls?state=open&page=1&limit=30');
 assert.throws(()=>toolPath('acme/app','submit_review',{number:12,event:'APPROVE',body:'ok'}));
 const req=toolPath('acme/app','submit_review',{number:12,event:'APPROVE',body:'ok',commitSha:'a'.repeat(40)});
 assert.equal(req.body.commit_id,'a'.repeat(40));
});

test('public APPROVE translates to installed Forgejo APPROVED event',()=>{assert.equal(toolPath('acme/app','submit_review',{number:1,event:'APPROVE',body:'x',commitSha:'a'.repeat(40)}).body.event,'APPROVED');});
