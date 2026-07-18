// server.ts - MCP stdio server exposing the analyze_fills tool over @modelcontextprotocol/sdk
// Exports: ANALYZE_FILLS_TOOL, handleAnalyzeFills, main
// Related: analyze-fills.ts, config.ts, ../.mcp.json
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { runAnalyzeFills, type AnalyzeFillsArgs } from "./analyze-fills.ts";

export const ANALYZE_FILLS_TOOL = {
  name: "analyze_fills",
  description:
    "Annotated Polymarket wallet-fills for a market + time window with on-chain maker/taker role and real fee. " +
    "Writes a CSV and returns a compact summary (never raw rows). One row per wallet-fill; do NOT sum usdc across all rows (double-counts) — sum one side/role. " +
    "Default is on-chain (needs POLYGON_RPC_URL); pass fast:true for the RPC-free heuristic (approximate, no fee).",
  inputSchema: {
    type: "object",
    required: ["market", "anchor"],
    properties: {
      market: { type: "string", description: "conditionId (0x+64) or tokenId (long decimal)" },
      anchor: { type: "string", description: "unix sec/ms or ISO-UTC" },
      before: { type: "string", description: "window e.g. 10s/5m/2h (mirrors to after if after omitted)" },
      after: { type: "string" },
      side: { type: "string", enum: ["BUY", "SELL"] },
      role: { type: "string", enum: ["maker", "taker"] },
      minSize: { type: "number" },
      sizeUnit: { type: "string", enum: ["usdc", "shares"] },
      fast: { type: "boolean", description: "true -> Falcon-only heuristic (no RPC, no fee)" },
      identity: { type: "boolean", description: "best-effort wallet -> name lookup" },
      out: { type: "string", description: "output directory (default ./trade-analysis-out)" },
      maxRetries: { type: "number", description: "Max attempts per upstream call on transient failure (default 3; env TRADE_ANALYSIS_MAX_RETRIES)." },
    },
  },
} as const;

export async function handleAnalyzeFills(
  args: AnalyzeFillsArgs,
  deps: Parameters<typeof runAnalyzeFills>[1] = {},
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const summary = await runAnalyzeFills(args, deps);
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text", text: `error: ${msg}` }], isError: true };
  }
}

export async function main() {
  const server = new Server({ name: "trade-analysis", version: "0.1.4" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [ANALYZE_FILLS_TOOL] }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "analyze_fills") return { content: [{ type: "text", text: `unknown tool: ${req.params.name}` }], isError: true };
    return handleAnalyzeFills(req.params.arguments as unknown as AnalyzeFillsArgs);
  });
  await server.connect(new StdioServerTransport());
}

if (import.meta.main) void main();
