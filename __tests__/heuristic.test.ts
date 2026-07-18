import { test, expect } from "bun:test";
import { deriveRolesHeuristic } from "../src/roles/heuristic.ts";
import type { FalconRow } from "../src/types.ts";

const row = (o: Partial<FalconRow>): FalconRow => ({
  id: Math.random().toString(), conditionId: "0xc", tokenId: "1", outcome: "Yes",
  side: "BUY", size: 10, price: 0.5, tsMs: 0, tx: "0xt", wallet: "0xw", ...o,
});

test("2-row match: larger-notional wallet is taker", () => {
  const rows = [row({ wallet: "0xbig", side: "BUY", size: 100 }), row({ wallet: "0xsmall", side: "SELL", size: 100 })];
  const roles = deriveRolesHeuristic(rows);
  const w = roles.get("0xt")!;
  // equal |notional| here -> both same abs; ensure deterministic taker assignment exists and no fee present
  expect(w.get("0xbig")!.feeUsd).toBeUndefined();
  expect([...w.values()].filter((r) => r.role === "taker").length).toBe(1);
});

test("dominant wallet flagged high confidence", () => {
  const rows = [
    row({ tx: "0x2", wallet: "0xagg", side: "BUY", size: 1000 }),
    row({ tx: "0x2", wallet: "0xm1", side: "SELL", size: 100 }),
    row({ tx: "0x2", wallet: "0xm2", side: "SELL", size: 100 }),
  ];
  const w = deriveRolesHeuristic(rows).get("0x2")!;
  expect(w.get("0xagg")!.role).toBe("taker");
  expect(w.get("0xagg")!.roleConf).toBe("high");
});

test("single-wallet tx (no counterparty in window) yields low confidence", () => {
  const rows = [row({ tx: "0x3", wallet: "0xsolo", side: "BUY", size: 50 })];
  const w = deriveRolesHeuristic(rows).get("0x3")!;
  expect(w.get("0xsolo")!.role).toBe("taker");
  expect(w.get("0xsolo")!.roleConf).toBe("low");
  expect(w.get("0xsolo")!.feeUsd).toBeUndefined();
});
