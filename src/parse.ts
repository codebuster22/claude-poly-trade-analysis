// parse.ts - normalize market id, anchor timestamp, and window durations
// Exports: detectMarketIdKind, parseAnchorMs, parseDurationSec
// Related: types.ts
export function detectMarketIdKind(market: string): "conditionId" | "tokenId" {
  const m = market.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(m)) return "conditionId";
  if (/^[0-9]{10,}$/.test(m)) return "tokenId";
  throw new Error(`Unrecognized market id: ${market} (expected 0x-64 conditionId or long-decimal tokenId)`);
}

export function parseAnchorMs(anchor: string | number): number {
  if (typeof anchor === "number" || /^[0-9]+$/.test(String(anchor).trim())) {
    const n = Number(anchor);
    if (n >= 1e12) return n;            // already ms
    if (n >= 1e9) return n * 1000;      // seconds
    throw new Error(`Numeric anchor too small to be sec/ms: ${anchor}`);
  }
  const ms = Date.parse(String(anchor));
  if (Number.isNaN(ms)) throw new Error(`Unparseable anchor: ${anchor}`);
  return ms;
}

const UNIT_SEC: Record<string, number> = { s: 1, m: 60, h: 3600 };
export function parseDurationSec(d: string | number | undefined, fallbackSec: number): number {
  if (d === undefined) return fallbackSec;
  if (typeof d === "number") return d;
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*([smh])?$/.exec(d.trim());
  if (!match) throw new Error(`Unparseable duration: ${d} (use e.g. 10s, 10m, 2h)`);
  const value = Number(match[1]);
  const unit = match[2] ?? "s";
  return value * UNIT_SEC[unit]!;
}
