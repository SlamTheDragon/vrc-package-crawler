import { describe, it, expect, afterAll } from "bun:test";
import { runEdgeSync } from "../src/sync/index.ts";
import { db } from "../src/db.ts";

describe("Decoupled Cloudflare Edge Sync", () => {
  afterAll(() => {
    db.run("DELETE FROM sync_checkpoints;");
  });

  it("executes dry-run synchronization and updates high-watermark checkpoint", async () => {
    // Run sync in dry-run mode
    const result = await runEdgeSync({ isDryRun: true, batchSize: 5 });
    expect(result.isDryRun).toBe(true);

    // Verify checkpoint was recorded in sync_checkpoints
    const checkpoint = db.query(`
      SELECT * FROM sync_checkpoints
      WHERE sync_target = 'cloudflare_d1' AND status = 'success'
      ORDER BY id DESC
      LIMIT 1;
    `).get() as any;

    expect(checkpoint).toBeDefined();
    expect(checkpoint.status).toBe("success");
    expect(checkpoint.last_synced_rowid).toBeGreaterThan(0);
  });
});
