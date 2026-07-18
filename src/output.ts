// output.ts - serialize AnnotatedFill[] to CSV and JSON
// Exports: CSV_COLUMNS, toCsv, toJson
// Related: types.ts. csvEscape ported from find_goal_takers.mjs.
import type { AnnotatedFill } from "./types.ts";

export const CSV_COLUMNS: (keyof AnnotatedFill)[] = [
  "n", "tx", "timestamp", "offsetS", "market", "outcome", "tokenId", "wallet", "walletName",
  "side", "role", "roleSource", "roleConf", "size", "price", "usdc", "feeUsd", "counterparty",
];

export function csvEscape(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(fills: AnnotatedFill[]): string {
  const head = CSV_COLUMNS.join(",");
  const body = fills.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

export function toJson(fills: AnnotatedFill[]): string {
  return JSON.stringify(fills, null, 2);
}
