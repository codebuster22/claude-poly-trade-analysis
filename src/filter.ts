// filter.ts - post-enrichment per-row filters (side, role, minSize+unit, token)
// Exports: applyFilters
// Related: types.ts
import Decimal from "decimal.js";
import type { AnnotatedFill, Side, SizeUnit } from "./types.ts";

export function applyFilters(fills: AnnotatedFill[], f: { side?: Side; role?: "maker" | "taker"; minSize?: number; sizeUnit?: SizeUnit; tokenId?: string }): AnnotatedFill[] {
  const unit = f.sizeUnit ?? "usdc";
  const min = f.minSize === undefined ? null : new Decimal(f.minSize);
  const out = fills.filter((r) => {
    if (f.tokenId && r.tokenId !== f.tokenId) return false;
    if (f.side && r.side !== f.side) return false;
    if (f.role && r.role !== f.role) return false;
    if (min) {
      const v = new Decimal(unit === "usdc" ? r.usdc : r.size);
      if (v.lt(min)) return false;
    }
    return true;
  });
  return out.map((r, i) => ({ ...r, n: i + 1 }));
}
