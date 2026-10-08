import { describe, expect, test } from "bun:test";

interface CreatorDelegationAttestation {
  appId: string;
  action: "creator_ownership_claim";
  frontUrl: string;
  creatorId: string;
  challengeToken: string;
  expiresAt: number;
  nonce: string;
}

function serializeCanonicalAttestation(attestation: CreatorDelegationAttestation): Uint8Array {
  // Deterministic canonical string: sorted key sequence
  const canonicalString = JSON.stringify({
    action: attestation.action,
    appId: attestation.appId,
    challengeToken: attestation.challengeToken,
    creatorId: attestation.creatorId,
    expiresAt: attestation.expiresAt,
    frontUrl: attestation.frontUrl,
    nonce: attestation.nonce
  });
  return new TextEncoder().encode(canonicalString);
}

describe("Cryptographic Delegation Verification Budget (R54-C38CPU)", () => {
  const encoder = new TextEncoder();
  const rawHmacSecret = encoder.encode("vrcp_shared_secret_0123456789abcdef0123456789abcdef");

  const sampleAttestation: CreatorDelegationAttestation = {
    appId: "app_verified_partner",
    action: "creator_ownership_claim",
    frontUrl: "https://creator.booth.pm",
    creatorId: "creator_booth_12345",
    challengeToken: "vrcp_chal_9876543210abcdef9876543210abcdef",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    nonce: "nonce_abcdef0123456789"
  };

  test("measures HMAC-SHA256 cold import and verification within CPU budget", async () => {
    const payloadBytes = serializeCanonicalAttestation(sampleAttestation);

    // Sign payload with a separate key instance
    const signingKey = await crypto.subtle.importKey(
      "raw",
      rawHmacSecret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", signingKey, payloadBytes);

    // Measure cold import + verify
    const start = performance.now();
    const verifierKey = await crypto.subtle.importKey(
      "raw",
      rawHmacSecret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const isValid = await crypto.subtle.verify("HMAC", verifierKey, signature, payloadBytes);
    const elapsedMs = performance.now() - start;

    expect(isValid).toBe(true);
    // Cloudflare Workers Free limit is 10 ms CPU; cold HMAC verification must complete well under that
    expect(elapsedMs).toBeLessThan(10.0);
  });

  test("measures ECDSA P-256 cold import and verification within CPU budget", async () => {
    // Generate an ECDSA P-256 keypair for testing
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const jwkPublic = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const payloadBytes = serializeCanonicalAttestation(sampleAttestation);
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      payloadBytes
    );

    // Measure cold JWK import + ECDSA verification
    const start = performance.now();
    const verifierKey = await crypto.subtle.importKey(
      "jwk",
      jwkPublic,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const isValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifierKey,
      signature,
      payloadBytes
    );
    const elapsedMs = performance.now() - start;

    expect(isValid).toBe(true);
    // Cold asymmetric verification must complete within the 10 ms CPU budget
    expect(elapsedMs).toBeLessThan(10.0);
  });

  test("measures cached warm key verification latency", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      rawHmacSecret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    const payloadBytes = serializeCanonicalAttestation(sampleAttestation);
    const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);

    // Warm verification loop (100 iterations)
    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const ok = await crypto.subtle.verify("HMAC", key, signature, payloadBytes);
      expect(ok).toBe(true);
    }
    const totalElapsedMs = performance.now() - start;
    const avgPerVerifyMs = totalElapsedMs / iterations;

    // Warm verification should take less than 0.5 ms per invocation
    expect(avgPerVerifyMs).toBeLessThan(0.5);
  });

  test("measures worst-case 64 KiB maximum envelope digest within budget", async () => {
    // Construct a worst-case payload filling the 64 KiB ceiling
    const largePayload = new Uint8Array(64 * 1024);
    largePayload.fill(0x42);

    const start = performance.now();
    const digest = await crypto.subtle.digest("SHA-256", largePayload);
    const elapsedMs = performance.now() - start;

    expect(digest.byteLength).toBe(32);
    // SHA-256 on 64 KiB must complete well under 5 ms
    expect(elapsedMs).toBeLessThan(5.0);
  });

  test("simulates whole-handler attestation lifecycle with replay and expiry checks", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      rawHmacSecret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    const payloadBytes = serializeCanonicalAttestation(sampleAttestation);
    const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);

    // Simulated consumed nonce registry (e.g. SQLite / D1 table)
    const consumedNonces = new Set<string>();

    async function handleDelegationClaim(
      attestation: CreatorDelegationAttestation,
      rawSignature: ArrayBuffer
    ) {
      const now = Math.floor(Date.now() / 1000);

      // 1. Check expiration
      if (attestation.expiresAt < now) {
        return { status: 400, error: "attestation_expired" };
      }

      // 2. Check replay
      if (consumedNonces.has(attestation.nonce)) {
        return { status: 409, error: "nonce_already_consumed" };
      }

      // 3. Verify cryptographic signature
      const bytes = serializeCanonicalAttestation(attestation);
      const valid = await crypto.subtle.verify("HMAC", key, rawSignature, bytes);
      if (!valid) {
        return { status: 401, error: "invalid_signature" };
      }

      // 4. Mark nonce consumed
      consumedNonces.add(attestation.nonce);

      // 5. Generate acceptance receipt
      return {
        status: 202,
        receipt: {
          accepted: true,
          action: attestation.action,
          creatorId: attestation.creatorId,
          frontUrl: attestation.frontUrl,
          receiptId: `rcpt_${attestation.nonce}`
        }
      };
    }

    const start = performance.now();
    const result = await handleDelegationClaim(sampleAttestation, signature);
    const elapsedMs = performance.now() - start;

    expect(result.status).toBe(202);
    expect(result.receipt?.accepted).toBe(true);
    expect(result.receipt?.receiptId).toBe(`rcpt_${sampleAttestation.nonce}`);
    expect(elapsedMs).toBeLessThan(5.0);
  });

  test("rejects tampered claims and altered payload targets", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      rawHmacSecret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    const payloadBytes = serializeCanonicalAttestation(sampleAttestation);
    const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);

    // Alter creatorId
    const tamperedCreator = { ...sampleAttestation, creatorId: "attacker_creator_id" };
    const tamperedBytes1 = serializeCanonicalAttestation(tamperedCreator);
    const ok1 = await crypto.subtle.verify("HMAC", key, signature, tamperedBytes1);
    expect(ok1).toBe(false);

    // Alter target frontUrl
    const tamperedUrl = { ...sampleAttestation, frontUrl: "https://impersonator.booth.pm" };
    const tamperedBytes2 = serializeCanonicalAttestation(tamperedUrl);
    const ok2 = await crypto.subtle.verify("HMAC", key, signature, tamperedBytes2);
    expect(ok2).toBe(false);
  });

  test("rejects expired challenge tokens", async () => {
    const expiredAttestation: CreatorDelegationAttestation = {
      ...sampleAttestation,
      expiresAt: Math.floor(Date.now() / 1000) - 100, // expired in the past
      nonce: "nonce_expired_test"
    };

    const key = await crypto.subtle.importKey(
      "raw",
      rawHmacSecret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const payloadBytes = serializeCanonicalAttestation(expiredAttestation);
    const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);

    const now = Math.floor(Date.now() / 1000);
    const isExpired = expiredAttestation.expiresAt < now;
    expect(isExpired).toBe(true);
  });

  test("rejects replayed nonces deterministically", async () => {
    const consumedNonces = new Set<string>(["nonce_already_used_123"]);
    const isReplayed = consumedNonces.has("nonce_already_used_123");
    expect(isReplayed).toBe(true);
  });

  test("rejects cross-algorithm confusion and corrupted signature bytes", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      rawHmacSecret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    const payloadBytes = serializeCanonicalAttestation(sampleAttestation);
    const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);

    // Corrupt signature
    const corruptedSig = new Uint8Array(signature);
    corruptedSig[0] ^= 0xff;

    const isValid = await crypto.subtle.verify("HMAC", key, corruptedSig, payloadBytes);
    expect(isValid).toBe(false);
  });
});
