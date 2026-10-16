# Paperclip Forgejo connector

Installable Paperclip worker targeting `@paperclipai/plugin-sdk` **2026.1012.0**. Disabled unless `enabled: true` is explicitly configured.

## Repository and agent authority

Every grant names an exact `owner/repository`, company, agent, Forgejo username, allowed operations, read secret reference and optional write secret reference. Registering a tool does not grant it to an agent: Paperclip tool profiles, this plugin's repository grant and the Forgejo credential/repository permissions must all allow the operation.

Recommended separation: implementers open PRs, independent reviewers submit reviews, and the authorized Lead merges. Review authority does not imply merge authority. Secrets remain in Paperclip secret storage; no token belongs in a tool call or issue body. Shared local execution is not OS-level agent isolation.

## Tools

- Reads: `get_repository`, `get_pull_request`, `get_issue`, `list_comments`, `list_branches`, `get_commit`, `list_pull_commits`, `list_pull_files`, plus `list_pull_requests`, `list_issues`, `get_pull_diff`, `list_reviews`, `get_commit_statuses`.
- List tools accept explicit bounded `page` and `limit`; a page is not a claim of completeness. Continue pagination until an empty page when full enumeration matters.
- `create_issue`: create an open issue with explicit title/body and operation ID; no implicit labels, assignees, milestones or closing. Exact author, fields, ID, number and repository are verified.
- `post_comment`: explicit issue/PR comment.
- `create_pull_request`: open a PR between existing branches in the same granted repository. Supply `head`, `base`, `title`, `body`, and a unique `operationId`. This does not push a branch or commit, create a fork, or enable cross-repository PRs.
- `submit_review`: submit `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`, with `number`, `body`, exact full `commitSha`, and `operationId`. The commit must still be the PR head.
- `merge_pull_request`: merge an explicitly named PR and exact full `commitSha`, with an explicit `mergeMethod` and `operationId`. The PR must be open, non-draft, mergeable, independently approved on that head, without unresolved current-head change requests, and have complete successful commit-status evidence. Forgejo branch protections still apply. Forced merge, delayed auto-merge and branch deletion are always disabled.

All writes require an explicit operation grant and a write secret. Credentials are checked against the configured Forgejo principal before writing. Existing principal preflight uses `/api/v1/user`; a token that cannot access that endpoint is rejected, not silently widened. Forgejo repository-selected token compatibility must be checked separately.

## Durable write handling

Each write has a caller-supplied operation ID bound to its effective request. Reusing it for a different request is rejected. Intent is stored before the POST, and the exact returned object is read back before reporting success. Creation verifies the PR author, fields, refs and repository identity. Merge handles Forgejo's empty success response and verifies the merged PR, expected head, merge commit and merger.

Known submitted effects are reconciled without reposting. Unknown effects are not automatically replayed; inspect the exact Forgejo target and plugin receipt before recovery. A new operation ID is not a safe workaround for an unknown outcome. The expanded request fingerprint includes target API path, configured origin and expected Forgejo principal. Receipts from earlier fingerprint formats use a different fingerprint and are rejected on replay rather than migrated or reposted; reconcile those historical effects manually.

Serialization is process-local. Run one worker for this plugin; the state API does not establish a cross-worker atomic claim. Forgejo's exact-head merge condition and branch protections remain the final external enforcement. Plugin preflight reads are not an atomic approval/check snapshot; protect important target branches in Forgejo rather than relying on client checks alone.

## Webhooks

Signed raw-byte `X-Forgejo-Signature`, `X-Forgejo-Event` and `X-Forgejo-Delivery` are checked against exact repository/company grants. Intake serializes handling and persists delivery/effect deduplication. Only `opened` issue/PR events are mirrored into Paperclip with `originKind: plugin:paperclip.forgejo`; subsequent comments/merge/close state are not synchronized, and a merged PR does not automatically complete a Paperclip task.

## Configuration

Configure a bare HTTPS `baseUrl`, a `webhookSecret` SDK secret-ref binding, and nonempty `repositories`. Each grant has `name`, `companyId`, `agentId`, `forgejoUsername`, `allowedOperations`, `readSecret`, and (when writes are allowed) `writeSecret`. Secret references use UUID secret IDs. Begin disabled and inspect exact grants before enabling. New tools do not change existing grants or profile bindings.

The webhook endpoint uses `endpointKey: forgejo`. Subscribe only to `issues` and `pull_request`. Private destination allowlisting in Forgejo is a separate operator-controlled policy.

## Private HTTPS instances

Standard Node `fetch` deliberately supports operator-configured private Forgejo origins because this installed host's `ctx.http.fetch` rejects private IPs. Calls use fixed API templates, reject redirects, validate inputs, verify TLS, and bound response time and bytes. The configured HTTPS origin is trusted operator input; network/DNS policy remains the operator's responsibility.

## Build and qualification

```sh
npm ci
npm test
npm run typecheck
npm run pack:check
```

See [VALIDATION.md](VALIDATION.md) for actual execution evidence and limits. Local fixture success is not proof that production agents have the required tool profile, grant, credential or branch permissions. Do not approve or merge a production PR merely as a connectivity test.

## Deliberately excluded capabilities

This is a scoped coding-agent connector, not a Forgejo administrator. It does not expose account/team/repository administration, secrets, hook/protection changes, branch deletion, file/source mutation, CI-status publication, releases/packages, or arbitrary API execution. Issue/PR editing, labels/assignees/milestones, inline reviews, forks and later-event synchronization remain separate future work requiring explicit mutation/reconciliation and authority contracts. CI-status publishing is intentionally unavailable so code authors cannot self-certify required checks through this plugin.
