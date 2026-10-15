import test from 'node:test';
import assert from 'node:assert/strict';
import { requestForgejo } from '../dist/transport.js';

test('transport binds requests to configured origin and refuses redirects and oversized responses', async()=>{
 let seen;
 const fake=async(url,init)=>{seen={url,init};return new Response('{"ok":true}',{status:200})};
 const result=await requestForgejo('https://forgejo.local','/api/v1/repos/acme/app/issues?state=open','read-token','GET',undefined,fake);
 assert.equal(result,'{"ok":true}'); assert.equal(seen.url,'https://forgejo.local/api/v1/repos/acme/app/issues?state=open');
 assert.equal(seen.init.redirect,'error'); assert.equal(seen.init.headers.Authorization,'token read-token');
 await assert.rejects(()=>requestForgejo('https://forgejo.local','/api/v1/repos/acme/app/issues','secret','GET',undefined,async()=>new Response('x'.repeat(100001))));
 await assert.rejects(()=>requestForgejo('https://forgejo.local','/api/v1/repos/acme/app/issues','secret','GET',undefined,async()=>new Response(null,{status:302,headers:{location:'https://evil.test'}})));
});
