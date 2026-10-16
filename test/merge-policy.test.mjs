import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const modulePath = process.env.MERGE_POLICY_MODULE ?? path.resolve('dist/merge-policy.js');
const { assertMergeAllowed } = await import(pathToFileURL(modulePath));

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const pr = (overrides = {}) => ({
  state: 'open', draft: false, merged: false, mergeable: true,
  head: { sha, repo: { full_name: 'ORG/REPO' } },
  base: { repo: { full_name: 'org/repo' } },
  user: { login: 'author' },
  ...overrides,
});
const review = (login, state, id, overrides = {}) => ({
  user: { login }, state, id, commit_id: sha, submitted_at: '2026-01-01T00:00:00Z',
  official: true, stale: false, dismissed: false, ...overrides,
});
const status = (overrides = {}) => ({
  state: 'success', total_count: 1,
  statuses: [{ status: 'success', context: 'ci/test' }], sha, ...overrides,
});
const call = (p = pr(), r = [review('reviewer', 'APPROVED', 1)], s = status(), ...args) =>
  assertMergeAllowed(p, r, s, sha, 'merger', 'org/repo', ...args);

// Tracer: a well-formed open PR with independent approval and complete green checks is allowed.
test('allows a fully guarded merge', () => {
  assert.equal(call(), undefined);
});

test('ignores ordinary comment reviews and stale approvals when a valid independent approval remains',()=>{
  assert.doesNotThrow(()=>call(pr(),[review('reviewer','APPROVED',1),review('commenter','COMMENT',2,{official:false})]));
  assert.doesNotThrow(()=>call(pr(),[review('old','APPROVED',1,{stale:true}),review('reviewer','APPROVED',2)]));
});

test('rejects PR states that are not merge-ready', () => {
  for (const change of [{ state: 'closed' }, { draft: true }, { merged: true }, { mergeable: false }])
    assert.throws(() => call(pr(change)));
});

test('requires an exact full expected head SHA and matching head/base repositories', () => {
  assert.throws(() => assertMergeAllowed(pr({ head: { sha: otherSha, repo: { full_name: 'org/repo' } } }), [review('reviewer','APPROVED',1)], status(), sha, 'merger', 'org/repo'));
  assert.throws(() => call(pr({ base: { repo: { full_name: 'elsewhere/repo' } } })));
  assert.throws(() => assertMergeAllowed(pr(), [review('reviewer','APPROVED',1)], status(), 'short', 'merger', 'org/repo'));
});

test('requires a known author and independent official current-head approval', () => {
  assert.throws(() => call(pr({ user: null })));
  assert.throws(() => call(pr(), [review('author', 'APPROVED', 1)]));
  assert.throws(() => call(pr(), [review('merger', 'APPROVED', 1)]));
  assert.throws(() => call(pr(), [review('reviewer', 'APPROVED', 1, { official: false })]));
  assert.throws(() => call(pr(), [review('reviewer', 'APPROVED', 1, { commit_id: otherSha })]));
});

test('does not allow an unresolved current-head change request or let comment erase it', () => {
  assert.throws(() => call(pr(), [review('reviewerA','APPROVED',1), review('reviewerB','REQUEST_CHANGES',2), review('reviewerB','COMMENT',3)]));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1), review('second','REQUEST_CHANGES',2)]));
  assert.throws(() => call(pr(), [review('reviewer','REQUEST_CHANGES',1), review('reviewer','COMMENT',2)]));
  assert.doesNotThrow(() => call(pr(), [review('reviewer','REQUEST_CHANGES',1), review('reviewer','APPROVED',2)]));
});

test('ignores stale and dismissed reviews', () => {
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1,{ commit_id: otherSha, state: 'APPROVED' })]));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1,{ stale: true })]));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1,{ stale: true, commit_id: sha })]));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1,{ dismissed: true })]));
  assert.doesNotThrow(() => call(pr(), [review('old','APPROVED',1,{ dismissed: true }), review('reviewer','APPROVED',2)]));
});

test('rejects malformed review identity, state, or ordering instead of guessing', () => {
  for (const r of [review('reviewer','MAYBE',1), review('reviewer','APPROVED','x'), review(null,'APPROVED',1)])
    assert.throws(() => call(pr(), [r]));
  assert.throws(() => call(pr(), [review('reviewer','REQUEST_CHANGES',2), review('reviewer','APPROVED',1)]));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1), review('reviewer','APPROVED',1)]));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1), review('second','APPROVED',1)]));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',0)]));
});

test('requires a complete, nonempty, uniquely named all-success combined status for this SHA', () => {
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1)], status({ state: 'pending' })));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1)], status({ total_count: 0, statuses: [] })));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1)], status({ total_count: 2 })));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1)], status({ statuses: [{status:'success',context:'ci'},{status:'success',context:'ci'}], total_count: 2 })));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1)], status({ statuses: [{status:'success',context:''}] })));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1)], status({ statuses: [{status:'failure',context:'ci'}] })));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1)], status({ sha: otherSha })));
  assert.throws(() => call(pr(), [review('reviewer','APPROVED',1)], status({ sha: undefined })));
});
