// falcon.ts - Falcon trade API client: paginated pull, dedup-by-id, row normalization
// Exports: normalizeRow, dedupById, pullWindow
// Related: types.ts, net.ts. Invariant: Falcon has NO role field; it returns BOTH sides of each match.
import { z } from "zod";
import type { FalconRow } from "./types.ts";
import { backoffMs, safeHost, DEFAULT_MAX_RETRIES, type NetLogger } from "./net.ts";

const URL = "https://narrative.agent.heisenberg.so/api/v2/semantic/retrieve/parameterized";
const HOST = safeHost(URL);

const RawRow = z.object({
  id: z.union([z.string(), z.number()]),
  condition_id: z.string(),
  token_id: z.union([z.string(), z.number()]),
  outcome: z.string(),
  // fail-closed: case-normalize then require BUY|SELL — never silently default an unexpected value.
  side: z.preprocess((v) => (typeof v === "string" ? v.toUpperCase() : v), z.enum(["BUY", "SELL"])),
  size: z.coerce.number(),
  price: z.coerce.number(),
  timestamp: z.string(),
  transaction_hash: z.string(),
  proxy_wallet: z.string(),
});

export function normalizeRow(r: unknown): FalconRow {
  const p = RawRow.parse(r);
  const tsMs = Date.parse(p.timestamp);
  if (Number.isNaN(tsMs)) throw new Error(`Falcon row bad timestamp: ${p.timestamp}`);
  return {
    id: String(p.id),
    conditionId: String(p.condition_id),
    tokenId: String(p.token_id),
    outcome: p.outcome,
    side: p.side, // already validated to "BUY" | "SELL" by RawRow
    size: p.size,
    price: p.price,
    tsMs,
    tx: p.transaction_hash.toLowerCase(),
    wallet: p.proxy_wallet.toLowerCase(),
  };
}

export function dedupById(rows: FalconRow[]): FalconRow[] {
  const seen = new Map<string, FalconRow>();
  for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()];
}

export async function pullWindow(args: {
  conditionId: string; startMs: number; endMs: number;
  fetchImpl?: typeof fetch; apiKey?: string; maxPages?: number;
  maxRetries?: number; log?: NetLogger; sleep?: (ms: number) => Promise<void>;
}): Promise<{ fills: FalconRow[]; capped: boolean }> {
  const { conditionId, startMs, endMs } = args;
  const fetchImpl = args.fetchImpl ?? fetch;
  const apiKey = args.apiKey ?? process.env.FALCON_API_KEY;
  const maxPages = args.maxPages ?? 200;
  const maxRetries = Math.max(1, Math.floor(args.maxRetries ?? DEFAULT_MAX_RETRIES));
  const log = args.log ?? (() => {});
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  if (!apiKey) throw new Error("FALCON_API_KEY not set");
  const startSec = Math.floor(startMs / 1000);
  const endSec = Math.ceil(endMs / 1000);
  const fills: FalconRow[] = [];
  let offset = 0, capped = false, pages = 0;
  for (; pages < maxPages; pages++, offset += 200) {
    const body = {
      agent_id: 556,
      params: { proxy_wallet: "ALL", condition_id: conditionId, market_slug: "ALL", side: "ALL", start_time: String(startSec), end_time: String(endSec) },
      pagination: { limit: 200, offset },
      formatter_config: { format_type: "raw" },
    };
    let res: Response | undefined;
    for (let retry = 0; retry < maxRetries; retry++) {
      const isLast = retry === maxRetries - 1;
      try {
        res = await fetchImpl(URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
        if (res.ok) break;
      } catch (e) {
        if (isLast) {
          throw new Error(`Couldn't reach the Falcon trade API (${HOST}) after ${maxRetries} attempt(s) — the connection failed (transient). Please retry.`, { cause: e });
        }
        const wait = backoffMs(retry);
        log(`Falcon trade API (${HOST}) — connection failed; retrying in ${wait}ms (attempt ${retry + 2}/${maxRetries}).`);
        await sleep(wait);
        continue;
      }
      if (isLast) break; // non-ok status on the final attempt: fall through to `capped` below, no extra wait
      const wait = backoffMs(retry);
      log(`Falcon trade API (${HOST}) returned HTTP ${res.status} — retrying in ${wait}ms (attempt ${retry + 2}/${maxRetries}).`);
      await sleep(wait);
    }
    if (!res || !res.ok) { capped = true; break; }
    const j = (await res.json()) as { data?: { results?: unknown[] }; pagination?: { has_more?: boolean } };
    const rows = j.data?.results ?? [];
    for (const r of rows) fills.push(normalizeRow(r));
    if (!j.pagination?.has_more || rows.length === 0) break;
    if (pages === maxPages - 1) capped = true;
  }
  return { fills: dedupById(fills), capped };
}
