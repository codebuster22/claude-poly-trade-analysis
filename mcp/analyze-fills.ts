// analyze-fills.ts - MCP-facing wrapper: run analyzeTrades, write CSV, return a compact summary (no raw rows)
// Exports: runAnalyzeFills, AnalyzeFillsArgs, FillsSummary
// Related: ../src/index.ts, config.ts, server.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Decimal from "decimal.js";
import { analyzeTrades, toCsv, type AnnotatedFill, type TradeQuery } from "../src/index.ts";
import type { Receipt } from "../src/roles/onchain.ts";
import { DEFAULT_MAX_RETRIES, type NetLogger } from "../src/net.ts";
import { loadKeys } from "./config.ts";

export interface AnalyzeFillsArgs {
  market: string;
  anchor: string | number;
  before?: string | number;
  after?: string | number;
  side?: "BUY" | "SELL";
  role?: "maker" | "taker";
  minSize?: number;
  sizeUnit?: "usdc" | "shares";
  fast?: boolean;
  identity?: boolean;
  out?: string;
  maxRetries?: number; // total attempts per upstream call on transient failure (default 3; env TRADE_ANALYSIS_MAX_RETRIES)
}

export interface FillsSummary {
  count: number;
  csvPath: string;
  roleSource: "onchain" | "heuristic";
  window: { anchor: string | number; before?: string | number; after?: string | number };
  byRole: {
    taker: { rows: number; volumeUsd: string };
    maker: { rows: number; volumeUsd: string };
    unknown: { rows: number; volumeUsd: string };
  };
  totalTakerFeeUsd: string;
  topTakers: Array<{ wallet: string; walletName?: string; volumeUsd: string; feeUsd: string }>;
  topMakers: Array<{ wallet: string; walletName?: string; volumeUsd: string }>;
  warnings: string[]; // model-visible diagnostics (e.g. transient-retry notices); always present, empty when nothing notable
}

interface Deps {
  fetchImpl?: typeof fetch;
  getReceipt?: (tx: string) => Promise<Receipt>;
  env?: Record<string, string | undefined>;
  configPath?: string;
}

function volume(fills: AnnotatedFill[], role: AnnotatedFill["role"]): string {
  return fills.filter((f) => f.role === role).reduce((s, f) => s.plus(new Decimal(f.usdc)), new Decimal(0)).toString();
}

function topWallets(fills: AnnotatedFill[], role: "taker" | "maker", n: number) {
  const by = new Map<string, { vol: Decimal; fee: Decimal; name?: string }>();
  for (const f of fills) {
    if (f.role !== role) continue;
    const cur = by.get(f.wallet) ?? { vol: new Decimal(0), fee: new Decimal(0), name: f.walletName };
    cur.vol = cur.vol.plus(new Decimal(f.usdc));
    cur.fee = cur.fee.plus(new Decimal(f.feeUsd ?? 0));
    by.set(f.wallet, cur);
  }
  return [...by.entries()]
    .sort((a, b) => b[1].vol.cmp(a[1].vol))
    .slice(0, n)
    .map(([wallet, v]) => ({ wallet, walletName: v.name, volumeUsd: v.vol.toString(), feeUsd: v.fee.toString() }));
}

export async function runAnalyzeFills(args: AnalyzeFillsArgs, deps: Deps = {}): Promise<FillsSummary> {
  const { falconApiKey, polygonRpcUrl } = loadKeys({ env: deps.env, configPath: deps.configPath });
  if (!falconApiKey) throw new Error("Falcon API key not set. Run /trade-analysis:setup to add your keys.");
  const roleSource: "onchain" | "heuristic" = args.fast ? "heuristic" : "onchain";
  if (roleSource === "onchain" && !polygonRpcUrl && !deps.getReceipt) {
    throw new Error("Polygon RPC URL not set. Run /trade-analysis:setup, or pass fast:true for the RPC-free heuristic.");
  }
  const query: TradeQuery = {
    market: args.market, anchor: args.anchor, before: args.before, after: args.after,
    side: args.side, role: args.role, minSize: args.minSize, sizeUnit: args.sizeUnit ?? "usdc",
    roleSource, identity: args.identity, rpcUrl: polygonRpcUrl,
  };
  const warnings: string[] = [];
  const onWarn: NetLogger = (m) => { warnings.push(m); process.stderr.write(`[trade-analysis] ${m}\n`); };
  const maxRetries = args.maxRetries ?? DEFAULT_MAX_RETRIES;
  const fills = await analyzeTrades(query, { fetchImpl: deps.fetchImpl, getReceipt: deps.getReceipt, apiKey: falconApiKey, maxRetries, onWarn });

  const outDir = resolve(args.out ?? "./trade-analysis-out");
  mkdirSync(outDir, { recursive: true });
  const slug = String(args.market).slice(0, 10) + "-" + String(args.anchor).replace(/[^0-9a-zA-Z]/g, "");
  const csvPath = join(outDir, `fills-${slug}.csv`);
  writeFileSync(csvPath, toCsv(fills));

  return {
    count: fills.length,
    csvPath,
    roleSource,
    window: { anchor: args.anchor, before: args.before, after: args.after }, // echoed verbatim (parseAnchorMs isn't public)
    byRole: {
      taker: { rows: fills.filter((f) => f.role === "taker").length, volumeUsd: volume(fills, "taker") },
      maker: { rows: fills.filter((f) => f.role === "maker").length, volumeUsd: volume(fills, "maker") },
      unknown: { rows: fills.filter((f) => f.role === "unknown").length, volumeUsd: volume(fills, "unknown") },
    },
    totalTakerFeeUsd: fills.filter((f) => f.role === "taker").reduce((s, f) => s.plus(new Decimal(f.feeUsd ?? 0)), new Decimal(0)).toString(),
    topTakers: topWallets(fills, "taker", 5),
    topMakers: topWallets(fills, "maker", 5).map(({ feeUsd, ...rest }) => rest),
    warnings,
  };
}
