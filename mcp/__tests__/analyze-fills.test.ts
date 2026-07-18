import { test, expect } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAnalyzeFills } from "../analyze-fills.ts";
import type { Receipt } from "../../src/roles/onchain.ts";
import sellReceipt from "../../__tests__/fixtures/receipt-sell-0x107eed.json";

const CLOB = { condition_id: "0xc", question: "Q?", market_slug: "slug", neg_risk: true, tokens: [{ token_id: "1", outcome: "Yes" }] };
const TAKER = "0xe9076a87c5ed90ef16e6fe6529c943baeca0cff6";
const MAKER = "0xc96aeabae8c81faf8d803201da1d2461cefc396a";
const SELL_TX = "0x107eed094a2bdb38ad749ea577324d126a5b66d3c3603b216a8c7e733b368cdf";
const row = (o: object) => ({ id: Math.random().toString(), condition_id: "0xc", token_id: "1", outcome: "Yes", price: 0.999, timestamp: "2026-06-28T04:14:38Z", ...o });

test("runAnalyzeFills writes CSV + returns a summary with the real taker fee (on-chain golden)", async () => {
  const fetchImpl = (async (u: string) => {
    if (u.includes("clob.polymarket")) return new Response(JSON.stringify(CLOB), { status: 200 });
    if (u.includes("narrative.agent")) return new Response(JSON.stringify({ data: { results: [
      row({ transaction_hash: SELL_TX, proxy_wallet: TAKER, side: "SELL", size: 715.37 }),
      row({ transaction_hash: SELL_TX, proxy_wallet: MAKER, side: "BUY", size: 715.37 }),
    ] }, pagination: { has_more: false } }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const getReceipt = async (_tx: string): Promise<Receipt> => sellReceipt as Receipt;
  const out = mkdtempSync(join(tmpdir(), "ta-out-"));

  const s = await runAnalyzeFills(
    { market: "0x" + "c".repeat(64), anchor: "2026-06-28T04:14:38Z", before: "10s", after: "10s", out },
    { fetchImpl, getReceipt, env: { FALCON_API_KEY: "k" }, configPath: "/nope" },
  );

  expect(s.count).toBe(2);
  expect(s.roleSource).toBe("onchain");
  expect(s.byRole.taker.rows).toBe(1);
  expect(s.byRole.maker.rows).toBe(1);
  expect(s.topTakers[0]!.wallet).toBe(TAKER);
  expect(Number(s.topTakers[0]!.feeUsd)).toBeCloseTo(0.021430, 6);
  expect(Number(s.totalTakerFeeUsd)).toBeCloseTo(0.021430, 6);
  expect(existsSync(s.csvPath)).toBe(true);
  expect(readFileSync(s.csvPath, "utf8").trim().split("\n").length).toBe(3); // header + 2 rows
  expect(s.warnings).toEqual([]);
});

test("missing Falcon key throws an actionable setup error", async () => {
  await expect(runAnalyzeFills(
    { market: "0x" + "c".repeat(64), anchor: "2026-06-28T04:14:38Z", before: "1s", after: "1s" },
    { env: {}, configPath: "/nope" },
  )).rejects.toThrow(/\/trade-analysis:setup/i);
});

test("transient CLOB retry surfaces a model-visible warning (never a full URL or secret) and the run still succeeds", async () => {
  let clobCalls = 0;
  const fetchImpl = (async (u: string) => {
    if (u.includes("clob.polymarket")) {
      clobCalls++;
      if (clobCalls === 1) throw new Error("The socket connection was closed unexpectedly");
      return new Response(JSON.stringify(CLOB), { status: 200 });
    }
    if (u.includes("narrative.agent")) return new Response(JSON.stringify({ data: { results: [
      row({ transaction_hash: SELL_TX, proxy_wallet: TAKER, side: "SELL", size: 715.37 }),
      row({ transaction_hash: SELL_TX, proxy_wallet: MAKER, side: "BUY", size: 715.37 }),
    ] }, pagination: { has_more: false } }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const getReceipt = async (_tx: string): Promise<Receipt> => sellReceipt as Receipt;
  const out = mkdtempSync(join(tmpdir(), "ta-out-"));

  const s = await runAnalyzeFills(
    { market: "0x" + "c".repeat(64), anchor: "2026-06-28T04:14:38Z", before: "10s", after: "10s", out },
    { fetchImpl, getReceipt, env: { FALCON_API_KEY: "k" }, configPath: "/nope" },
  );

  expect(s.count).toBe(2);
  expect(s.warnings.length).toBeGreaterThanOrEqual(1);
  expect(s.warnings.some((w) => w.includes("clob.polymarket.com"))).toBe(true);
  for (const w of s.warnings) {
    expect(w).not.toMatch(/https?:\/\//);
    expect(w).not.toContain("SUPERSECRETKEY");
  }
});
