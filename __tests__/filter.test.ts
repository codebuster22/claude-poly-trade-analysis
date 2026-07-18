import { test, expect } from "bun:test";
import { applyFilters } from "../src/filter.ts";
import type { AnnotatedFill } from "../src/types.ts";

const f = (o: Partial<AnnotatedFill>): AnnotatedFill => ({
  n: 0, tx: "0xt", timestamp: "", offsetS: 0, market: "m", question: "q", outcome: "Yes",
  tokenId: "1", wallet: "0xw", side: "BUY", role: "taker", roleSource: "onchain", roleConf: "exact",
  size: "100", price: "0.5", usdc: "50", ...o,
});

test("side + role AND compose", () => {
  const out = applyFilters([f({ side: "BUY", role: "taker" }), f({ side: "SELL", role: "taker" }), f({ side: "BUY", role: "maker" })], { side: "BUY", role: "taker" });
  expect(out.length).toBe(1);
  expect(out[0]!.n).toBe(1);
});
test("minSize usdc vs shares", () => {
  const rows = [f({ size: "100", price: "0.3", usdc: "30" }), f({ size: "100", price: "0.9", usdc: "90" })];
  expect(applyFilters(rows, { minSize: 50, sizeUnit: "usdc" }).length).toBe(1);
  expect(applyFilters(rows, { minSize: 50, sizeUnit: "shares" }).length).toBe(2);
});
test("tokenId filter", () => {
  const out = applyFilters([f({ tokenId: "1" }), f({ tokenId: "2" })], { tokenId: "2" });
  expect(out.length).toBe(1);
  expect(out[0]!.tokenId).toBe("2");
});
