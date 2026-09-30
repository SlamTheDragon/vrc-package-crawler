# Web Platform & Operator Dashboard Specification (Candidate)

> **Document Status:** Post-Production Candidate Specification  
> **Target Subsystem:** Web Frontend, Operator Control Plane, and Downstream Registry Dashboard  
> **Source Directory:** `src-web/`

---

## 1. Overview & Architectural Role

The **Web Platform** (`src-web`) serves as the dual-surface user interface and operator control plane for the VRChat package discovery engine:
1. **Public Informational Portal (Unauthenticated)**:
   - Homepage explaining the discovery engine purpose, scope, and zero-binary principles.
   - Transparent policies: RFC 9309 robots compliance, `User-Agent` contact details, and creator rights covenants.
   - Creator self-service opt-out instructions and automated delisting status tracker.
   - Public API documentation and terms notice (`LEGAL.md`).
2. **Authenticated Operator Dashboard**:
   - Live telemetry and health metrics of active coordinator instances and decentralized crawler nodes.
   - Discovery lead triage: interface for reviewing, approving, or rejecting pending candidate leads.
   - Auto-queue rules editor: configuring path-scoped, rate-limited, expiring rules.
   - Source-access profile manager: granting reviewed permissions for specific target domains and paths.
   - Canonical catalog explorer: inspecting projected packages, versions, and multi-storefront identity links.

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

- **Air-Gapped Isolation**: End-user accounts, private lists, and authentication state remain strictly isolated on `src-web`. The coordinator backend maintains zero user tables.
- **Operator Token Relay**: The dashboard communicates with the coordinator's `/v1/operator/*` routes via an authenticated relay supplying the 256-bit `COORDINATOR_OPERATOR_TOKEN`.
- **Downstream Package Consumers**: External package managers (ALCOM, VCC) query the public catalog stream without requiring operator privileges.

---

## 3. Technology Stack & Key Guidelines

- **Framework:** Svelte / SvelteKit with TypeScript.
- **Styling:** Tailwind CSS with strict baseline UI standards (clear visual hierarchy, accessible contrast ratios, tabular numbers for metrics).
- **Protocol Package:** Imports strongly-typed DTOs and API clients from workspace package `vrc-packages-api` (`src-package/`).
