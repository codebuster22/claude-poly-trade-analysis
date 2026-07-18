import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const bundle = join(import.meta.dir, "..", "..", "dist", "server.js");
const gated = existsSync(bundle) ? test : test.skip;

gated("bundled dist/server.js spawns and lists analyze_fills (proves server starts w/o ${user_config.*})", async () => {
  const transport = new StdioClientTransport({ command: "bun", args: [bundle] });
  const client = new Client({ name: "smoke", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    expect(tools.some((t) => t.name === "analyze_fills")).toBe(true);
  } finally {
    await client.close();
  }
}, 20000);
