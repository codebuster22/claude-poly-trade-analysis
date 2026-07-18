import { test, expect } from "bun:test";
import { toCsv, toJson, CSV_COLUMNS } from "../src/output.ts";
import type { AnnotatedFill } from "../src/types.ts";

const fill: AnnotatedFill = {
  n: 1, tx: "0xt", timestamp: "2026-06-28T04:14:38.000Z", offsetS: -3, market: "slug, with comma",
  question: "Q?", outcome: "Yes", tokenId: "1", wallet: "0xw", side: "SELL", role: "taker",
  roleSource: "onchain", roleConf: "exact", size: "715.37", price: "0.999", usdc: "714.65",
  feeUsd: "0.021430",
};

test("CSV header + comma escaping", () => {
  const csv = toCsv([fill]);
  const [head, row] = csv.trim().split("\n");
  expect(head).toBe(CSV_COLUMNS.join(","));
  expect(row).toContain('"slug, with comma"');
});
test("JSON round-trips", () => {
  expect(JSON.parse(toJson([fill]))[0].role).toBe("taker");
});
