# Current Source Reference

This directory describes current code capabilities. Candidate details still need comparison with executable source. Owner decisions and open work remain in [the canonical ledger](../scratch/IMPLEMENTATION_PLAN.md).

| Component | Current source | Reference |
| --- | --- | --- |
| API coordinator | `src-worker/src/`, entry `worker_entry.ts`, D1 storage | [Crawler network](SPECIFICATION_CRAWLER_NETWORK.md) |
| Headless node | `src-crawler/src/`, binary `vrcp-crawler-node` | [Node and desktop client](SPECIFICATION_CRAWLER_CLIENT.md) |
| Desktop starter | `src-crawler-client/`, Tauri/Svelte, no bundled node | [Node and desktop client](SPECIFICATION_CRAWLER_CLIENT.md) |
| Static website starter | `src-web/`, Astro/Svelte, no panel or SDK integration | [Website](SPECIFICATION_WEBSITE.md) |
| Consumer contracts | `src-package/`, package `vrc-packages-api` | [API routes](API_ROUTES.md) |
| Storage and logging | Worker D1, node-local `node.db`, structured logs | [Database schemas](DATABASE_SCHEMAS.md) |

API route status separates implemented and planned endpoints. Database tables and broader safeguards still need a field-by-field audit. A candidate specification does not prove deployment, ownership verification or complete recovery.
