import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ANALYZE_FILLS_TOOL, handleAnalyzeFills } from "../server.ts";

test("tool advertises required inputs", () => {
  expect(ANALYZE_FILLS_TOOL.name).toBe("analyze_fills");
  expect(ANALYZE_FILLS_TOOL.inputSchema.required).toEqual(["market", "anchor"]);
});
test("handleAnalyzeFills returns an isError content block on a bad request (no keys)", async () => {
  const out = mkdtempSync(join(tmpdir(), "ta-srv-"));
  // no env keys, no getReceipt -> runAnalyzeFills throws -> adapter returns isError
  const r = await handleAnalyzeFills({ market: "0x" + "c".repeat(64), anchor: "1751083200", before: "1s", after: "1s", out },
    { env: {}, configPath: "/nope" });
  expect(r.isError).toBe(true);
  expect(r.content[0]!.text).toMatch(/\/trade-analysis:setup/i);
});
