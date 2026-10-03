# Website Source Reference

Review date: 2026-10-03. Source: `src-web/`.

## Current Implementation

The owner separated the website from the API Worker. `src-web` uses Astro with the Svelte integration. Its only page, `src/pages/index.astro`, displays starter content. Commands are `bun run dev`, `bun run build` and `bun run preview`.

`src-worker/src/worker_entry.ts` owns API endpoints and D1. The website does not import Worker storage or serve its API. No coordinator binary exists.

| Capability | Current evidence |
| --- | --- |
| Static page | Astro starter page and public icons |
| Typed API client | Not wired. No `vrc-packages-api` dependency in the website manifest |
| Operator dashboard | Not implemented |
| User/Firebase authentication | Not implemented |
| Registries, statistics, legal pages and binary distribution | Not implemented |
| Creator ownership verification or direct delisting | Not implemented. API removal reports remain pending |
| Worker deployment | Separate API project. No website deployment configuration is established by this scaffold |

## Integration Boundary

The owner intends the website to consume the SDK over HTTP. Independent npm distribution remains a prerequisite. Do not import sibling Worker TypeScript or D1 storage into the website.

Do not embed `OPERATOR_TOKEN` in static assets. Browser authentication, authenticated CORS/preflight and any trusted credential relay require a separate reviewed design. A user token authenticates a user, not ownership of every catalog item.

Use [API_ROUTES.md](API_ROUTES.md) for current route status. Future portal requirements and unresolved decisions belong in [the implementation ledger](../scratch/IMPLEMENTATION_PLAN.md), not capability claims here.
