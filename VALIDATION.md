# Validation evidence

- Targeted the real published `@paperclipai/plugin-sdk@2026.1012.0`; direct runtime dependency is exact-pinned in `package.json`/`package-lock.json`. TypeScript compilation uses its published declarations and SDK `createTestHarness`.
- TDD evidence: the first list/review behavior test failed with `invalid item number` when issue/PR lists required a nonexistent `number`; after fixing the operation-specific validation, the test passed. The SDK write test then failed because repeating a verified `operationId` issued a second POST (`2 !== 1`); persisted verified-intent handling removed the replay and the test passed. The Forgejo principal preflight test initially failed because `/api/v1/user` was outside the fixed-path allowlist; adding only that exact endpoint and checking the configured login before POST made it pass. Webhook tests pass intentionally mismatched `parsedBody` versus signed `rawBody` and verify raw-body-only routing.
- `npm test` — passed; 14 tests, including an adversarial issue-create timeout after commit, a temporarily hidden matching issue, retries under a different delivery ID, and later reconciliation without a second create. This demonstrates restart-safe behavior through harness-persisted state semantics; it does not prove multi-worker atomic claiming.
- `onConfigChanged(config, scope)` requires a nonempty company ID, accepts disabled configs, and validates enabled configs without retaining worker-global tenant config. `multiCompanyConfig: true` opts into distinct company-scoped config replay; tool handlers continue reading `host.config.get(runCtx.companyId)` and resolving secrets against that run scope.
- Real SDK subprocess regression `test/multicompany-worker.test.mjs` launches the built worker and sends initialize, distinct configChanged messages for company A/B, then shutdown; it verifies supported hook, successful responses, and natural exit code 0. Negative control with `multiCompanyConfig: false` failed as expected with SDK `CROSS_TENANT_CONFIG` (-32006).
- `npm test` — passed; 16 tests including real SDK subprocess regression and config-scope validation. `npm run typecheck`, `npm run build`, `npm run pack:check`, and `git diff --check` — passed.
- No live Paperclip/Forgejo endpoint, stored secret, or external write was used. No commit or push was made.

## Remaining qualification boundary

The test harness validates SDK entrypoint behavior but does not launch the worker through a production Paperclip server. Private HTTPS routing is deliberately performed with standard Node `fetch` to support operator-configured private Forgejo origins; the fixed configured origin is trusted operator input, not DNS-pinned by Paperclip's `ctx.http.fetch`. Review by the parent is still required before any runtime deployment. Webhooks only mirror `opened` items; merge and later-state synchronization are out of scope.

## Retained generated outputs

- `node_modules/` — exact pinned build/test dependencies; retain for parent review.
- `dist/` — compiled worker/package output; retain for package and host smoke review.
- `paperclip-forgejo-plugin-0.1.0.tgz` — packed install artifact; retain for parent package inspection.
- `paperclipai-plugin-sdk-2026.1012.0.tgz` — fetched published SDK reference tarball used for type/API inspection.
