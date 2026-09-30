# Decision Table Matrix

> **Canonical Source:** [`docs/decisions/DIRECTION.md`](DIRECTION.md) §8
> **Companion Document:** [`docs/scratch/decisions/OPERATOR_QUESTION_QUEUE.md`](OPERATOR_QUESTION_QUEUE.md)

This decision table matrix records architectural and dependency evaluations across the system.

| Ref | Topic | Candidate / Subject | Rationale & Trade-offs | Disposition |
|---|---|---|---|---|
| **T-01** | Crawler Framework | Crawlee / Puppeteer / Playwright | Heavier runtime footprint; bypasses granular per-origin lease tokens and strict RFC 9309 robots enforcement. | **Rejected** (Keep custom pinned transport) |
| **T-02** | Robots.txt Parser | `@chrmod/robots-parser` | Fully RFC 9309 compliant, handles merged records and encoded wildcards cleanly. | **Adopted** |
| **T-03** | Schema Validation | Zod 3 / Zod 4 | Type inference + runtime boundary validation across loopback API and configuration. | **Adopted** |
| **T-04** | Storage Engine | `bun:sqlite` with WAL | Single-file zero-configuration zero-latency database with native prepared statements. | **Adopted** |
| **T-05** | Distributed Coordination | Coordinator leases + loopback HTTP | Separates untrusted network crawler nodes from central catalog authority. | **Adopted** |
| **T-06** | Node Database | `node.db` (`LocalNodeStore`) | Tracks run lifecycle, claimed tasks, fetch duration, and submission status locally without catalog writes. | **Adopted** |
| **T-07** | Same Directory Coexistence | Dual-config dual-db pattern (`coordinator.*` and `node.*`) | Allows node and coordinator to be spawned in identical folder without file or WAL conflict. | **Adopted** |
| **T-08** | Web Frontend | SvelteKit + Tailwind 4 (`src-web`) | Lightweight reactive dashboard for operator lead review and node status monitoring. | **Staged** |
| **T-09** | Image Processing | Sharp in dedicated worker | Avoids native memory leaks during image metadata extraction and hashing. | **Adopted** |
| **T-10** | Content Hashing | SimHash (64-bit) + CJK normalization | Deduplicates titles and descriptions across Japanese and Western storefront mirrors. | **Adopted** |
| **T-11** | GitHub Rate Scaling | Scoped `Authorization: Bearer` with `GITHUB_TOKEN` | Safely scales from 60 req/hr to 5,000 req/hr for `api.github.com` metadata queries while isolating credentials from loopback and third-party traffic. | **Adopted** |
| **T-12** | Database Pagination | Keyset pagination using `(created_at, id)` | Eliminates $O(N^2)$ table scan degradation on large crawl backlogs compared to `OFFSET/LIMIT`. | **Adopted** |
| **T-13** | Identity Link Review | Explicit state machine (`provisional` -> `accepted` / `rejected`) | Enforces relational foreign keys and prevents heuristic clustering algorithms from silently corrupting canonical catalog state. | **Adopted** |
| **T-14** | Exponential Backoff | Dynamic backoff via CircuitBreaker | Replaces inflexible multi-day lockouts with bounded exponential backoff, recovering gracefully from transient Cloudflare Turnstile challenges. | **Adopted** |

