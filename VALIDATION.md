# Validation evidence

## Original v0.1 qualification

The initial implementation targeted the published `@paperclipai/plugin-sdk@2026.1012.0`, with explicit repository grants, signed webhook handling, comment and review write receipts, indexed company-scoped secret resolution and a real SDK worker lifecycle test. The original final suite passed 16 tests plus typecheck/build/package checks. Production pilot evidence is separate from source tests.

## v0.2 PR workflow qualification

- Request-validation tracer for creation was observed RED before implementation. SDK creation tests then exercised actual registered handlers, durable intent, exact PR metadata/readback, denied/changed grants, changed operation payloads and unknown outcomes without reposting.
- The controller replaced an incomplete merge-test placeholder with actual SDK handler tests. The first meaningful RED run failed because no merge handler was registered. After implementation, an async rejection exposed the missing `await` in the outer error boundary; it was corrected and retested.
- Installed Forgejo OpenAPI was read from its authenticated deployment's public schema endpoint, `https://git.mesh.skelm.dev/swagger.v1.json`. Actual `CommitStatus` entries use `status`, not GitHub's `state`, and do not include per-status SHA. `CombinedStatus.sha` binds the complete set to the expected commit. A positive test with the real shape was observed RED before this compatibility correction.
- Guard tests cover non-open/draft/merged/unmergeable PRs; exact head/repository; independent official approval; stale/dismissed evidence; outstanding change requests that a COMMENT cannot erase; duplicate/invalid review IDs; incomplete, empty, failed or wrong-SHA statuses.
- A clamped-page-size regression was observed RED: an approval on a short first page could hide a change request on the second page. Merge qualification now reads review pages until an empty page, bounded to ten pages, and denies overflow or duplicate evidence.
- Target-binding regressions were observed RED before corrections: identical comment bodies with the same operation ID could target different issues, and PR creation could accept readback with mismatched ID/number. Fingerprints now include effective method/path/payload; creation validates the returned PR number before path construction and matches exact IDs/numbers.
- `npm test`: **38 tests passed**, zero failures/skips, including a real SDK subprocess initialize/config replay/shutdown/natural exit test.
- `npm run typecheck`: passed. `npm pack`: produced a real v0.2.0 tarball containing manifest, worker, policy and merge implementation plus runtime SDK dependency.
- A production-dependencies-only tarball install (`--omit=dev --ignore-scripts`) passed an independent real loopback HTTPS fixture. It exercised the actual installed plugin through the SDK harness and real Node fetch/TLS: create PR, exact-head APPROVE review, empty-response merge and exact readbacks. Three POSTs occurred; repeating the merge did not repost, and the reviewer was denied merge authority. The test CA was scoped only to that subprocess; shared TLS validation was not changed.

Raw execution receipts and the installed OpenAPI excerpts are retained outside Git under `../reports/forgejo-pr-capabilities/`.

## Limits and operational boundaries

- No production PR was opened, reviewed or merged as a connectivity test. Local HTTPS/SDK evidence is not an authenticated production-agent workflow.
- New tool registration does not grant agent access. Existing company/repository grants and tool-profile bindings remain unchanged unless separately configured and read back.
- Merge methods are `merge` and `squash`; exact head, current independent approval and nonempty successful commit statuses are mandatory. Important target branches also need Forgejo's server-side protection: client preflight is not an atomic approval/check snapshot.
- Review qualification is bounded; excessive/incomplete evidence fails closed. Workers must remain single-consumer because state persistence and local serialization are not a cross-process lock.
- Historical pre-v0.2 write receipts are not rewritten. Their different fingerprint rejects replay rather than risking a duplicate effect. Unknown effects always require explicit reconciliation.
- Webhooks still mirror only `opened` items; PR merge/close/comment synchronization and automatic Paperclip task completion are not implemented.
- `/api/v1/user` principal validation must be supported by the chosen write credential; repository-selected token limitations do not authorize broader token scopes.

## Generated output lifecycle

The tarball is the install/rollback artifact. Source, tests, receipts and deployed or rollback packages are retained. Agent-created `dist/`, build/test `node_modules/`, isolated policy output, disposable production-only test installation and local TLS fixture are removable only after final checks and fresh active-reference/nested-mount checks. Retained outputs and actual reclaimed space are reported separately at task completion.
