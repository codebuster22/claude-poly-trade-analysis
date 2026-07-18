// index.ts - public API: analyzeTrades(query) pipeline + type/serializer re-exports
// Exports: analyzeTrades, AnalyzeDeps, toCsv, toJson, CSV_COLUMNS, NetLogger, all types
// Related: resolve.ts, falcon.ts, roles/, enrich.ts, filter.ts, output.ts, identity.ts, net.ts
import type { TradeQuery, AnnotatedFill } from "./types.ts";
import { parseAnchorMs, parseDurationSec } from "./parse.ts";
import { resolveMarket } from "./resolve.ts";
import { pullWindow } from "./falcon.ts";
import { deriveRoles } from "./roles/index.ts";
import type { Receipt } from "./roles/onchain.ts";
import { enrich } from "./enrich.ts";
import { applyFilters } from "./filter.ts";
import { fetchNames } from "./identity.ts";
import type { NetLogger } from "./net.ts";

export interface AnalyzeDeps {
  fetchImpl?: typeof fetch;
  getReceipt?: (tx: string) => Promise<Receipt>;
  apiKey?: string;
  maxRetries?: number;   // total attempts per upstream call on transient failure; default DEFAULT_MAX_RETRIES (net.ts)
  onWarn?: NetLogger;     // called with a host-only message on each retry (model/human-visible diagnostics)
}

export async function analyzeTrades(query: TradeQuery, deps: AnalyzeDeps = {}): Promise<AnnotatedFill[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const meta = await resolveMarket(query.market, { fetchImpl, maxRetries: deps.maxRetries, log: deps.onWarn });

  const anchorMs = parseAnchorMs(query.anchor);
  const beforeSec = parseDurationSec(query.before, 0);
  const afterSec = parseDurationSec(query.after, beforeSec); // symmetric ± if only `before` given
  if (beforeSec === 0 && afterSec === 0) throw new Error("Provide a window: before/after (e.g. --before 10s --after 10s).");
  const startMs = anchorMs - beforeSec * 1000 - 1000; // pad ±1s (second-resolution source)
  const endMs = anchorMs + afterSec * 1000 + 1000;

  const { fills, capped } = await pullWindow({ conditionId: meta.conditionId, startMs, endMs, fetchImpl, apiKey: deps.apiKey, maxRetries: deps.maxRetries, log: deps.onWarn });
  if (capped) throw new Error("Falcon returned a truncated/incomplete window (capped) — results may be partial; narrow the window or retry.");
  // exact client-side window (undo the ±1s pad)
  const inWindow = fills.filter((r) => r.tsMs >= anchorMs - beforeSec * 1000 && r.tsMs <= anchorMs + afterSec * 1000);
  if (inWindow.length === 0) throw new Error(`No fills found in the window [-${beforeSec}s, +${afterSec}s] around anchor ${new Date(anchorMs).toISOString()} for market ${meta.slug}.`);
  inWindow.sort((a, b) => a.tsMs - b.tsMs);

  const roleSource = query.roleSource ?? "onchain";
  const roles = await deriveRoles(inWindow, { source: roleSource, rpcUrl: query.rpcUrl ?? process.env.POLYGON_RPC_URL, getReceipt: deps.getReceipt });

  const names = query.identity ? await fetchNames(inWindow.map((r) => r.wallet), { fetchImpl }) : undefined;

  const enriched = enrich({ rows: inWindow, roles, meta, roleSource, anchorMs, names });
  return applyFilters(enriched, { side: query.side, role: query.role, minSize: query.minSize, sizeUnit: query.sizeUnit ?? "usdc", tokenId: meta.filterTokenId });
}

export * from "./types.ts";
export { toCsv, toJson, CSV_COLUMNS } from "./output.ts";
export type { NetLogger } from "./net.ts";
