// config.ts - load Falcon + Polygon RPC keys from env (native or Claude Code userConfig auto-export) or the fallback config file
// Exports: loadKeys, DEFAULT_CONFIG_PATH
// Related: server.ts, scripts/save-keys.ts, ../commands/setup.md, ../.mcp.json
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "trade-analysis", "config.json");

// Treat empty, or a non-interpolated ${...} template literal, as unset. Claude Code's
// ${user_config.*} interpolation can silently fail to expand (GH #51573); a passed-through
// literal must NOT be mistaken for a real key (it would poison the config-file fallback).
function clean(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  if (t === "" || /^\$\{.*\}$/.test(t)) return undefined;
  return v;
}

export function loadKeys(opts: { env?: Record<string, string | undefined>; configPath?: string } = {}): { falconApiKey?: string; polygonRpcUrl?: string } {
  const env = opts.env ?? process.env;
  // Native env (dev/.env) first; then Claude Code's userConfig auto-export CLAUDE_PLUGIN_OPTION_<KEY>.
  let falconApiKey = clean(env.FALCON_API_KEY) ?? clean(env.CLAUDE_PLUGIN_OPTION_FALCON_API_KEY);
  let polygonRpcUrl = clean(env.POLYGON_RPC_URL) ?? clean(env.CLAUDE_PLUGIN_OPTION_POLYGON_RPC_URL);
  if (!falconApiKey || !polygonRpcUrl) {
    try {
      const j = JSON.parse(readFileSync(opts.configPath ?? DEFAULT_CONFIG_PATH, "utf8")) as { falconApiKey?: string; polygonRpcUrl?: string };
      falconApiKey ||= clean(j.falconApiKey);
      polygonRpcUrl ||= clean(j.polygonRpcUrl);
    } catch { /* no file / bad json → leave undefined */ }
  }
  return { falconApiKey, polygonRpcUrl };
}
