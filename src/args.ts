// args.ts - parse CLI argv into a TradeQuery (+ optional out path)
// Exports: parseArgs
// Related: types.ts, cli.ts
import type { TradeQuery, Side, SizeUnit } from "./types.ts";

export function parseArgs(argv: string[]): { query: TradeQuery; out?: string } {
  const m = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags.add(key);
    else { m.set(key, next); i++; }
  }
  const market = m.get("market");
  const anchor = m.get("anchor");
  if (!market) throw new Error("--market is required (conditionId or tokenId)");
  if (!anchor) throw new Error("--anchor is required (unix sec/ms or ISO-UTC)");
  const query: TradeQuery = {
    market,
    anchor,
    before: m.get("before"),
    after: m.get("after"),
    minSize: m.has("min-size") ? Number(m.get("min-size")) : undefined,
    sizeUnit: (m.get("size-unit") as SizeUnit | undefined) ?? "usdc",
    side: m.get("side") as Side | undefined,
    role: m.get("role") as "maker" | "taker" | undefined,
    roleSource: flags.has("fast") ? "heuristic" : "onchain",
    identity: flags.has("identity"),
    rpcUrl: m.get("rpc-url"),
  };
  return { query, out: m.get("out") };
}
