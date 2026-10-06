# Cryptographic delegation resource library

Reviewed 2026-10-04; owner direction reconciled 2026-10-06 under R54-C38/G15. Research is not protocol approval. Downstream apps check storefront challenges. The Worker accepts authenticated requests from admitted verifiers for manual operator/staff review, without storefront access or crawler-fleet work. See [the API audit and trust-boundary diagram](API_CONTRACT_REVIEW.md#delegated-creator-removal--g15-proposal-2026-10-04) and [the decision queue](UNMERGED_IMPLEMENTATION_PLAN.md). Earlier immediate-removal proposals are superseded.

## Separate three claims

| Claim | Evidence that can support it | Evidence that cannot replace it |
| --- | --- | --- |
| The sender holds an approved app key. | Valid message authentication under a registered, active key. | A public bio token or generic login alone. |
| The app can request this action on this target. | Current verifier permission and target/scope policy. | Key possession without an authorization grant. |
| The creator controlled the stated front during the challenge. | The approved app's checked observation and creator/front mapping. | A signature alone. The Worker trusts the verifier's statement. |

No choice of encryption can make an authorized malicious verifier tell the truth. Admission, audit, revocation and recovery are part of the design. Cryptography limits impersonation, tampering and replay. It does not remove that trust boundary.

## Pattern comparison

| Pattern and primary reference | What to reuse | Limit for this repository | Assessment |
| --- | --- | --- | --- |
| Authenticator codes: [HOTP, RFC 4226](https://www.rfc-editor.org/rfc/rfc4226.html), [TOTP, RFC 6238](https://www.rfc-editor.org/rfc/rfc6238.html) | Freshness, per-prover secrets, rate limits and single-use handling. TOTP derives a short code from a secret and time step. | Ordinary TOTP does not bind target, removal action or evidence. Public bio placement also exposes the code. Time validity is not an ownership proof. | Useful for account step-up, not the removal envelope. Prefer a random public challenge plus authenticated action data. |
| Payment-webhook pattern: [Stripe signatures](https://docs.stripe.com/webhooks/signature), [duplicate handling](https://docs.stripe.com/webhooks#handle-duplicate-events) | Authenticate exact message bytes, distinguish environment secrets, identify events and resist duplicate delivery. | A trusted payment provider supplies payment facts. Here each admitted app supplies its own verification claim. Do not infer equivalent trust from app registration. | Closest operational analogy. Adopt the checks, not Stripe's payment API or event schema. |
| Public-key app attestations: [JWS, RFC 7515](https://www.rfc-editor.org/rfc/rfc7515.html), [JWT security, RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html) | App signs with its private key. Worker holds its public key. Standard formats support protected headers and authenticated payloads. | Key enrollment must establish app identity. Pin accepted algorithms, issuer, audience and token type. Public-key validation still cannot prove the underlying observation. | Strong alternative to shared-secret custody. Measure runtime and operational costs before choosing. |
| Shared-secret app attestations: [HMAC, RFC 2104](https://www.rfc-editor.org/rfc/rfc2104.html) | One secret per approved app. Authenticate the complete action statement, not only a short code. | Both parties can generate a valid MAC. Worker key compromise can enable forged app statements. Separate keys from hashed bearer credentials. | Fits the owner's candidate. Compare raw signed-body envelopes with standardized JWS HS256 instead of inventing token encoding. |
| Transaction-scoped delegation: [OAuth Rich Authorization Requests, RFC 9396](https://www.rfc-editor.org/rfc/rfc9396.html) | Express allowed action, location and resource scope. The RFC includes payment examples with exact transaction details. | It carries fine-grained authorization, not storefront observations. Full OAuth server deployment adds scope beyond this initial flow. | Reuse the transaction-bound permission model. Do not build an authorization server without a demonstrated need. |
| Sender-bound access tokens: [DPoP, RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html) | Bind token use to a client's key and request context. | DPoP's HTTP coverage is method and URI, not the full request body. It does not replace an authenticated removal statement. | Later transport hardening if bearer theft warrants it. Not the first attestation mechanism. |

## Payment analogy applied to this system

The useful analogy is a trusted verifier's authenticated event, recorded once. Do not imitate card cryptograms, acquire payment credentials or integrate a card network for this feature. The current owner direction requires manual review. Distinguish accepted intake from a later committed action; an intake receipt is not removal approval.

Candidate sequence:

1. Admit the app as a verifier and register its dedicated key.
2. Bind a fresh public challenge to the app, target, requested action and expiry.
3. The creator places the challenge at the accepted control location.
4. The app checks that location under applicable access rules.
5. The app authenticates an attestation of its check and requested action.
6. The Worker checks app authority, key, payload, target mapping, expiry and replay without external fetch.
7. The Worker atomically records a pending request, consumed identifier and intake receipt.
8. An authorized operator/staff decision applies a scoped action with its audit, or rejects the request without a new suppression.

Challenge issuer remains undecided. App-issued and coordinator-issued challenges have different state and round-trip costs. Neither requires Worker storefront access. A duplicate request with the same identity and payload needs the original receipt, not another lifecycle mutation. Reuse of its identifier with another payload must fail. Revoked credentials, concurrent replay and unrelated suppression require write-boundary checks.

## Owner's ownership-challenge model and compute budget

Owner clarification, 2026-10-04: the downstream website already knows a claimed creator/front relationship. A signed-in user asks to claim it. The website generates a token, the user places it on that canonical front, and the website checks it. This describes the proposed app-side ownership check. It does not establish how any particular VRChat ecosystem site implements the flow.

The coordinator adds a second boundary: it authenticates the app's statement about that check and records it for review. Only an authorized review decision applies removal. The public placement token is not an app credential. Bind the challenge to the requester, verifier, exact front, requested action and expiry. A successful placement shows control of the permitted location at that time. It does not establish copyright ownership or authority over every related product/front.

The website can keep this work behind its interface, but the protocol must distinguish pending verification from committed removal. Challenge issuance, account linking and removal are separate operations. A stale catalog claim is not sufficient evidence that a front still belongs to the stated creator. Challenge issuer and accepted front mappings remain decisions.

| Work | Owner in this proposal | Compute boundary |
| --- | --- | --- |
| Generate a random placement challenge | Downstream app or coordinator, undecided | Randomness and bounded state. Not mining, password cracking or proof-of-work. |
| Read the front and find the challenge | Downstream app | Network wait, access rules, bounded parsing and optional rendering. No Worker/fleet storefront check. |
| Authenticate the attestation | Coordinator | Bounded payload validation, registered-key lookup and one standard MAC/signature check. |
| Accept the request | Coordinator | Current verifier/target checks, atomic replay/intake receipt; no automatic removal. |
| Apply approved removal | Coordinator, after authorized review | Review authority, scoped action/audit and receipt. |

[Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time), checked 2026-10-04, specify 10 ms CPU per HTTP request on Workers Free. Waiting for network or database responses does not count toward CPU time. Parsing and application computation still consume CPU. Consistent overruns can terminate execution with Error 1102. Native [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) supports HMAC and public-key operations, but documentation supplies no latency guarantee for this route.

No credible millisecond estimate exists until the full handler is measured. Compare HMAC/JWS HS256 and an allowed asymmetric JWS algorithm with the same payload, authentication, key lookup and D1 transaction. Include cold/warm key import, maximum-size valid payloads, invalid signatures, replay, revoked keys and concurrent requests. Record CPU separately from wall time and D1 rows/queries. Local workerd checks can compare implementations but do not certify deployed Free-tier headroom. Later authorized staging needs [Worker CPU quantiles and invocation failures](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/#cpu-time-per-execution).

A lost response can follow a committed database action. Exact retries must return the stored receipt without another mutation. CPU failure is not proof that removal did or did not commit. Do not acknowledge committed success before the action transaction, or move the critical action into fire-and-forget work. This is a benchmark and failure-policy requirement, not an implemented route or selected algorithm.

## Existing services and packages

| Candidate | Supplied component | Still owned by this project |
| --- | --- | --- |
| [Auth0 client credentials](https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-credentials-flow) | Machine-to-machine authentication for confidential applications. | Verifier admission, creator checks, target scope and removal attestation. This is not a turnkey storefront-ownership service. |
| [Firebase custom claims](https://firebase.google.com/docs/auth/admin/custom-claims) | Privileged-server assignment of user access claims. Already relevant to the planned operator/user login stack. | App key registration and storefront proof. A Firebase user identity is not an approved app verifier. |
| [jose](https://github.com/panva/jose) | JWS/JWT/JWK implementations for Web-compatible runtimes, including Workers and Bun. Its license is MIT. | Strict application schemas, trusted key mapping, replay storage and authorization. Pinned versions, algorithms and actual runtime support need checks. |
| [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) | Native cryptographic primitives. | Standard envelope design, key lifecycle and application policy. Prefer it to handwritten cryptographic algorithms. |

These services supply parts of the flow. The reviewed documentation does not supply a turnkey verifier for BOOTH, Gumroad, Jinxxy and arbitrary storefront fronts. This is a limited finding, not proof that no specialist service exists. Provider OAuth or ownership APIs, if available for a specific storefront, need a separate scope review. Do not confuse authenticated login with authority over a catalog target.

## Candidate SDK boundary and next decisions

src-package currently exports token-prefix helpers and typed API models. It depends on zod, not jose. No signing utility, key registration, delegation grant or replay receipt exists in the inspected SDK path. Candidate exports can include strict attestation types, challenge helpers and backend-only authentication functions. Consumers supply keys at runtime. Verify these contracts before adding or distributing helpers. Checked pre-0.1 releases are allowed; v0.1.0 remains held for full owner G15 review.

Shared secrets and app private keys belong in trusted backends, not static sites or distributed desktop binaries. A device-generated key can identify a device, but does not grant it trusted-verifier status. If downstream apps have no trusted backend, resolve that topology before choosing a signing design.

Compare HMAC/JWS HS256 and asymmetric JWS against the same workload. Measure CPU, key retrieval, encoded bytes, D1 reads/writes, rotation and incident recovery. Do not claim a Free-tier saving from algorithm choice alone. Keep registered keys local to the reviewed trust map. Do not fetch an arbitrary key URL from a submitted token.

Critical owner decisions: which apps become verifiers, what one proof can remove, whether backend operation is mandatory, challenge issuer, key custody and recovery after wrongful removal. Follow with standard test vectors, algorithm-confusion negatives, altered payloads, key revocation, target mismatch, nonce races and transaction rollback. Include zero Worker/fleet verification egress and clean SDK artifact consumption. This research ran no cryptographic benchmark, package install or runtime test.
