# Validation and known limits

This document summarizes qualification of the source releases. It is not a live deployment status page or a guarantee that every agent has access. This summary omits private deployment identifiers; raw execution logs, credentials and backups belong outside Git.

## v0.3 qualification

The final candidate passed:

- 50 automated tests, with no failures.
- TypeScript typecheck and npm package checks.
- Production-dependencies-only package installation and SDK worker initialization, configuration replay, invalid-configuration rejection, shutdown and natural exit checks.
- Independent review of the final candidate.

An isolated acceptance test exercised all 18 tool types through the candidate plugin and SDK harness against Forgejo 16.0.3 over HTTPS. It covered repository and issue reads, issue creation and comments, PR creation, independent approval, guarded merge and exact readbacks. Repeated create/merge calls did not duplicate effects. Reviewer merge attempts and merges before qualification were denied.

Only disposable pilot branches, an issue and a PR were used. The issue was closed; the PR was merged into a disposable base branch, not the repository's main branch. Temporary collaborator permissions were restored and temporary tokens revoked, with rejected-token readbacks. Test status evidence was explicitly test-only, not a production CI result or a plugin capability.

Live testing exposed an incorrect review event: the public tool accepts `APPROVE`, but Forgejo requires wire event `APPROVED`. A failing regression test preceded the correction. Earlier fixture success did not establish compatibility with the actual Forgejo review endpoint.

A read-only reviewer produced nonofficial review evidence. The pilot required temporary reviewer write access to obtain the official independent approval required by the merge policy. Separate plugin operations do not establish merge-only or review-only isolation in Forgejo itself.

## Regression coverage

The suite covers:

- Explicit company, agent, repository and operation grants; indexed company-scoped secret resolution.
- Bounded inputs, fixed API routes, pagination and transport limits.
- Signed raw-byte webhooks and durable delivery/effect deduplication.
- Write intent before POST, exact returned identifiers and object readbacks, changed-request rejection and unknown outcomes without automatic reposting.
- Receipt fingerprints bound to effective method, path, payload, configured origin and expected principal.
- Open, non-draft, mergeable PRs at the exact expected head and repository.
- Current, independent, official approval; stale or dismissed reviews; unresolved change requests that comments cannot erase; duplicate or invalid review evidence.
- Complete, nonempty successful commit statuses bound to the expected SHA. Forgejo's individual status field is `status`, while the combined response supplies `sha`.
- Review enumeration until an empty page, with bounded overflow and duplicate evidence denied. A short page is not treated as proof of completeness.
- Empty merge success responses, subsequent merged-PR readback and asynchronous error handling.

## Earlier releases

- v0.1: 16 tests plus typecheck, build and package checks qualified the initial reads, comment/review receipts, signed webhook intake and worker lifecycle.
- v0.2: 38 tests plus typecheck, packaging and a production-only HTTPS fixture qualified PR creation and guarded merges. The fixture exercised handlers, real Node fetch/TLS, duplicate prevention and denied reviewer merges. The later v0.3 live test found and corrected its missed review-event compatibility issue.

These are historical test counts, not a requirement to preserve an exact count or a substitute for checking a new candidate.

## OAuth feasibility: provider proof only

A separate restricted-account proof against Forgejo 16.0.3 passed 22 checks. It exercised the real sign-in and consent endpoints with an isolated HTTP session, authorization-code exchange with PKCE S256, exact callback state, rejection of an incorrect verifier and reused code, identity and repository reads, denial of another private repository, refresh, and revocation after temporary application deletion. The account's repository permissions were unchanged.

This was not browser UI automation, Paperclip callback qualification, or an OAuth-enabled plugin release. The installed Paperclip OAuth flow has no supported plugin binding for consuming its managed connection tokens. Token ownership, refresh, disconnect and authorization checks need a reviewed integration before the plugin can offer browser-based connection.

Forgejo 16.0.3 has an optional `ENABLE_ADDITIONAL_GRANT_SCOPES` setting, disabled by default. With enforcement disabled, requested OAuth scopes must not be treated as PAT-equivalent restrictions: authorizing-account access is the boundary. The proof used a restricted account and did not change the shared setting. Production OAuth access requires a separate permission review.

## Remaining boundaries

- Real plugin/SDK acceptance is not an autonomous Paperclip agent-run acceptance. Production tool profiles, repository grants, credentials and branch permissions must be qualified separately.
- Registering tools does not grant access. New operations do not expand existing grants or bindings.
- Merge methods are `merge` and `squash`. Important branches also need Forgejo server-side protection: client preflight is not an atomic approval/check snapshot.
- State persistence and process-local serialization are not a cross-worker lock. Run one worker for this plugin.
- Historical receipt fingerprints are not migrated. Replay with a changed fingerprint is rejected; uncertain effects require manual reconciliation, not a new operation ID.
- Webhooks mirror only opened issues and PRs. Later comments, merge/close state and automatic Paperclip task completion are not synchronized.
- Write credentials must support `/api/v1/user` principal validation. Repository-selected token compatibility must be checked rather than solved by silently widening scopes.
- Browser OAuth setup and native Apps/Connectors catalog integration are not implemented in v0.3.

## Artifact handling

Keep source, unique qualification evidence and required deployed/rollback packages. Credentials and backups stay outside Git. Disposable build output, dependency installs and fixture packages may be removed only after verification and fresh checks for active references. No production PR should be approved or merged merely to test connectivity.
