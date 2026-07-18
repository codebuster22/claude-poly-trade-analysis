import { test, expect } from "bun:test";
import { statSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveKeys } from "../../scripts/save-keys.ts";
import { loadKeys } from "../config.ts";

test("saveKeys writes a 600-perm config that loadKeys reads back", () => {
  const p = join(mkdtempSync(join(tmpdir(), "ta-save-")), "config.json");
  const written = saveKeys("F", "R", p);
  expect(written).toBe(p);
  expect(loadKeys({ env: {}, configPath: p })).toEqual({ falconApiKey: "F", polygonRpcUrl: "R" });
  expect(statSync(p).mode & 0o777).toBe(0o600);
});
