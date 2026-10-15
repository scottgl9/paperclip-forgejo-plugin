# Paperclip Forgejo connector v0.1

Installable Paperclip worker targeting `@paperclipai/plugin-sdk` **2026.1012.0**. The plugin is disabled unless `enabled: true` is explicitly configured.

## v0.1 scope

- Per-company, per-agent repository grants. Every grant names the exact `owner/repository`, Forgejo login, allowed tool operations, a read secret reference, and (only when a write is allowed) a write secret reference.
- Read tools: pull requests, issues, pull diff, reviews, and commit statuses (bounded to 30 items or a 100 KB response).
- Explicit writes: comments and reviews require a caller-supplied operation ID. Review submission requires a full 40-character commit SHA and checks that it is still the pull request head. Writes persist intent state, verify the returned object by reading it back (including configured Forgejo author, body, and review SHA/state), and never automatically replay an unknown outcome. A known returned ID is reconciled on subsequent calls.
- Webhooks: signed raw-byte `X-Forgejo-Signature`, with `X-Forgejo-Event` and `X-Forgejo-Delivery`; exact repository-to-company allowlist matching, serialized handling, durable delivery deduplication, and `opened` issue/PR linking to Paperclip with `originKind: plugin:paperclip.forgejo`. The payload used for effects is parsed only from the bytes that were verified.

## Explicit exclusions

There is no merge tool. Webhook v0.1 only mirrors `opened` events; it does not mirror later comments, close/merge state, or infer task completion from a merged pull request. It does not expose arbitrary API paths or allow write operations unless explicitly granted to that agent. These limitations are deliberate, not implied support.

## Configuration outline

Configure a bare HTTPS origin, a secret-ref webhook signing key, and a non-empty repository grant list. A grant has `name`, `companyId`, `agentId`, `forgejoUsername`, `allowedOperations`, `readSecret`, and optional `writeSecret`. Secret references must use the SDK `EnvSecretRefBinding` shape and UUID secret IDs. Start with `enabled: false`; set it true only after reviewing grants and origin.

Register the Forgejo webhook endpoint at Paperclip's plugin webhook URL for `endpointKey: forgejo`, and subscribe only to `issues` and `pull_request`. Forgejo signature verification uses the exact raw request bytes.

### Private HTTPS instances

The connector uses standard Node `fetch` deliberately: the installed Paperclip host `ctx.http.fetch` rejects private-IP destinations, which blocks private Forgejo deployments. The configured origin is an operator-trusted, fixed HTTPS origin; runtime requests are constructed only from fixed API route templates and validated values, redirects are rejected, and each call is timed out and response-bounded. No user-supplied URL or arbitrary path is accepted. Network/DNS policy for that configured origin remains an operator responsibility.

## Build and test

```sh
npm ci
npm test
npm pack
```

See [VALIDATION.md](VALIDATION.md) for real SDK harness, fixture-transport, and packaging evidence. No live Forgejo/Paperclip service or secret is used by tests.
