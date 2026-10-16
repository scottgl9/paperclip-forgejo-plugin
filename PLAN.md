# Plan — Forgejo Paperclip connector

## Original v0.1 delivery

- Installable TypeScript plugin against the exact published Paperclip SDK.
- Explicit per-company/per-agent repository grants and read/write secret refs; fixed HTTPS origin and no arbitrary API paths.
- Bounded PR/issue/diff/review/status reads, explicit comments and exact-head reviews.
- Signed webhook intake with durable deduplication and conservative unknown-effect handling.

## PR workflow extension

1. Add `create_pull_request` for existing same-repository branches, with explicit title/body/head/base, grant and credential-principal validation, durable operation IDs and exact PR readback.
2. Preserve and exercise `submit_review` on the exact current head; reviewers do not implicitly receive merge authority.
3. Add `merge_pull_request` pinned to an explicit head commit and merge method. Require current independent approval, no unresolved current-head change requests, complete successful commit statuses and a mergeable open non-draft PR. Preserve Forgejo branch protection; force, automatic delayed merge and branch deletion remain disabled.
4. Reconcile known submitted effects without reposting. Unknown outcomes remain blocked; changed operation-ID payloads are rejected. Serialize merge attempts for the same PR within the single-worker deployment boundary.
5. Verify strict RED/GREEN tests, full regression suite, typecheck, real HTTPS fixture, SDK worker lifecycle and production-only packed install. Freeze the candidate for independent specification and security review.
6. Distinguish source/package support from installed availability and per-agent grants. Preserve existing live pilot scope; do not assign merge authority to all agents or use a real production merge as a connectivity test.

Build outputs: repository `dist/`, `node_modules/`, versioned npm tarball; isolated policy output `../reports/forgejo-pr-capabilities/merge-policy-dist/`; test TLS fixture `../reports/forgejo-pr-capabilities/tls-fixture/`. Preserve source and evidence; remove this task's inactive disposable outputs after verification. Deployment is a separate readback-verified step with configuration/package rollback preserved.

## v0.3 bounded feature expansion

- Audit installed Swagger and record omitted capabilities separately from recommended coding-agent gaps.
- Add repository, PR, issue, branch, commit, comment, PR-commit and PR-file reads with explicit bounded pagination.
- Add durable, identity-bound issue creation using the existing per-company/agent/repository authority boundary.
- Correct general write fingerprints to bind origin and expected Forgejo principal; reject legacy receipt replay rather than silently migrating uncertain effects.
- Qualify actual Forgejo effects on disposable pilot-only branches/PR/issue with independent reviewer/merger identities and restore temporary test permissions/tokens.
- Re-review changed source, package and upgrade via immutable local path with preimage, tool-registration and configuration equality checks.

Task outputs: `dist/`, `node_modules/`, `../reports/forgejo-expanded-features/packed-install/`; source, test logs, live IDs, review and install tarball are retained. Temporary role tokens live only in approved secret storage and must be revoked after live tests. No production repository or agent grant expansion.
