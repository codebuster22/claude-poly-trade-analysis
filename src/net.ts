// net.ts - host-safe HTTP+JSON with retry/backoff, attributed errors, and a model-visible log hook
// Exports: safeHost, backoffMs, fetchJson, DEFAULT_MAX_RETRIES, type NetLogger
// Related: resolve.ts, falcon.ts, roles/onchain.ts, ../mcp/analyze-fills.ts
// SECURITY: every message carries host (new URL().host), never the full URL (RPC key is in the URL path).

export type NetLogger = (msg: string) => void;

export function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return "unknown host"; }
}

// Env-configurable default; a caller (MCP tool arg) can override per call.
export const DEFAULT_MAX_RETRIES = (() => {
  const n = Number(process.env.TRADE_ANALYSIS_MAX_RETRIES);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3;
})();

// exponential, base 300ms, doubling, capped 3s. attempt is 0-based.
export function backoffMs(attempt: number): number {
  return Math.min(300 * 2 ** attempt, 3000);
}

const FINAL = Symbol("ta-final-error"); // marks errors we intentionally throw (do NOT retry them)
const isRetryableStatus = (s: number) => s === 408 || s === 425 || s === 429 || (s >= 500 && s <= 599);

export interface FetchJsonOpts {
  label: string;                 // human endpoint name, e.g. "Polymarket CLOB"
  init?: RequestInit;            // method/headers/body
  timeoutMs?: number;            // default 20000
  maxRetries?: number;           // total attempts (>=1); default DEFAULT_MAX_RETRIES
  log?: NetLogger;               // called once per retry with a host-only message
  sleep?: (ms: number) => Promise<void>; // injectable for hermetic tests
}

export async function fetchJson(fetchImpl: typeof fetch, url: string, opts: FetchJsonOpts): Promise<unknown> {
  const host = safeHost(url);
  const { label, init } = opts;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const maxRetries = Math.max(1, Math.floor(opts.maxRetries ?? DEFAULT_MAX_RETRIES));
  const log = opts.log ?? (() => {});
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const final = (msg: string) => Object.assign(new Error(msg), { [FINAL]: true });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const isLast = attempt === maxRetries - 1;
    try {
      const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), ...init });
      const text = await res.text();
      if (!res.ok) {
        if (isRetryableStatus(res.status) && !isLast) {
          const wait = backoffMs(attempt);
          log(`${label} (${host}) returned HTTP ${res.status} — retrying in ${wait}ms (attempt ${attempt + 2}/${maxRetries}).`);
          await sleep(wait); continue;
        }
        throw final(`${label} (${host}) returned HTTP ${res.status}. ${text.slice(0, 160)}`);
      }
      try { return JSON.parse(text); }
      catch { throw final(`${label} (${host}) returned a non-JSON response (HTTP ${res.status}): ${text.slice(0, 160)}`); }
    } catch (e) {
      if (e && (e as Record<PropertyKey, unknown>)[FINAL]) throw e; // our terminal error (bad status/non-JSON): no retry
      if (isLast) {
        throw new Error(`Couldn't reach ${label} (${host}) after ${maxRetries} attempt(s) — the connection failed (transient network/edge issue, not your keys or RPC). Please retry.`, { cause: e });
      }
      const wait = backoffMs(attempt);
      log(`Couldn't reach ${label} (${host}) — connection failed; retrying in ${wait}ms (attempt ${attempt + 2}/${maxRetries}).`);
      await sleep(wait);
    }
  }
  throw new Error(`Couldn't reach ${label} (${host}). Please retry.`); // unreachable; satisfies types
}
