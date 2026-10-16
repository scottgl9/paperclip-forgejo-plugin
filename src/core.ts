import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EnvSecretRefBinding } from '@paperclipai/plugin-sdk';

export type SecretRef = EnvSecretRefBinding;
export type RepositoryGrant = { name: string; companyId: string; agentId: string; configIndex: number; forgejoUsername: string; allowedOperations: string[]; readSecret: SecretRef; writeSecret?: SecretRef };
export type Config = { baseUrl: string; webhookSecret: SecretRef; repositories: RepositoryGrant[] };
const REF = (x: any): x is SecretRef => !!x && typeof x === 'object' && x.type === 'secret_ref' && typeof x.secretId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x.secretId) && (x.version === undefined || x.version === 'latest' || Number.isInteger(x.version));
export function parseConfig(value: unknown): Config {
  if (!value || typeof value !== 'object') throw new Error('invalid configuration');
  const x=value as any;
  if (x.enabled !== true) throw new Error('plugin disabled');
  if (typeof x.baseUrl !== 'string') throw new Error('invalid origin');
  const u=new URL(x.baseUrl);
  if (u.protocol!=='https:' || u.username || u.password || u.pathname!=='/' || u.search || u.hash) throw new Error('origin must be a bare HTTPS origin');
  if (!REF(x.webhookSecret) || !Array.isArray(x.repositories) || x.repositories.length===0 || x.repositories.length>250) throw new Error('missing webhook secret or repository grants');
  const names=new Set<string>();
  const repositories=x.repositories.map((g:any,configIndex:number)=>{
    if (!g || typeof g.name!=='string' || g.name.split('/').length!==2 || !/^[A-Za-z0-9_.-]+$/.test(g.name.split('/')[0]) || !/^[A-Za-z0-9_.-]+$/.test(g.name.split('/')[1]) || g.name.includes('..') || typeof g.companyId!=='string' || !g.companyId || typeof g.agentId!=='string' || !g.agentId || typeof g.forgejoUsername!=='string' || !g.forgejoUsername || !REF(g.readSecret) || !Array.isArray(g.allowedOperations) || g.allowedOperations.length===0 || new Set(g.allowedOperations).size!==g.allowedOperations.length || g.allowedOperations.some((op:string)=>!TOOL_NAMES.includes(op as any)) || (g.allowedOperations.some((op:string)=>op==='post_comment'||op==='submit_review'||op==='create_pull_request'||op==='merge_pull_request')&&!REF(g.writeSecret)) || (g.writeSecret&&!g.allowedOperations.some((op:string)=>op==='post_comment'||op==='submit_review'||op==='create_pull_request'||op==='merge_pull_request'))) throw new Error('invalid repository grant');
    const name=g.name.toLowerCase(); const identity=`${name}|${g.agentId}`; if(names.has(identity)) throw new Error('duplicate repository-agent grant'); names.add(identity);
    return {name, companyId:g.companyId, agentId:g.agentId, configIndex, forgejoUsername:g.forgejoUsername, allowedOperations:g.allowedOperations, readSecret:g.readSecret, ...(g.writeSecret?{writeSecret:g.writeSecret}:{})};
  });
  return {baseUrl:u.origin, webhookSecret:x.webhookSecret, repositories};
}
export function repositoryKey(owner:string, repo:string):string {
  if(!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || owner.includes('..') || repo.includes('..')) throw new Error('invalid repository identity');
  return `${owner}/${repo}`.toLowerCase();
}
export function forgejoUrl(base:string, path:string):string {
  if((!path.startsWith('/api/v1/repos/') && path!=='/api/v1/user') || path.startsWith('//') || path.includes('\\') || /%2e|%2f|%5c/i.test(path) || /(^|\/)\.\.?($|\/)/.test(path) || path.includes('#')) throw new Error('API path is not allowed');
  const u=new URL(path,base);
  if(u.origin!==base || (u.pathname!=='/api/v1/user'&&!u.pathname.startsWith('/api/v1/repos/'))) throw new Error('API path is not allowed');
  return u.href;
}
export function verifySignature(body:Buffer|string, signature:string|undefined, secret:string):boolean {
  if(!signature || !/^(?:sha256=)?[a-f0-9]{64}$/i.test(signature)) return false;
  const expected=createHmac('sha256',secret).update(body).digest();
  const supplied=Buffer.from(signature.replace(/^sha256=/i,''),'hex');
  return supplied.length===expected.length && timingSafeEqual(supplied,expected);
}
export const TOOL_NAMES=['list_pull_requests','list_issues','get_pull_diff','list_reviews','get_commit_statuses','post_comment','submit_review','create_pull_request','merge_pull_request'] as const;
export function toolPath(repo:string, op:string, p:Record<string,unknown>):{path:string;method:'GET'|'POST';body?:unknown} {
 const [owner,name]=repo.split('/'); const prefix=`/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
 const n=p.number;
 if((['get_pull_diff','list_reviews','post_comment','submit_review'].includes(op) || op==='merge_pull_request') && (!Number.isInteger(n)||Number(n)<1||Number(n)>2147483647)) throw new Error('invalid item number');
 switch(op){
  case 'list_pull_requests': return {path:`${prefix}/pulls?state=${p.state==='closed'?'closed':p.state==='all'?'all':'open'}&limit=30`,method:'GET'};
  case 'list_issues': return {path:`${prefix}/issues?state=${p.state==='closed'?'closed':p.state==='all'?'all':'open'}&limit=30`,method:'GET'};
  case 'get_pull_diff': return {path:`${prefix}/pulls/${n}.diff`,method:'GET'};
  case 'list_reviews': return {path:`${prefix}/pulls/${n}/reviews`,method:'GET'};
  case 'get_commit_statuses': if(typeof p.sha!=='string'||!/^[a-f0-9]{40,64}$/i.test(p.sha)) throw new Error('invalid commit SHA'); return {path:`${prefix}/commits/${p.sha}/status`,method:'GET'};
  case 'post_comment': if(typeof p.body!=='string'||!p.body.trim()||p.body.length>4000) throw new Error('comment must be 1–4000 characters'); return {path:`${prefix}/issues/${n}/comments`,method:'POST',body:{body:p.body}};
  case 'merge_pull_request': if(typeof p.commitSha!=='string'||!/^[a-f0-9]{40}$/i.test(p.commitSha)||!['merge','squash'].includes(String(p.mergeMethod))) throw new Error('invalid merge fields'); return {path:`${prefix}/pulls/${n}/merge`,method:'POST',body:{Do:p.mergeMethod,head_commit_id:p.commitSha,force_merge:false,delete_branch_after_merge:false,merge_when_checks_succeed:false}};
  case 'create_pull_request': if(typeof p.head!=='string'||typeof p.base!=='string'||!p.head||!p.base||p.head.length>255||p.base.length>255||p.head.startsWith('-')||p.base.startsWith('-')||!/[A-Za-z0-9_]/.test(p.head)||!/[A-Za-z0-9_]/.test(p.base)||/[^A-Za-z0-9._/-]/.test(p.head)||/[^A-Za-z0-9._/-]/.test(p.base)||p.head.split('/').some(x=>!x||x==='.'||x==='..')||p.base.split('/').some(x=>!x||x==='.'||x==='..')||typeof p.title!=='string'||!p.title.trim()||p.title.length>255||typeof p.body!=='string'||p.body.length>10000) throw new Error('invalid pull request fields'); return {path:`${prefix}/pulls`,method:'POST',body:{head:p.head,base:p.base,title:p.title,body:p.body}};
  case 'submit_review': if(typeof p.body!=='string'||p.body.length>4000||!['APPROVE','REQUEST_CHANGES','COMMENT'].includes(String(p.event))||typeof p.commitSha!=='string'||!/^[a-f0-9]{40}$/i.test(p.commitSha)) throw new Error('review requires a full 40-character commit SHA'); return {path:`${prefix}/pulls/${n}/reviews`,method:'POST',body:{body:p.body,event:p.event,commit_id:p.commitSha}};
  default: throw new Error('unsupported operation');
 }
}
