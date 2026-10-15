# Plan — Forgejo Paperclip connector v0.1

- Build an installable TypeScript plugin against the exact published Paperclip SDK.
- Enforce explicit per-company repository grants and per-repository read/write secret refs; reject non-HTTPS origins and arbitrary API paths.
- Expose only bounded PR/issue/diff/review/status reads and explicit comment/review writes; omit merge.
- Verify Forgejo webhook signatures over raw request bytes; persist deduplication/effect state and fail closed on ambiguous delivery outcomes.
- Exercise policy and transport using local fixtures, then typecheck, build, test, and npm-pack. No live Forgejo or Paperclip writes.
