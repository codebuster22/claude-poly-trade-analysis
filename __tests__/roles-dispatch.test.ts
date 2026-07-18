import { test, expect } from "bun:test";
import { deriveRoles } from "../src/roles/index.ts";
import type { FalconRow } from "../src/types.ts";

const rows: FalconRow[] = [
  { id: "1", conditionId: "0xc", tokenId: "1", outcome: "Yes", side: "BUY", size: 100, price: 0.5, tsMs: 0, tx: "0xt", wallet: "0xa" },
  { id: "2", conditionId: "0xc", tokenId: "1", outcome: "Yes", side: "SELL", size: 100, price: 0.5, tsMs: 0, tx: "0xt", wallet: "0xb" },
];

test("heuristic source needs no rpc", async () => {
  const roles = await deriveRoles(rows, { source: "heuristic" });
  expect(roles.get("0xt")!.size).toBe(2);
});
test("onchain without rpc or getReceipt -> actionable error", async () => {
  await expect(deriveRoles(rows, { source: "onchain" })).rejects.toThrow(/POLYGON_RPC_URL|rpc/i);
});
