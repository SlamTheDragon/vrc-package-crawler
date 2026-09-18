import { describe, it, expect } from "bun:test";
import { CrawlerIpcServer } from "../src/utils/ipc.ts";

describe("Crawler Loopback IPC Control", () => {
  it("binds to port 8765, serves status, and dispatches stop callback", async () => {
    let stopped = false;
    let recrawled = false;

    const ipc = new CrawlerIpcServer();
    ipc.start({
      onStop: () => {
        stopped = true;
      },
      onRecrawl: async () => {
        recrawled = true;
      }
    });

    // Check status
    const status = await CrawlerIpcServer.getStatus();
    expect(status.running).toBe(true);
    expect(status.data.status).toBe("running");

    // Send recrawl
    const recrawlRes = await CrawlerIpcServer.sendCommand("recrawl");
    expect(recrawlRes.success).toBe(true);
    expect(recrawled).toBe(true);

    // Send stop
    const stopRes = await CrawlerIpcServer.sendCommand("stop");
    expect(stopRes.success).toBe(true);

    // Allow stop timeout callback to fire
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(stopped).toBe(true);

    ipc.stop();
  });
});
