import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { randomBytes } from "node:crypto";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.toml" },
			miniflare: { bindings: { OPERATOR_TOKEN: randomBytes(32).toString("hex") } },
		}),
	],
	test: { include: ["test/**/*.vitest.ts"], testTimeout: 15_000 },
});
