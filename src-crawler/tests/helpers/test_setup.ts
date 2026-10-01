import { resolve } from "node:path";
import { getTestOutputDir } from "./test_directory.ts";

const testDir = getTestOutputDir();
if (!process.env.CRAWLER_LOGS_DIR) {
  process.env.CRAWLER_LOGS_DIR = resolve(testDir, "logs");
}
