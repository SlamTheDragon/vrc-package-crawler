import { describe, expect, it } from "bun:test";
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

describe("npm distribution boundary", () => {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  it("removes artifacts for deleted sources before rebuilding", () => {
    const staleDirectory = new URL("dist/__removed_source_fixture__/", root);
    const staleJavaScript = new URL("old.js", staleDirectory);
    const staleDeclaration = new URL("old.d.ts", staleDirectory);
    mkdirSync(staleDirectory, { recursive: true });
    writeFileSync(staleJavaScript, "export const removed = true;\n");
    writeFileSync(staleDeclaration, "export declare const removed: true;\n");
    try {
      execFileSync(process.execPath, ["run", "build"], { cwd: fileURLToPath(root), stdio: "pipe" });
      expect(existsSync(staleJavaScript)).toBe(false);
      expect(existsSync(staleDeclaration)).toBe(false);
      expect(existsSync(new URL("src/index.ts", root))).toBe(true);
      expect(existsSync(new URL("dist/index.js", root))).toBe(true);
      expect(existsSync(new URL("dist/index.d.ts", root))).toBe(true);
    } finally {
      rmSync(staleDirectory, { recursive: true, force: true });
    }
  });
  it("exports JavaScript and declarations without publishing source or tests", () => {
    expect(manifest.files).toEqual(["dist/**/*.js", "dist/**/*.d.ts", "LICENSE", "README.md"]);
    for (const entry of Object.values(manifest.exports) as { types: string; import: string }[]) {
      expect(entry.import.endsWith(".js")).toBe(true);
      expect(entry.types.endsWith(".d.ts")).toBe(true);
      expect(existsSync(fileURLToPath(new URL(entry.import, root)))).toBe(true);
      expect(existsSync(fileURLToPath(new URL(entry.types, root)))).toBe(true);
    }
  });
});
