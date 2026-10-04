import { resolve } from "node:path";

process.env.CRAWLER_LOGS_DIR ??= resolve(import.meta.dir, "../dist/tests/logs");
