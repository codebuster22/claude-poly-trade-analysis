import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKeys } from "../config.ts";

const tmpCfg = (obj: object) => {
  const p = join(mkdtempSync(join(tmpdir(), "ta-cfg-")), "config.json");
  writeFileSync(p, JSON.stringify(obj));
  return p;
};

test("env wins", () => {
  const r = loadKeys({ env: { FALCON_API_KEY: "F", POLYGON_RPC_URL: "R" }, configPath: "/nope" });
  expect(r).toEqual({ falconApiKey: "F", polygonRpcUrl: "R" });
});
test("falls back to config file for missing keys", () => {
  const p = tmpCfg({ falconApiKey: "F2", polygonRpcUrl: "R2" });
  const r = loadKeys({ env: {}, configPath: p });
  expect(r).toEqual({ falconApiKey: "F2", polygonRpcUrl: "R2" });
});
test("env overrides file per-key", () => {
  const p = tmpCfg({ falconApiKey: "F2", polygonRpcUrl: "R2" });
  const r = loadKeys({ env: { FALCON_API_KEY: "F" }, configPath: p });
  expect(r).toEqual({ falconApiKey: "F", polygonRpcUrl: "R2" });
});
test("missing file is tolerated (no throw)", () => {
  expect(loadKeys({ env: {}, configPath: "/nonexistent/x.json" })).toEqual({ falconApiKey: undefined, polygonRpcUrl: undefined });
});
test("reads CLAUDE_PLUGIN_OPTION_* auto-export when native env absent", () => {
  const r = loadKeys({ env: { CLAUDE_PLUGIN_OPTION_FALCON_API_KEY: "F", CLAUDE_PLUGIN_OPTION_POLYGON_RPC_URL: "R" }, configPath: "/nope" });
  expect(r).toEqual({ falconApiKey: "F", polygonRpcUrl: "R" });
});
test("native FALCON_API_KEY wins over the CLAUDE_PLUGIN_OPTION_* export", () => {
  const r = loadKeys({ env: { FALCON_API_KEY: "F", CLAUDE_PLUGIN_OPTION_FALCON_API_KEY: "X", CLAUDE_PLUGIN_OPTION_POLYGON_RPC_URL: "R" }, configPath: "/nope" });
  expect(r).toEqual({ falconApiKey: "F", polygonRpcUrl: "R" });
});
test("unexpanded ${...} literal is treated as unset and does NOT poison the config-file fallback (GH #51573)", () => {
  const p = tmpCfg({ falconApiKey: "F2", polygonRpcUrl: "R2" });
  const r = loadKeys({ env: { FALCON_API_KEY: "${user_config.falcon_api_key}", POLYGON_RPC_URL: "${user_config.polygon_rpc_url}" }, configPath: p });
  expect(r).toEqual({ falconApiKey: "F2", polygonRpcUrl: "R2" });
});
test("bad-JSON config file is tolerated (no throw)", () => {
  const p = join(mkdtempSync(join(tmpdir(), "ta-badjson-")), "config.json");
  writeFileSync(p, "not json");
  expect(loadKeys({ env: {}, configPath: p })).toEqual({ falconApiKey: undefined, polygonRpcUrl: undefined });
});
