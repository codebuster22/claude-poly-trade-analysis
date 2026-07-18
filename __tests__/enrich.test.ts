import { test, expect } from "bun:test";
import { enrich } from "../src/enrich.ts";
import type { FalconRow, MarketMeta, TxRoleMap } from "../src/types.ts";

const meta: MarketMeta = { conditionId: "0xc", question: "Q?", slug: "slug-1", negRisk: true, tokens: [] };
const rows: FalconRow[] = [
  { id: "1", conditionId: "0xc", tokenId: "1", outcome: "Yes", side: "SELL", size: 715.37, price: 0.999, tsMs: 1000, tx: "0xt", wallet: "0xtaker" },
  { id: "2", conditionId: "0xc", tokenId: "1", outcome: "Yes", side: "BUY", size: 715.37, price: 0.999, tsMs: 1000, tx: "0xt", wallet: "0xmaker" },
];
const roles: TxRoleMap = new Map([["0xt", new Map([
  ["0xtaker", { role: "taker", roleConf: "exact", feeUsd: "0.021430" }],
  ["0xmaker", { role: "maker", roleConf: "exact" }],
])]]);

test("enrich joins role, computes usdc/offset/counterparty", () => {
  const out = enrich({ rows, roles, meta, roleSource: "onchain", anchorMs: 0 });
  const t = out.find((r) => r.wallet === "0xtaker")!;
  expect(t.role).toBe("taker");
  expect(t.offsetS).toBe(1);
  expect(Number(t.usdc)).toBeCloseTo(714.65, 2);
  expect(Number(t.feeUsd)).toBeCloseTo(0.021430, 6);
  expect(t.counterparty).toBe("0xmaker");
});

test("row with no role -> unknown/none", () => {
  const out = enrich({ rows: [rows[0]!], roles: new Map(), meta, roleSource: "onchain", anchorMs: 0 });
  expect(out[0]!.role).toBe("unknown");
  expect(out[0]!.roleConf).toBe("none");
});

test("sweep: taker fee stamped ONCE across N maker rows (no N× overcount)", () => {
  const mk = (w: string, side: "BUY" | "SELL"): FalconRow => ({ id: w, conditionId: "0xc", tokenId: "1", outcome: "Yes", side, size: 100, price: 0.5, tsMs: 0, tx: "0xs", wallet: w });
  const rows2: FalconRow[] = [mk("0xtaker", "SELL"), mk("0xm1", "BUY"), mk("0xm2", "BUY"), mk("0xm3", "BUY")];
  const roles2: TxRoleMap = new Map([["0xs", new Map([
    ["0xtaker", { role: "taker", roleConf: "exact", feeUsd: "0.05" }],
    ["0xm1", { role: "maker", roleConf: "exact" }],
    ["0xm2", { role: "maker", roleConf: "exact" }],
    ["0xm3", { role: "maker", roleConf: "exact" }],
  ])]]);
  const out = enrich({ rows: rows2, roles: roles2, meta, roleSource: "onchain", anchorMs: 0 });
  const totalFee = out.reduce((s, r) => s + Number(r.feeUsd ?? 0), 0);
  expect(totalFee).toBeCloseTo(0.05, 6); // exactly one taker fee, not 4×
  expect(out.filter((r) => r.feeUsd !== undefined).length).toBe(1);
});
