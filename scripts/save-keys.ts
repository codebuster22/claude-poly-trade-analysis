// save-keys.ts - write the fallback key config (chmod 600) that mcp/config.ts reads
// Exports: saveKeys
// Related: ../mcp/config.ts, ../commands/setup.md
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_CONFIG_PATH } from "../mcp/config.ts";

export function saveKeys(falconApiKey: string, polygonRpcUrl: string, configPath: string = DEFAULT_CONFIG_PATH): string {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ falconApiKey, polygonRpcUrl }, null, 2));
  chmodSync(configPath, 0o600);
  return configPath;
}

if (import.meta.main) {
  const [falcon, rpc] = process.argv.slice(2);
  if (!falcon || !rpc) { process.stderr.write("usage: bun save-keys.ts <FALCON_API_KEY> <POLYGON_RPC_URL>\n"); process.exit(1); }
  const p = saveKeys(falcon, rpc);
  process.stderr.write(`saved keys -> ${p}\n`);
}
