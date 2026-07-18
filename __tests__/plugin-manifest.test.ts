import { test, expect } from "bun:test";
import plugin from "../.claude-plugin/plugin.json";
import mcp from "../.mcp.json";
import market from "../.claude-plugin/marketplace.json";

test("plugin.json declares userConfig for both sensitive keys", () => {
  expect(plugin.name).toBe("trade-analysis");
  expect(plugin.userConfig.falcon_api_key.sensitive).toBe(true);
  expect(plugin.userConfig.polygon_rpc_url.sensitive).toBe(true);
});
test(".mcp.json spawns the bundled server WITHOUT a ${user_config.*} env block (GH #51573)", () => {
  const s = mcp.mcpServers["trade-analysis"];
  expect(s.command).toBe("bun");
  expect(s.args[0]).toContain("${CLAUDE_PLUGIN_ROOT}/dist/server.js");
  // Must not reference ${user_config.*} anywhere — that pattern silently fails to spawn the server.
  // Keys are delivered via CLAUDE_PLUGIN_OPTION_* auto-export or /trade-analysis:setup, read by loadKeys.
  expect(JSON.stringify((s as any).env ?? {})).not.toContain("user_config");
  // Generous per-server wall-clock/idle floor so long analyses aren't aborted at the 30-min stdio idle
  // timeout (CC v2.1.203+). Claude Code does NOT send a progressToken (GH #58687), so a progress
  // heartbeat can't keep the call alive — this timeout is the reliable lever.
  expect(typeof (s as any).timeout).toBe("number");
  expect((s as any).timeout).toBeGreaterThanOrEqual(3600000); // >= 1h
});
test("marketplace.json lists the plugin at repo root", () => {
  expect(market.plugins.find((p: any) => p.name === "trade-analysis")!.source).toBe(".");
});
