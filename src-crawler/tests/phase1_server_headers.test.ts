import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { startServer } from "../src/server/index.ts";

describe("Phase 1: Server Headers (Task 1.2), Discovery Route (Task 1.3) & Auth Config (Task 1.1)", () => {
  it("verifies .env.example declares API_SECRET_TOKEN and administrative security notes (Task 1.1)", () => {
    const envPath = path.resolve(import.meta.dir, "../.env.example");
    expect(fs.existsSync(envPath)).toBe(true);

    const content = fs.readFileSync(envPath, "utf-8");
    expect(content).toContain("API_SECRET_TOKEN=change_me_to_a_secure_token");
    expect(content).toContain("Authorization: Bearer <API_SECRET_TOKEN>");
  });

  it("serves root discovery route GET / with RFC 8288 / RFC 9110 metadata (Task 1.3)", async () => {
    const testPort = 18080 + Math.floor(Math.random() * 500);
    const server = startServer({ port: testPort, host: "127.0.0.1" });

    try {
      const resp = await fetch(`http://127.0.0.1:${testPort}/`);
      expect(resp.status).toBe(200);

      const json = await resp.json() as any;
      expect(json.name).toBe("vrc-package-crawler API Gateway");
      expect(json.terms_of_use).toBe("https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md");
      expect(json.license).toContain("Layer-A: AGPL-3.0");
      expect(json.endpoints).toBeDefined();
      expect(json.endpoints.health).toBe("/v1/health");
      expect(json.endpoints.reports).toBe("/v1/reports");
    } finally {
      server.stop(true);
    }
  });

  it("injects downstream terms notice headers on all HTTP responses (Task 1.2)", async () => {
    const testPort = 18080 + Math.floor(Math.random() * 500);
    const server = startServer({ port: testPort, host: "127.0.0.1" });

    try {
      const resp = await fetch(`http://127.0.0.1:${testPort}/v1/health`);
      expect(resp.status).toBe(200);

      // Verify un-prefixed RFC 6648 compliant header standards
      expect(resp.headers.get("VRC-Packages-Terms-Of-Use")).toBe(
        "https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md"
      );
      expect(resp.headers.get("VRC-Packages-Terms-Version")).toBe("1.1");
      expect(resp.headers.get("VRC-Packages-Repository")).toBe(
        "https://github.com/SlamTheDragon/vrc-package-crawler"
      );
      expect(resp.headers.get("VRC-Packages-License")).toContain("Layer-A: AGPL-3.0");
      expect(resp.headers.get("Link")).toContain('rel="terms-of-service"');
      expect(resp.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
    } finally {
      server.stop(true);
    }
  });
});
