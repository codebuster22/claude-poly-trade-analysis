// resolve.ts - resolve a conditionId|tokenId to MarketMeta (CLOB + Gamma)
// Exports: resolveMarket
// Related: types.ts, parse.ts, net.ts
import { z } from "zod";
import type { MarketMeta } from "./types.ts";
import { detectMarketIdKind } from "./parse.ts";
import { fetchJson, type NetLogger } from "./net.ts";

const ClobMarket = z.object({
  condition_id: z.string(),
  question: z.string(),
  market_slug: z.string(),
  neg_risk: z.boolean(),
  tokens: z.array(z.object({ token_id: z.string(), outcome: z.string() })),
});

interface CallOpts { maxRetries?: number; log?: NetLogger; sleep?: (ms: number) => Promise<void>; }

async function clobByCondition(fetchImpl: typeof fetch, conditionId: string, opts: CallOpts): Promise<MarketMeta> {
  const raw = await fetchJson(fetchImpl, `https://clob.polymarket.com/markets/${conditionId}`, {
    label: "Polymarket CLOB", maxRetries: opts.maxRetries, log: opts.log, sleep: opts.sleep,
  });
  const parsed = ClobMarket.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Polymarket CLOB returned an unexpected response for conditionId ${conditionId} — it may not be a valid or known market.`);
  }
  const m = parsed.data;
  return {
    conditionId: m.condition_id,
    question: m.question,
    slug: m.market_slug,
    negRisk: m.neg_risk,
    tokens: m.tokens.map((t) => ({ tokenId: t.token_id, outcome: t.outcome })),
  };
}

const GammaKeyset = z.object({ markets: z.array(z.object({ conditionId: z.string() })) });

// Returns the conditionId for a tokenId, or undefined when Gamma has no match in
// the requested closed/open slice. `/markets/keyset` replaced the legacy `/markets`
// list endpoint and wraps results in { markets: [...] }.
async function gammaConditionIdByToken(
  fetchImpl: typeof fetch, tokenId: string, closed: boolean, opts: CallOpts,
): Promise<string | undefined> {
  const url = `https://gamma-api.polymarket.com/markets/keyset?limit=1&clob_token_ids=${tokenId}`
    + (closed ? "&closed=true" : "");
  const raw = await fetchJson(fetchImpl, url, {
    label: "Polymarket Gamma", maxRetries: opts.maxRetries, log: opts.log, sleep: opts.sleep,
  });
  const parsed = GammaKeyset.safeParse(raw);
  if (!parsed.success) return undefined;
  return parsed.data.markets[0]?.conditionId;
}

export async function resolveMarket(
  market: string,
  opts: { fetchImpl?: typeof fetch; maxRetries?: number; log?: NetLogger; sleep?: (ms: number) => Promise<void> } = {},
): Promise<MarketMeta> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const callOpts: CallOpts = { maxRetries: opts.maxRetries, log: opts.log, sleep: opts.sleep };
  const kind = detectMarketIdKind(market);
  if (kind === "conditionId") return clobByCondition(fetchImpl, market, callOpts);
  // tokenId: gamma clob_token_ids -> conditionId, then CLOB, then tag filterTokenId.
  // Gamma defaults to closed=false, so a resolved market is invisible on the first
  // call — retry with closed=true rather than sending it unconditionally, which
  // would in turn hide every open market.
  let conditionId = await gammaConditionIdByToken(fetchImpl, market, false, callOpts);
  if (conditionId === undefined) {
    conditionId = await gammaConditionIdByToken(fetchImpl, market, true, callOpts);
  }
  if (conditionId === undefined) {
    throw new Error(`tokenId ${market} not found via Gamma (searched both open and closed markets). Pass the conditionId directly.`);
  }
  const meta = await clobByCondition(fetchImpl, conditionId, callOpts);
  return { ...meta, filterTokenId: market };
}
