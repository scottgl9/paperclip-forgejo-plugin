export function assertMergeAllowed(
  pr: any,
  reviews: any,
  status: any,
  expectedSha: string,
  mergerUsername: string,
  repository: string,
): void {
  const fail = (): never => { throw new Error('Merge policy denied'); };
  const isObject = (value: unknown): value is Record<string, any> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  const login = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  const same = (a: unknown, b: unknown): boolean => login(a) && login(b) && a.toLowerCase() === b.toLowerCase();
  const sha40 = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);

  if (!isObject(pr) || pr.state !== 'open' || pr.draft !== false || pr.merged !== false || pr.mergeable !== true) fail();
  if (!sha40(expectedSha) || !isObject(pr.head) || pr.head.sha !== expectedSha || !isObject(pr.head.repo) ||
      !isObject(pr.base) || !isObject(pr.base.repo) || !same(pr.head.repo.full_name, repository) ||
      !same(pr.base.repo.full_name, repository) || !isObject(pr.user) || !login(pr.user.login) ||
      !login(mergerUsername) || !Array.isArray(reviews)) fail();

  if (!isObject(status) || status.sha !== expectedSha || status.state !== 'success' ||
      !Number.isInteger(status.total_count) || status.total_count <= 0 || !Array.isArray(status.statuses) ||
      status.statuses.length !== status.total_count) fail();
  const contexts = new Set<string>();
  for (const check of status.statuses) {
    if (!isObject(check) || check.status !== 'success' || !login(check.context) || contexts.has(check.context)) fail();
    contexts.add(check.context);
  }

  const active = new Map<string, { id: number; state: string }>();
  const allIds = new Set<number>();
  for (const item of reviews) {
    if (!isObject(item)) fail();
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || allIds.has(item.id)) fail();
    allIds.add(item.id);
    if (item.dismissed === true || item.state === 'DISMISSED' || item.commit_id !== expectedSha || item.state === 'COMMENT' || (item.state === 'APPROVED' && item.stale === true)) continue;
    if (!isObject(item.user) || !login(item.user.login) ||
        !['APPROVED', 'REQUEST_CHANGES', 'COMMENT'].includes(item.state) || item.official !== true) fail();
    const who = item.user.login.toLowerCase();
    const prior = active.get(who);
    if (prior && item.id <= prior.id) fail();
    if (item.state === 'COMMENT') continue;
    if (item.state === 'APPROVED' && (item.stale !== false || item.dismissed !== false)) fail();
    active.set(who, { id: item.id, state: item.state });
  }
  for (const entry of active.values()) if (entry.state === 'REQUEST_CHANGES') fail();
  const approved = [...active.entries()].some(([who, entry]) => entry.state === 'APPROVED' &&
    who !== pr.user.login.toLowerCase() && who !== mergerUsername.toLowerCase());
  if (!approved) fail();
}
