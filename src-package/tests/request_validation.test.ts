import { expect, test } from "bun:test";
import { VRCPackageClient } from "../src/client.ts";

test("every SDK auth namespace rejects redirects through its fetch policy", async () => {
  const rejection = new TypeError("Fixture redirect rejection");
  let calls = 0;
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    appToken: "fixture-app",
    userToken: "fixture-user",
    operatorToken: "fixture-operator",
    fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const request = new Request(input, init);
      expect(request.redirect).toBe("error");
      expect(new URL(request.url).origin).toBe("https://worker.example");
      throw rejection;
    }, { preconnect() {} })
  });
  const actions = [
    () => client.index.query(),
    () => client.index.search({ queryOrigin: "user_authored", query: "tools" }),
    () => client.user.apps.list(),
    () => client.operator.init()
  ];
  for (const [index, invoke] of actions.entries()) {
    let caught: unknown;
    try {
      await invoke();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(rejection);
    expect(calls).toBe(index + 1);
  }
});

test("invalid SDK POST inputs fail before invoking fetch", async () => {
  let calls = 0;
  const client = new VRCPackageClient({ baseUrl: "https://worker.example",
    operatorToken: "fixture-operator", userToken: "fixture-user", appToken: "fixture-app",
    fetch: Object.assign(async () => {
      calls++;
      throw new Error("Invalid payload reached transport");
    }, { preconnect() {} }) });
  const leadKey = "a".repeat(64);
  const id = "00000000-0000-4000-8000-000000000001";
  const invalid: Array<() => Promise<unknown>> = [
    () => client.index.search({ queryOrigin: "invalid" } as never),
    () => client.app.register({ schemaVersion: 1, appName: "Valid app", extra: true } as never),
    () => client.reports.submit({ schemaVersion: 1, reportType: "removal_request", canonicalId: "fixture" } as never),
    () => client.operator.leads.approve(leadKey, { minDelayMs: -1 }),
    () => client.operator.leads.reject(leadKey, { reason: " " }),
    () => client.operator.sourceProfiles.create({ schemaVersion: 999 } as never),
    () => client.operator.sourceProfiles.disable(id, " "),
    () => client.operator.autoQueueRules.create({ schemaVersion: 999 } as never),
    () => client.operator.autoQueueRules.disable(id, " "),
    () => client.operator.nodes.issue({ schemaVersion: 999 } as never),
    () => client.operator.takedowns.verify(id, { verdict: "invalid" } as never),
    () => client.operator.jobs.enqueue({ schemaVersion: 999 } as never),
    () => client.operator.init({ autoSeed: "invalid" } as never),
    () => client.operator.nodes.revoke("fixture-node", " ")
  ];
  for (const invoke of invalid) {
    await expect(invoke()).rejects.toThrow();
    expect(calls).toBe(0);
  }
});

test("SDK path identifiers reject route-changing input before invoking fetch", async () => {
  let calls = 0;
  const client = new VRCPackageClient({ baseUrl: "https://worker.example",
    operatorToken: "fixture-operator", userToken: "fixture-user",
    fetch: Object.assign(async () => {
      calls++;
      throw new Error("Invalid path reached transport");
    }, { preconnect() {} }) });
  const invalid = ["", "../init", "id/disable", "id?reason=other", "id#fragment", "id%2Fdisable", " "];
  for (const id of invalid) {
    const actions: Array<() => Promise<unknown>> = [
      () => client.operator.leads.approve(id, { reason: "Reviewed lead" }),
      () => client.operator.leads.reject(id, { reason: "Reviewed lead" }),
      () => client.operator.sourceProfiles.disable(id, "Reviewed profile"),
      () => client.operator.autoQueueRules.disable(id, "Reviewed rule"),
      () => client.operator.takedowns.verify(id, { verdict: "accepted" }),
      () => client.operator.nodes.revoke(id, "Reviewed node"),
      () => client.user.apps.get(id)
    ];
    for (const invoke of actions) {
      await expect(invoke()).rejects.toThrow();
      expect(calls).toBe(0);
    }
  }
});
