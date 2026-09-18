import { logger } from "../logger.ts";
import { dbV2 } from "../db_v2.ts";

export interface IpcServerCallbacks {
  onStop: () => void;
  onRecrawl?: () => Promise<void>;
  onProject?: () => Promise<void>;
  onExport?: () => Promise<void>;
}

export class CrawlerIpcServer {
  private server: any = null;
  private readonly PORT = 8765;
  private readonly HOST = "127.0.0.1";
  private startTime = Date.now();

  public start(callbacks: IpcServerCallbacks) {
    try {
      this.server = Bun.serve({
        port: this.PORT,
        hostname: this.HOST,
        fetch: async (req) => {
          const url = new URL(req.url);
          const path = url.pathname;

          if (path === "/health" || path === "/status") {
            const metrics = dbV2.getMetrics();
            const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
            return Response.json({
              status: "running",
              uptimeSeconds: uptimeSec,
              port: this.PORT,
              metrics
            });
          }

          if (path === "/stop") {
            logger.info("[IPC] Received shutdown request via loopback IPC.");
            setTimeout(() => {
              callbacks.onStop();
            }, 100);
            return Response.json({ status: "shutting_down", message: "Graceful shutdown initiated" });
          }

          if (path === "/recrawl") {
            logger.info("[IPC] Received re-crawl trigger via loopback IPC.");
            if (callbacks.onRecrawl) {
              callbacks.onRecrawl().catch(err => logger.error("[IPC] Re-crawl failed", err));
            }
            return Response.json({ status: "triggered", action: "recrawl" });
          }

          if (path === "/project") {
            logger.info("[IPC] Received projection rebuild trigger via loopback IPC.");
            if (callbacks.onProject) {
              callbacks.onProject().catch(err => logger.error("[IPC] Projection rebuild failed", err));
            }
            return Response.json({ status: "triggered", action: "projection" });
          }

          if (path === "/export") {
            logger.info("[IPC] Received export trigger via loopback IPC.");
            if (callbacks.onExport) {
              callbacks.onExport().catch(err => logger.error("[IPC] Export failed", err));
            }
            return Response.json({ status: "triggered", action: "export" });
          }

          return new Response("Not Found", { status: 404 });
        }
      });
      logger.info(`[IPC] Loopback control listener online at http://${this.HOST}:${this.PORT}`);
    } catch (err) {
      logger.warn(`[IPC] Could not bind loopback control listener on port ${this.PORT}: ${String(err)}`);
    }
  }

  public stop() {
    if (this.server) {
      try {
        this.server.stop(true);
        logger.info("[IPC] Loopback control listener stopped.");
      } catch (_) {}
      this.server = null;
    }
  }

  public static async sendCommand(command: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const url = `http://127.0.0.1:8765/${command}`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const json = await resp.json();
      return { success: resp.ok, data: json };
    } catch (err) {
      return {
        success: false,
        error: `Could not connect to crawler daemon on 127.0.0.1:8765: ${String(err)}`
      };
    }
  }

  public static async getStatus(): Promise<{ running: boolean; data?: any }> {
    try {
      const resp = await fetch("http://127.0.0.1:8765/status");
      if (resp.ok) {
        const data = await resp.json();
        return { running: true, data };
      }
      return { running: false };
    } catch {
      return { running: false };
    }
  }
}
