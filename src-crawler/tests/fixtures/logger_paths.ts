import { Logger } from "../../src/utils/logging/logger.ts";

const logger = new Logger(Bun.argv.includes("explicit") ? { logsDir: "explicit-logs" } : {});
console.log(JSON.stringify({ path: logger.getActiveLogPath(), standalone: Bun.isStandaloneExecutable }));
if (Bun.argv.includes("write")) logger.info("isolated path fixture");
await logger.close();
