import { logger } from "../logger.ts";
import { db } from "../db.ts";

export interface IpcServerCallbacks {
  onStop: () => void;
  onRecrawl?: () => Promise<void>;
  onProject?: () => Promise<void>;
  onExport?: () => Promise<void>;
  onSync?: () => Promise<void>;
  onSteering?: () => Promise<void>;
}

export class CrawlerIpcServer {
  private server: any = null;
  private PORT: number;
  private readonly HOST = "127.0.0.1";
  private startTime = Date.now();

  constructor(customPort?: number) {
    this.PORT = customPort || (process.env.CRAWLER_IPC_PORT ? parseInt(process.env.CRAWLER_IPC_PORT, 10) : 8765);
  }

  public get port(): number {
    return this.PORT;
  }

  public start(callbacks: IpcServerCallbacks) {
    try {
      this.server = Bun.serve({
        port: this.PORT,
        hostname: this.HOST,
        fetch: async (req) => {
          const url = new URL(req.url);
          const path = url.pathname;

          if (path === "/health" || path === "/status") {
            const metrics = db.getMetrics();
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

          if (path === "/sync") {
            logger.info("[IPC] Received edge sync trigger via loopback IPC.");
            if (callbacks.onSync) {
              callbacks.onSync().catch(err => logger.error("[IPC] Sync failed", err));
            }
            return Response.json({ status: "triggered", action: "sync" });
          }

          if (path === "/steering") {
            logger.info("[IPC] Received steering pull trigger via loopback IPC.");
            if (callbacks.onSteering) {
              callbacks.onSteering().catch(err => logger.error("[IPC] Steering failed", err));
            }
            return Response.json({ status: "triggered", action: "steering" });
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

  public static async sendCommand(command: string, customPort?: number): Promise<{ success: boolean; data?: any; error?: string }> {
    const p = customPort || (process.env.CRAWLER_IPC_PORT ? parseInt(process.env.CRAWLER_IPC_PORT, 10) : 8765);
    const url = `http://127.0.0.1:${p}/${command}`;
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}: ${resp.statusText}` };
      }
      const data = await resp.json();
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }

  public static async getStatus(customPort?: number): Promise<{ running: boolean; data?: any }> {
    const res = await this.sendCommand("status", customPort);
    if (res.success && res.data) {
      return { running: true, data: res.data };
    }
    return { running: false };
  }
}
