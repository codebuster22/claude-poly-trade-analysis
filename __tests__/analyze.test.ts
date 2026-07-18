import { test, expect } from "bun:test";
import { analyzeTrades } from "../src/index.ts";
import type { Receipt } from "../src/roles/onchain.ts";
import sellReceipt from "./fixtures/receipt-sell-0x107eed.json";

const CLOB = { condition_id: "0xc", question: "Q?", market_slug: "slug", neg_risk: true, tokens: [{ token_id: "1", outcome: "Yes" }] };
const falconRow = (o: object) => ({ id: Math.random().toString(), condition_id: "0xc", token_id: "1", outcome: "Yes", price: 0.999, timestamp: "2026-06-28T04:14:38Z", ...o });

test("analyzeTrades end-to-end with injected deps (heuristic)", async () => {
  const fetchImpl = (async (u: string) => {
    if (u.includes("clob.polymarket")) return new Response(JSON.stringify(CLOB), { status: 200 });
    if (u.includes("narrative.agent")) return new Response(JSON.stringify({ data: { results: [
      falconRow({ transaction_hash: "0xt", proxy_wallet: "0xTAKER", side: "SELL", size: 500 }),
      falconRow({ transaction_hash: "0xt", proxy_wallet: "0xMAKER", side: "BUY", size: 500 }),
    ] }, pagination: { has_more: false } }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  const out = await analyzeTrades(
    { market: "0x" + "c".repeat(64), anchor: "2026-06-28T04:14:38Z", before: "10s", after: "10s", roleSource: "heuristic", role: "taker" },
    { fetchImpl, apiKey: "test-key" },
  );
  expect(out.length).toBe(1);
  expect(out[0]!.role).toBe("taker");
  expect(out[0]!.market).toBe("slug");
});

test("empty window (no fills at all) throws fail-closed", async () => {
  const fetchImpl = (async (u: string) => {
    if (u.includes("clob.polymarket")) return new Response(JSON.stringify(CLOB), { status: 200 });
    if (u.includes("narrative.agent")) return new Response(JSON.stringify({ data: { results: [] }, pagination: { has_more: false } }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  await expect(analyzeTrades(
    { market: "0x" + "c".repeat(64), anchor: "2026-06-28T04:14:38Z", before: "10s", after: "10s", roleSource: "heuristic" },
    { fetchImpl, apiKey: "test-key" },
  )).rejects.toThrow(/no fills found in the window/i);
});

test("capped (truncated) Falcon window throws fail-closed", async () => {
  const fetchImpl = (async (u: string) => {
    if (u.includes("clob.polymarket")) return new Response(JSON.stringify(CLOB), { status: 200 });
    if (u.includes("narrative.agent")) return new Response("err", { status: 500 });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  await expect(analyzeTrades(
    { market: "0x" + "c".repeat(64), anchor: "2026-06-28T04:14:38Z", before: "10s", after: "10s", roleSource: "heuristic" },
    { fetchImpl, apiKey: "test-key" },
  )).rejects.toThrow(/truncat|capped|partial|incomplete/i);
}, 5000);

test("non-empty window fully removed by user filters returns [] (not a throw)", async () => {
  const fetchImpl = (async (u: string) => {
    if (u.includes("clob.polymarket")) return new Response(JSON.stringify(CLOB), { status: 200 });
    if (u.includes("narrative.agent")) return new Response(JSON.stringify({ data: { results: [
      falconRow({ transaction_hash: "0xt", proxy_wallet: "0xTAKER", side: "SELL", size: 500 }),
      falconRow({ transaction_hash: "0xt", proxy_wallet: "0xMAKER", side: "BUY", size: 500 }),
    ] }, pagination: { has_more: false } }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  // side filter set to a side that appears nowhere -> post-filter empty, must NOT throw
  const out = await analyzeTrades(
    { market: "0x" + "c".repeat(64), anchor: "2026-06-28T04:14:38Z", before: "10s", after: "10s", roleSource: "heuristic", side: "SELL", role: "maker" },
    { fetchImpl, apiKey: "test-key" },
  );
  expect(out).toEqual([]);
});

// M5: end-to-end through the DEFAULT on-chain path (resolve -> falcon -> injected receipt decode ->
// role/fee -> enrich -> output), using the real committed golden receipt. Mirrors the live run.
const TAKER = "0xe9076a87c5ed90ef16e6fe6529c943baeca0cff6"; // SELL taker in receipt-sell-0x107eed
const MAKER = "0xc96aeabae8c81faf8d803201da1d2461cefc396a"; // BUY maker
const SELL_TX = "0x107eed094a2bdb38ad749ea577324d126a5b66d3c3603b216a8c7e733b368cdf";

test("analyzeTrades end-to-end on the on-chain path lands the real feeUsd (golden receipt)", async () => {
  const fetchImpl = (async (u: string) => {
    if (u.includes("clob.polymarket")) return new Response(JSON.stringify(CLOB), { status: 200 });
    if (u.includes("narrative.agent")) return new Response(JSON.stringify({ data: { results: [
      falconRow({ transaction_hash: SELL_TX, proxy_wallet: TAKER, side: "SELL", size: 715.37 }),
      falconRow({ transaction_hash: SELL_TX, proxy_wallet: MAKER, side: "BUY", size: 715.37 }),
    ] }, pagination: { has_more: false } }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  const getReceipt = async (_tx: string): Promise<Receipt> => sellReceipt as Receipt;

  // roleSource omitted -> defaults to "onchain"
  const out = await analyzeTrades(
    { market: "0x" + "c".repeat(64), anchor: "2026-06-28T04:14:38Z", before: "10s", after: "10s" },
    { fetchImpl, getReceipt, apiKey: "test-key" },
  );
  expect(out.length).toBe(2);
  const taker = out.find((r) => r.wallet === TAKER)!;
  const maker = out.find((r) => r.wallet === MAKER)!;
  expect(taker.role).toBe("taker");
  expect(taker.roleSource).toBe("onchain");
  expect(taker.roleConf).toBe("exact");
  expect(Number(taker.feeUsd)).toBeCloseTo(0.021430, 6); // transfer-reconciled, through the whole pipeline
  expect(taker.counterparty).toBe(MAKER);
  expect(maker.role).toBe("maker");
  expect(maker.feeUsd).toBeUndefined();
});
