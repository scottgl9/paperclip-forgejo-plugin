import { createHash } from 'node:crypto';
import { definePlugin, type PluginContext, type ToolRunContext } from '@paperclipai/plugin-sdk';
import { parseConfig, repositoryKey, toolPath, verifySignature, type Config } from './core.js';
import { requestForgejo } from './transport.js';
import manifest from './manifest.js';
import { executeMerge } from './merge.js';
let host:PluginContext;
const webhookTails=new Map<string,Promise<void>>();
async function serialize<T>(key:string,fn:()=>Promise<T>):Promise<T>{const previous=webhookTails.get(key)??Promise.resolve();let release!:()=>void;const next=new Promise<void>(r=>release=r);const queued=previous.then(()=>next);webhookTails.set(key,queued);await previous;try{return await fn();}finally{release();if(webhookTails.get(key)===queued)webhookTails.delete(key);}}
function header(headers:Record<string,string|string[]>,name:string):string|undefined { const value=Object.entries(headers).find(([k])=>k.toLowerCase()===name.toLowerCase())?.[1]; return Array.isArray(value)?value[0]:value; }
async function configFor(companyId:string):Promise<Config>{ return parseConfig(await host.config.get(companyId)); }
async function secret(ref:Config['webhookSecret'],companyId:string,configPath:string):Promise<string>{ return host.secrets.resolve(ref,{companyId,configPath}); }
const plugin=definePlugin({
 multiCompanyConfig: true,
 async onConfigChanged(config,scope) {
  if(!scope||typeof scope.companyId!=='string'||scope.companyId.length===0)throw new Error('company scope is required');
  if(config&&typeof config==='object'&&(config as any).enabled===false)return;
  parseConfig(config);
 },
 async onValidateConfig(value) {
  try { if(value&&typeof value==='object'&&(value as any).enabled===false)return {ok:true}; parseConfig(value); return {ok:true}; }
  catch { return {ok:false,errors:['Invalid enabled Forgejo configuration; verify HTTPS origin, secret references, repository grants, and required operations.']}; }
 },
 async setup(ctx) {
  host=ctx;
  const labels:Record<string,[string,string]>={list_pull_requests:['List pull requests','Read up to 30 pull requests.'],list_issues:['List issues','Read up to 30 issues.'],get_pull_diff:['Get pull request diff','Read a bounded diff.'],list_reviews:['List reviews','Read pull request reviews.'],get_commit_statuses:['Get commit statuses','Read commit statuses.'],post_comment:['Post comment','Post an explicit comment.'],submit_review:['Submit review','Submit an explicit review; no merge.'],create_pull_request:['Create pull request','Create and verify a same-repository pull request.']};
  labels.merge_pull_request=['Merge pull request','Merge an independently reviewed exact commit.'];
  for(const [name] of Object.entries(labels)) { const declaration=manifest.tools?.find(t=>t.name===name); if(!declaration)continue; ctx.tools.register(name,{displayName:declaration.displayName,description:declaration.description,parametersSchema:declaration.parametersSchema},async(raw,runCtx:ToolRunContext)=>{
   try {
    const p=raw as Record<string,unknown>; if(!p||typeof p!=='object'||typeof p.repository!=='string') return {error:'Invalid tool input'};
    if(name==='merge_pull_request')return await executeMerge(ctx,p,runCtx,serialize);
    const config=await configFor(runCtx.companyId); const key=p.repository.toLowerCase();
    const grant=config.repositories.find(g=>g.name===key&&g.companyId===runCtx.companyId&&g.agentId===runCtx.agentId); if(!grant)return {error:'Repository access denied'};
    if(!grant.allowedOperations.includes(name)) return {error:'Operation is not allowed for this agent'};
    const req=toolPath(key,name,p); const write=['post_comment','submit_review','create_pull_request'].includes(name);
    const readToken=await secret(grant.readSecret,runCtx.companyId,`repositories.${grant.configIndex}.readSecret`);
    if(!write){const text=await requestForgejo(config.baseUrl,req.path,readToken,req.method,req.body);return {content:text||'OK'};}
    if(!grant.writeSecret)return {error:'Write operation is not configured'};
    if(typeof p.operationId!=='string'||!/^[A-Za-z0-9._:-]{8,128}$/.test(p.operationId))return {error:'A unique operationId is required'};
    const writeToken=await secret(grant.writeSecret,runCtx.companyId,`repositories.${grant.configIndex}.writeSecret`);
    const fingerprint=createHash('sha256').update(JSON.stringify({name,repository:key,path:req.path,method:req.method,payload:req.body})).digest('hex');
    const stateKey={scopeKind:'company' as const,scopeId:runCtx.companyId,namespace:'forgejo-write',stateKey:`${runCtx.agentId}:${p.operationId}`};
    return serialize(`${runCtx.companyId}:${runCtx.agentId}:${p.operationId}`,async()=>{
    const prior=await ctx.state.get(stateKey) as any;
    if(prior&&prior.fingerprint!==fingerprint)return {error:'operationId was already used for a different request'};
    if(prior?.status==='outcome_unknown')return {error:'Write outcome is unknown; automatic replay is disabled'};
    if(prior?.status==='verified')return {content:`Verified Forgejo ${name} ID ${prior.resultId}`};
    let result:any;
    if(prior?.status==='submitted'){result=prior.result;}
    else {
     const principal=JSON.parse(await requestForgejo(config.baseUrl,'/api/v1/user',writeToken,'GET'));
     if((principal?.login??principal?.username)!==grant.forgejoUsername)return {error:'Write credential principal does not match configured Forgejo username'};
     if(name==='submit_review') {const pr=JSON.parse(await requestForgejo(config.baseUrl,`/api/v1/repos/${encodeURIComponent(key.split('/')[0])}/${encodeURIComponent(key.split('/')[1])}/pulls/${p.number}`,readToken,'GET'));if(pr?.head?.sha!==p.commitSha)return {error:'Review commit is not the current pull request head'};}
     if(name==='create_pull_request') {
      const fresh=await configFor(runCtx.companyId);const current=fresh.repositories.find(g=>g.name===key&&g.companyId===runCtx.companyId&&g.agentId===runCtx.agentId);
      if(!current||!current.allowedOperations.includes(name))return {error:'Operation is not allowed for this agent'};
      if(fresh.baseUrl!==config.baseUrl||current.forgejoUsername!==grant.forgejoUsername||JSON.stringify(current.writeSecret)!==JSON.stringify(grant.writeSecret))return {error:'Create grant changed during preflight; no write was submitted'};
     }
     await ctx.state.set(stateKey,{status:'outcome_unknown',fingerprint,repository:key,operation:name,startedAt:new Date().toISOString()});
     try {result=JSON.parse(await requestForgejo(config.baseUrl,req.path,writeToken,'POST',req.body));} catch {return {error:'Write outcome unknown; operation will not be replayed'};}
     if(!Number.isInteger(result?.id)||result.id<1)return {error:'Write outcome unknown; Forgejo returned no verifiable ID'};
     await ctx.state.set(stateKey,{status:'submitted',fingerprint,repository:key,operation:name,result,expected:{payload:req.body},submittedAt:new Date().toISOString()});
    }
    const root=`/api/v1/repos/${encodeURIComponent(key.split('/')[0])}/${encodeURIComponent(key.split('/')[1])}`;
    const creating=name==='create_pull_request';
    if(creating&&(!Number.isSafeInteger(result?.number)||result.number<1||result.number>2147483647))return {error:'Write returned no verifiable PR number; retry will reconcile only'};
    const checkPath=creating?`${root}/pulls/${result.number}`:name==='post_comment'?`${root}/issues/comments/${result.id}`:`${root}/pulls/${p.number}/reviews/${result.id}`;
    const observed=JSON.parse(await requestForgejo(config.baseUrl,checkPath,readToken,'GET'));
    const author=observed?.user?.login??observed?.user?.username;
    const expectedState=p.event==='APPROVE'?'APPROVED':p.event==='REQUEST_CHANGES'?'REQUEST_CHANGES':'COMMENT';
    const valid=creating?observed?.id===result.id&&observed?.number===result.number&&author===grant.forgejoUsername&&observed?.title===p.title&&observed?.body===p.body&&observed?.head?.ref===p.head&&observed?.base?.ref===p.base&&typeof observed?.head?.repo?.full_name==='string'&&observed.head.repo.full_name.toLowerCase()===key&&typeof observed?.base?.repo?.full_name==='string'&&observed.base.repo.full_name.toLowerCase()===key:author===grant.forgejoUsername&&observed?.body===p.body&&(name==='post_comment'||(observed?.commit_id===p.commitSha&&String(observed?.state??'').toUpperCase()===expectedState));
    if(!valid)return {error:`Write returned ID ${result.id}; read-back did not match; retry will reconcile only`};
    await ctx.state.set(stateKey,{status:'verified',fingerprint,repository:key,operation:name,resultId:result.id,number:result.number,verifiedAt:new Date().toISOString()});
    return {content:`Verified Forgejo ${name} ID ${result.id}${creating?` number ${result.number}`:''}`};
    });
   }catch{return {error:'Forgejo operation rejected or failed'};}
  });
  }
 },
 async onWebhook(input) {
  if(input.endpointKey!=='forgejo')throw new Error('unknown webhook endpoint');
  if(Buffer.byteLength(input.rawBody,'utf8')>1_000_000)throw new Error('webhook payload too large');
  const parsed=JSON.parse(input.rawBody) as any; const repo=parsed?.repository;
  if(typeof repo?.owner?.login!=='string'||typeof repo?.name!=='string')throw new Error('invalid webhook payload');
  const key=repositoryKey(repo.owner.login,repo.name); const companies=await host.companies.list({limit:100}); let found:{companyId:string;config:Config}|undefined;
  for(const company of companies){try{const config=await configFor(company.id);if(config.repositories.some(g=>g.name===key&&g.companyId===company.id)){if(found)throw new Error('ambiguous repository grant');found={companyId:company.id,config};}}catch(e){if(String(e).includes('ambiguous'))throw e;}}
  if(!found)throw new Error('repository not granted');
  if(!verifySignature(input.rawBody,header(input.headers,'X-Forgejo-Signature'),await secret(found.config.webhookSecret,found.companyId,'webhookSecret')))throw new Error('invalid webhook signature');
  const delivery=header(input.headers,'X-Forgejo-Delivery'); const event=header(input.headers,'X-Forgejo-Event'); if(!delivery||!/^[A-Za-z0-9._:-]{1,200}$/.test(delivery)||!event||!['pull_request','issues'].includes(event))return;
  const action=String(parsed.action??''); if(action!=='opened')return;
  const object=parsed.pull_request??parsed.issue; if(!object||!Number.isInteger(object.number)||object.number<1)throw new Error('invalid webhook object');
  return serialize(`${found.companyId}:${key}`,async()=>{
   const scope={scopeKind:'company' as const,scopeId:found!.companyId,namespace:'forgejo',stateKey:`delivery:${key}:${delivery}`}; if(await host.state.get(scope))return;
   const originId=`${key}#${object.number}`; const receipt={scopeKind:'company' as const,scopeId:found!.companyId,namespace:'forgejo-webhook-effect',stateKey:originId}; const fingerprint=createHash('sha256').update(JSON.stringify({companyId:found!.companyId,repository:key,event,action,number:object.number})).digest('hex');
   const prior=await host.state.get(receipt) as any; if(prior&&prior.fingerprint!==fingerprint)throw new Error('webhook origin receipt fingerprint conflict');
   const existing=await host.issues.list({companyId:found!.companyId,originKind:'plugin:paperclip.forgejo',originId,limit:2});
   if(existing.length>1)throw new Error('multiple issues match Forgejo origin');
   if(existing.length===1){await host.state.set(receipt,{status:'done',fingerprint,issueId:existing[0].id,originId});}
   else if(prior){await host.state.set(receipt,{...prior,status:'outcome_unknown',fingerprint,originId});await host.state.set(scope,{status:'outcome_unknown',originId,receiptKey:receipt.stateKey});throw new Error(`Webhook create outcome unknown; automatic replay disabled. Receipt ${receipt.stateKey} requires reconciliation`);}
   else {
    await host.state.set(receipt,{status:'outcome_unknown',fingerprint,originId,startedAt:new Date().toISOString()});
    let created:any; try { created=await host.issues.create({companyId:found!.companyId,title:String(object.title??`Forgejo ${event} #${object.number}`).slice(0,240),description:`${String(object.html_url??'').slice(0,2000)}\\n\\n${String(object.body??'').slice(0,6000)}`,status:'todo',originKind:'plugin:paperclip.forgejo',originId}); } catch { await host.state.set(scope,{status:'outcome_unknown',originId,receiptKey:receipt.stateKey});throw new Error(`Webhook create outcome unknown; automatic replay disabled. Receipt ${receipt.stateKey} requires reconciliation`); }
    const check=await host.issues.list({companyId:found!.companyId,originKind:'plugin:paperclip.forgejo',originId,limit:2}); if(check.length!==1||check[0].id!==created.id)throw new Error('created issue origin read-back failed');
    await host.state.set(receipt,{status:'done',fingerprint,originId,issueId:created.id,createdAt:new Date().toISOString()});
   }
   await host.state.set(scope,{status:'done',event,action,originId,receivedAt:new Date().toISOString()});
  });
 }
});
export default plugin;
