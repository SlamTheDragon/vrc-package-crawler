import { describe, it, expect, spyOn } from "bun:test";
import { WorkerLogger, workerLogger } from "../src/worker/worker_logger.ts";

describe("WorkerLogger - Cloudflare Worker Oriented Logging", () => {
  it("emits structured JSON without filesystem dependencies", () => {
    const logger = new WorkerLogger("coordinator");
    let logged = "";
    const spy = spyOn(console, "info").mockImplementation((msg: string) => {
      logged = msg;
    });

    logger.info("Test worker info", { requestId: "req-123", source: "test" });
    expect(logged).not.toBe("");
    const parsed = JSON.parse(logged);
    expect(parsed.level).toBe("info");
    expect(parsed.component).toBe("coordinator");
    expect(parsed.message).toBe("Test worker info");
    expect(parsed.meta.requestId).toBe("req-123");
    expect(parsed.timestamp).toBeDefined();

    spy.mockRestore();
  });

  it("formats errors with message and stack trace in JSON", () => {
    const logger = new WorkerLogger("worker-test");
    let errorLogged = "";
    const spy = spyOn(console, "error").mockImplementation((msg: string) => {
      errorLogged = msg;
    });

    const testError = new Error("Simulated failure");
    logger.error("Something went wrong", testError, { retryCount: 2 });
    expect(errorLogged).not.toBe("");

    const parsed = JSON.parse(errorLogged);
    expect(parsed.level).toBe("error");
    expect(parsed.component).toBe("worker-test");
    expect(parsed.message).toBe("Something went wrong");
    expect(parsed.error).toBe("Simulated failure");
    expect(parsed.stack).toBeDefined();
    expect(parsed.meta.retryCount).toBe(2);

    spy.mockRestore();
  });

  it("supports component-scoped loggers", () => {
    const operatorLogger = workerLogger.forComponent("operator");
    expect(operatorLogger.component).toBe("operator");
  });
});
