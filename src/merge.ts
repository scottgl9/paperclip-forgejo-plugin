import { createHash } from 'node:crypto';
import type { PluginContext, ToolRunContext } from '@paperclipai/plugin-sdk';
import { parseConfig, toolPath } from './core.js';
import { requestForgejo } from './transport.js';
import { assertMergeAllowed } from './merge-policy.js';

type Serializer = <T>(key: string, operation: () => Promise<T>) => Promise<T>;

/** One-worker execution boundary; Forgejo still enforces head pinning and branch protection. */
export async function executeMerge(ctx: PluginContext, p: Record<string, unknown>, run: ToolRunContext, serialize: Serializer) {
  const key = String(p.repository).toLowerCase();
  const req = toolPath(key, 'merge_pull_request', p);
  if (typeof p.operationId !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(p.operationId)) return { error: 'A unique operationId is required' };
  return serialize(`${run.companyId}:${run.agentId}:${p.operationId}`, () =>
    serialize(`merge:${run.companyId}:${key}:${p.number}`, async () => {
      const config = parseConfig(await ctx.config.get(run.companyId));
      const grant = config.repositories.find(g => g.name === key && g.companyId === run.companyId && g.agentId === run.agentId);
      if (!grant) return { error: 'Repository access denied' };
      if (!grant.allowedOperations.includes('merge_pull_request') || !grant.writeSecret) return { error: 'Operation is not allowed for this agent' };
      const fingerprint = createHash('sha256').update(JSON.stringify({ origin: config.baseUrl, principal: grant.forgejoUsername, path: req.path, method: req.method, payload: req.body })).digest('hex');
      const stateKey = { scopeKind: 'company' as const, scopeId: run.companyId, namespace: 'forgejo-write', stateKey: `${run.agentId}:${p.operationId}` };
      const prior = await ctx.state.get(stateKey) as any;
      if (prior && prior.fingerprint !== fingerprint) return { error: 'operationId was already used for a different request' };
      if (prior?.status === 'outcome_unknown') return { error: 'Write outcome is unknown; automatic replay is disabled' };
      if (prior?.status === 'verified') return { content: `Verified Forgejo merge_pull_request #${p.number} commit ${prior.mergeSha}` };
      if (prior && prior.status !== 'submitted') return { error: 'Invalid merge receipt; no write was submitted' };
      const readToken = await ctx.secrets.resolve(grant.readSecret, { companyId: run.companyId, configPath: `repositories.${grant.configIndex}.readSecret` });
      const root = `/api/v1/repos/${key.split('/').map(encodeURIComponent).join('/')}`;
      const get = async (path: string) => JSON.parse(await requestForgejo(config.baseUrl, path, readToken, 'GET'));
      let targetId = prior?.targetId;
      if (!prior) {
        const writeToken = await ctx.secrets.resolve(grant.writeSecret, { companyId: run.companyId, configPath: `repositories.${grant.configIndex}.writeSecret` });
        const principal = JSON.parse(await requestForgejo(config.baseUrl, '/api/v1/user', writeToken, 'GET'));
        if ((principal?.login ?? principal?.username) !== grant.forgejoUsername) return { error: 'Write credential principal does not match configured Forgejo username' };
        const pr = await get(`${root}/pulls/${p.number}`);
        if (!Number.isSafeInteger(pr?.id) || pr.id <= 0 || pr.number !== p.number) return { error: 'Pull request identity mismatch' };
        const reviews: any[] = [];
        let complete = false;
        for (let page = 1; page <= 10; page++) {
          const batch = await get(`${root}/pulls/${p.number}/reviews?limit=30&page=${page}`);
          if (!Array.isArray(batch) || batch.length > 30) return { error: 'Invalid review page' };
          reviews.push(...batch);
          if (batch.length === 0) { complete = true; break; }
        }
        if (!complete) return { error: 'Review pagination exceeds bounded merge qualification' };
        const status = await get(`${root}/commits/${p.commitSha}/status?limit=100&page=1`);
        assertMergeAllowed(pr, reviews, status, String(p.commitSha), grant.forgejoUsername, key);
        const latest = await get(`${root}/pulls/${p.number}`);
        if (latest.id !== pr.id || latest.number !== p.number) return { error: 'Pull request identity changed' };
        assertMergeAllowed(latest, reviews, status, String(p.commitSha), grant.forgejoUsername, key);
        const fresh = parseConfig(await ctx.config.get(run.companyId));
        const current = fresh.repositories.find(g => g.name === key && g.companyId === run.companyId && g.agentId === run.agentId);
        if (!current?.allowedOperations.includes('merge_pull_request') || fresh.baseUrl !== config.baseUrl || current.forgejoUsername !== grant.forgejoUsername || JSON.stringify(current.writeSecret) !== JSON.stringify(grant.writeSecret)) return { error: 'Merge grant changed during preflight; no write was submitted' };
        targetId = pr.id;
        await ctx.state.set(stateKey, { status: 'outcome_unknown', fingerprint, operation: 'merge_pull_request', repository: key, number: p.number, targetId, startedAt: new Date().toISOString() });
        try { await requestForgejo(config.baseUrl, req.path, writeToken, 'POST', req.body); }
        catch { return { error: 'Write outcome unknown; operation will not be replayed' }; }
        await ctx.state.set(stateKey, { status: 'submitted', fingerprint, operation: 'merge_pull_request', repository: key, number: p.number, targetId, submittedAt: new Date().toISOString() });
      }
      const observed = await get(`${root}/pulls/${p.number}`);
      const author = observed?.merged_by?.login ?? observed?.merged_by?.username;
      const sameRepo = (value: unknown) => typeof value === 'string' && value.toLowerCase() === key;
      if (observed?.id !== targetId || observed?.number !== p.number || observed?.merged !== true || observed?.state !== 'closed' || observed?.head?.sha !== p.commitSha || !sameRepo(observed?.head?.repo?.full_name) || !sameRepo(observed?.base?.repo?.full_name) || author !== grant.forgejoUsername || typeof observed.merge_commit_sha !== 'string' || !/^[a-f0-9]{40}$/i.test(observed.merge_commit_sha)) return { error: 'Merge read-back did not match; retry will reconcile only' };
      await ctx.state.set(stateKey, { status: 'verified', fingerprint, operation: 'merge_pull_request', repository: key, number: p.number, targetId, mergeSha: observed.merge_commit_sha, verifiedAt: new Date().toISOString() });
      return { content: `Verified Forgejo merge_pull_request #${p.number} commit ${observed.merge_commit_sha}` };
    }));
}
