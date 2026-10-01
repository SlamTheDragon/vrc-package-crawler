# Web Platform and Operator Dashboard Specification (Candidate)

> **Document Status:** Post-Production Candidate Specification  
> **Target Subsystem:** Web Frontend, Operator Control Plane, and Downstream Registry Dashboard  
> **Source Directory:** `src-web/`

---

## 1. Overview and Architectural Role

The **Web Platform** (`src-web`) serves as the public landing page, legal portal, and authenticated Operator Control Panel:

1. **Public Informational Portal & Landing Page (Unauthenticated)**:
   - **Landing Page**: Explains the discovery engine's purpose, scope, unauthenticated indexing architecture, and zero-binary principles.
   - **Terms of Service (ToS) & Legal Disclosures**: Publishes in-band covenants, RFC 9309 robots compliance, `User-Agent` contact details, and fair-use indexing boundaries (`LEGAL.md`).
   - **Node Binary Distribution**: Distributes compiled headless Crawler Node binaries (`vrc-node` for Linux VPS and Windows CLI) and the Windows GUI Crawler Client.
   - **Database Statistics**: Displays live aggregated statistics and metrics of the canonical database (package counts, platform fronts, freshness, and crawl coverage).
   - **Creator Self-Service Opt-Out**: Provides instructions and validation tracking for non-scraping delisting requests.
   - **Public API Documentation**: Documents the public catalog endpoints (`/v1/catalog`, `/v1/catalog/delta`).

2. **Authenticated Web Operator Panel (Firebase Auth + Cloudflare Bridge)**:
   - **Node Registration & Workforce Management**: Provisions new Crawler Nodes and Crawler Clients, evaluates coverage needs, and issues capability-encoded tokens.
   - **Downstream Application Registry**: Registers and manages downstream consumer applications (desktop managers, ALCOM, VCC), issuing application tokens for search/sampling APIs.
   - **Endpoint Utilization**: Exercises and utilizes the coordinator's API surface (`/v1/operator/*`, `/v1/catalog/*`).
   - **Discovery Lead Triage**: Interface to review, approve, or reject pending candidate leads.
   - **Auto-Queue Rules Editor**: Configures path-scoped, rate-limited, expiring rules.
   - **Source-Access Profile Manager**: Grants reviewed permissions for specific target domains and paths.
   - **Canonical Catalog Explorer**: Inspects projected packages, versions, and multi-storefront identity links.

---

## 2. Decoupled Two-Tier Architecture

```mermaid
flowchart TD
    subgraph Browser Client
        UI["SvelteKit Operator Dashboard (src-web)"]
    end

    subgraph Authentication & Gateway
        AUTH["Firebase Auth / Operator Session"]
        RELAY["API Gateway Proxy"]
    end

    subgraph Crawler Network
        COORD["Coordinator API (/v1/operator/*)"]
    end

    UI -->|JWT Bearer| AUTH
    UI -->|Relayed Requests| RELAY
    RELAY -->|COORDINATOR_OPERATOR_TOKEN| COORD
```

- **Air-Gapped Isolation**: User accounts, private lists, and authentication state stay isolated on `src-web`. The coordinator backend keeps zero user tables.
- **Operator Token Relay**: The dashboard calls coordinator `/v1/operator/*` routes through an authenticated relay that supplies the 256-bit `COORDINATOR_OPERATOR_TOKEN`.
- **Downstream Package Consumers**: External package managers (ALCOM, VCC) query the public catalog stream without operator privileges.

---

## 3. Technology Stack and Key Guidelines

- **Framework:** Svelte / SvelteKit with TypeScript.
- **Styling:** Tailwind CSS with strict baseline UI standards (clear visual hierarchy, accessible contrast ratios, tabular numbers for metrics).
- **Protocol Package:** Imports strongly-typed DTOs and API clients from workspace package `vrc-packages-api` (`src-package/`).
