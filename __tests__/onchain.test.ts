import { test, expect } from "bun:test";
import { deriveRolesOnchain, makeViemReceiptGetter, type Receipt } from "../src/roles/onchain.ts";
import sell from "./fixtures/receipt-sell-0x107eed.json";
import buy from "./fixtures/receipt-buy-0x818b33.json";
import sweep from "./fixtures/receipt-sweep-0xfa65d9.json";

const getReceipt = (map: Record<string, Receipt>) => async (tx: string) => map[tx]!;

test("SELL taker: fee_usd from chain, maker feeless", async () => {
  const tx = "0x107eed094a2bdb38ad749ea577324d126a5b66d3c3603b216a8c7e733b368cdf";
  const roles = await deriveRolesOnchain([tx], { getReceipt: getReceipt({ [tx]: sell as Receipt }) });
  const w = roles.get(tx)!;
  const taker = w.get("0xe9076a87c5ed90ef16e6fe6529c943baeca0cff6")!;
  const maker = w.get("0xc96aeabae8c81faf8d803201da1d2461cefc396a")!;
  expect(taker.role).toBe("taker");
  expect(Number(taker.feeUsd)).toBeCloseTo(0.021430, 6); // transfer-reconciled USDC
  expect(maker.role).toBe("maker");
  expect(maker.feeUsd).toBeUndefined();
});

test("BUY taker: fee_usd is USDC (= fee/1e6), NOT shares×price", async () => {
  const tx = "0x818b3395dd75c8635d5212b4122fc00a7833a735d5e942c6647502590c0ad6be";
  const roles = await deriveRolesOnchain([tx], { getReceipt: getReceipt({ [tx]: buy as Receipt }) });
  const w = roles.get(tx)!;
  const taker = w.get("0xa0db650c4df55c9c8b4661edd6b2cf885b7767fc")!;
  expect(taker.role).toBe("taker");
  expect(Number(taker.feeUsd)).toBeCloseTo(0.003900, 6); // transfer-reconciled USDC (not 0.003849)
});

test("sweep: exactly one taker, N makers, single aggregated fee", async () => {
  const tx = "0xfa65d924f8dffd29ff956fc890679cda7ec71087083ae5bb2069f7f5740b38c1";
  const w = (await deriveRolesOnchain([tx], { getReceipt: getReceipt({ [tx]: sweep as Receipt }) })).get(tx)!;
  const takers = [...w.values()].filter((r) => r.role === "taker");
  const makers = [...w.values()].filter((r) => r.role === "maker");
  expect(takers.length).toBe(1);
  expect(makers.length).toBe(50);
  expect(w.get("0x56604973f2f37e86c213fef9ac209151258054bf")!.role).toBe("taker");
  expect(Number(takers[0]!.feeUsd)).toBeCloseTo(0.01933, 5); // ONE fee, not 50×
});

test("classic/V1 exchange log -> throws (not silent unknown)", async () => {
  const tx = "0xclassic";
  const classicReceipt: Receipt = { logs: [{ address: "0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e", topics: ["0x" + "0".repeat(64)], data: "0x" }] };
  await expect(deriveRolesOnchain([tx], { getReceipt: getReceipt({ [tx]: classicReceipt }) })).rejects.toThrow(/classic\/V1/i);
});

test("makeViemReceiptGetter: RPC-key leak guard — error is host-only, never the URL or the key", async () => {
  const getReceipt = makeViemReceiptGetter("https://alchemy.example.invalid/v2/SUPERSECRETKEY");
  let caught: Error | undefined;
  try {
    await getReceipt("0x" + "1".repeat(64));
  } catch (e) { caught = e as Error; }
  expect(caught).toBeDefined();
  expect(caught!.message).toMatch(/Polygon RPC \(alchemy\.example\.invalid\)/);
  expect(caught!.message).not.toContain("SUPERSECRETKEY");
  expect(caught!.message).not.toContain("https://");
}, 15000);
