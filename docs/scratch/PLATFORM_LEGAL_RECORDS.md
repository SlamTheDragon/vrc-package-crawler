# Platform Legal Records

Status: Active legal and operational records for candidate storefront platforms.
Date of consolidation: 2026-09-30.

## Overview Table

| Platform | Reviewed Date | Terms Version | Robots.txt Status (RFC 9309) | Operational Risk Rating | Next Review Date |
| --- | --- | --- | --- | --- | --- |
| **BOOTH.pm** (pixiv Inc.) | 2026-09-24 | pixiv Master Terms of Use (Article 14) | Operational preference signal | Medium Risk (Jurisdiction-Dependent) | 2026-10-24 |
| **Gumroad** (Gumroad, Inc.) | 2026-09-24 | Effective 2025-01-01 (Updated 2026-09-14) | `Allow: /` for public storefront paths | Low Risk (Conditional) | 2026-10-15 |
| **Jinxxy** (Jinxxy Technologies, LLC) | 2026-09-24 | Online Terms of Service (Sections 8.2 and 23) | Operational preference signal | High Risk (Unresolved Contractual Risk) | 2026-10-24 |

## Platform Details

### 1. BOOTH.pm

| Attribute | Value |
| --- | --- |
| **Platform** | BOOTH.pm (pixiv Inc.) |
| **Date Reviewed** | 2026-09-24 |
| **Terms Version** | pixiv Master Terms of Use (Article 14) |
| **Effective Date Note** | Continuous online effectiveness. |
| **Robots.txt Status** | Evaluated under RFC 9309 as an operational preference signal. |
| **Access Method** | Unauthenticated HTTP GET requests against public item pages. |
| **Authentication Status** | Logged-out public guest only. No credentials or session cookies. |
| **Data Collected** | Item names, creator handles, prices in JPY, category tags, canonical storefront URLs. |
| **Data Excluded** | Creator biographies, private messages, binary files (`.unitypackage`, `.zip`), transaction data. |
| **Relevant Clauses** | Article 14 restricts automated data collection and server load. Standard form contract rules apply under Japanese Civil Code Article 548-2. |
| **Statutory Interaction** | Japanese Copyright Act Article 30-4 and Article 47-5 permit data analysis and search indexing. But statutory copyright exceptions do not create affirmative contractual licenses. |
| **Legal Uncertainty** | Potential tension exists between statutory search indexing exceptions and private platform terms under Japanese law. |
| **Operational Risk Rating** | Medium Risk (Jurisdiction-Dependent). |
| **Operational Decision** | Enforce conservative request pacing (1.5 s baseline, 0.8 s to 5.0 s adaptive). Prioritize direct URL pointers. Deprecate persistent SQLite image caching. Stop crawling immediately upon platform objection or access barrier. |
| **Next Review Date** | 2026-10-24 |

### 2. Gumroad

| Attribute | Value |
| --- | --- |
| **Platform** | Gumroad (Gumroad, Inc.) |
| **Date Reviewed** | 2026-09-24 |
| **Terms Version** | Effective 2025-01-01 (Updated 2026-09-14) |
| **Effective Date Note** | September 14 revisions bind existing accounts on 2026-10-14. |
| **Robots.txt Status** | Evaluated under RFC 9309 (`Allow: /` for public storefront paths). |
| **Access Method** | Unauthenticated HTTP GET requests against public creator storefronts. |
| **Authentication Status** | Logged-out public guest only. No credentials or session cookies. |
| **Data Collected** | Package names, creator usernames, prices, platform tags, canonical storefront URLs. |
| **Data Excluded** | Product binary files (`.unitypackage`, `.zip`), seller analytics, customer lists, checkout tokens. |
| **Relevant Clauses** | Gumroad Terms Section 14(e) permits spiders that create publicly available searchable indices, excluding caches or archives. |
| **Legal Uncertainty** | Existing account binding date transition between 2026-09-14 and 2026-10-14. |
| **Operational Risk Rating** | Low Risk (Conditional). |
| **Operational Decision** | Continue unauthenticated crawling with 3.0-second baseline request delay (2.5 s to 12.0 s adaptive). Keep binary package exclusion policy and guest access status. |
| **Next Review Date** | 2026-10-15 |

### 3. Jinxxy

| Attribute | Value |
| --- | --- |
| **Platform** | Jinxxy (Jinxxy Technologies, LLC) |
| **Date Reviewed** | 2026-09-24 |
| **Terms Version** | Current online Terms of Service (Sections 8.2 and 23) |
| **Effective Date Note** | Continuous online effectiveness. |
| **Robots.txt Status** | Evaluated under RFC 9309 as an operational preference signal. |
| **Access Method** | Unauthenticated HTTP GET requests against public listing pages. |
| **Authentication Status** | Logged-out public guest only. No credentials or session tokens. |
| **Data Collected** | Package names, creator handles, price points, platform tags, canonical storefront URLs. |
| **Data Excluded** | Creator biographies, private emails, Discord handles, product binary archives, checkout sessions. |
| **Relevant Clauses** | Sections 8.2 and 23 prohibit automated access, spiders, and systematic retrieval without prior written consent. |
| **Legal Uncertainty** | Unresolved contractual risk. The legal effect of website terms on unauthenticated crawlers is fact-specific and unresolved. Jinxxy did not grant written consent. |
| **Operational Risk Rating** | High Risk (Unresolved Contractual Risk). |
| **Operational Decision** | Keep serialized request pacing (1.2 s baseline, 0.8 s to 6.0 s adaptive). Stop crawling immediately if Jinxxy disallows the User-Agent in robots.txt or communicates an objection. Keep a fast delisting response target. |
| **Next Review Date** | 2026-10-24 |
