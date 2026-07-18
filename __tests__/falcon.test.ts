import { test, expect } from "bun:test";
import { normalizeRow, dedupById, pullWindow } from "../src/falcon.ts";

const RAW = {
  id: "0xabc_0xdef",
  condition_id: "0xCID",
  token_id: "12345",
  outcome: "Yes",
  side: "SELL",
  size: 715.37,
  price: 0.999,
  timestamp: "2026-06-28T04:14:38Z",
  transaction_hash: "0xTX",
  proxy_wallet: "0xE9076A87C5ED90EF16E6FE6529C943BAECA0CFF6",
};

test("normalizeRow lowercases tx/wallet and parses fields", () => {
  const r = normalizeRow(RAW);
  expect(r.wallet).toBe("0xe9076a87c5ed90ef16e6fe6529c943baeca0cff6");
  expect(r.tx).toBe("0xtx");
  expect(r.side).toBe("SELL");
  expect(r.size).toBe(715.37);
  expect(r.tsMs).toBe(Date.parse("2026-06-28T04:14:38Z"));
});

test("normalizeRow accepts case variants and maps to the correct side (no silent BUY default)", () => {
  expect(normalizeRow({ ...RAW, side: "sell" }).side).toBe("SELL");
  expect(normalizeRow({ ...RAW, side: "buy" }).side).toBe("BUY");
  expect(normalizeRow({ ...RAW, side: "Sell" }).side).toBe("SELL");
});

test("normalizeRow fails closed on an unexpected side (never silently defaults)", () => {
  expect(() => normalizeRow({ ...RAW, side: "foo" })).toThrow();
  expect(() => normalizeRow({ ...RAW, side: "" })).toThrow();
});

test("dedupById keeps first per id", () => {
  const a = normalizeRow(RAW);
  const b = normalizeRow({ ...RAW, size: 1 });
  expect(dedupById([a, b]).length).toBe(1);
});

test("pullWindow paginates until has_more=false and dedups", async () => {
  const page = (rows: unknown[], hasMore: boolean) =>
    new Response(JSON.stringify({ data: { results: rows }, pagination: { has_more: hasMore } }), { status: 200 });
  let call = 0;
  const fetchImpl = (async () => {
    call++;
    if (call === 1) return page([RAW, { ...RAW, id: "0x2" }], true);
    return page([{ ...RAW, id: "0x3" }], false);
  }) as unknown as typeof fetch;
  const { fills, capped } = await pullWindow({ conditionId: "0xCID", startMs: 0, endMs: 1000, fetchImpl, apiKey: "k" });
  expect(fills.length).toBe(3);
  expect(capped).toBe(false);
  expect(call).toBe(2);
});

test("pullWindow: persistent connection failure -> attributed error, cause preserved, fetch called maxRetries times", async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls++; throw new Error("The socket connection was closed unexpectedly"); }) as unknown as typeof fetch;
  let caught: Error | undefined;
  try {
    await pullWindow({ conditionId: "0xCID", startMs: 0, endMs: 1000, fetchImpl, apiKey: "k", maxRetries: 2, sleep: async () => {} });
  } catch (e) { caught = e as Error; }
  expect(caught).toBeDefined();
  expect(caught!.message).toMatch(/Couldn't reach the Falcon trade API/);
  expect(caught!.cause).toBeDefined();
  expect(calls).toBe(2);
});

test("pullWindow: retry-then-succeed on connection failure resolves with rows and logs", async () => {
  let calls = 0;
  const logs: string[] = [];
  const fetchImpl = (async () => {
    calls++;
    if (calls === 1) throw new Error("The socket connection was closed unexpectedly");
    return new Response(JSON.stringify({ data: { results: [RAW] }, pagination: { has_more: false } }), { status: 200 });
  }) as unknown as typeof fetch;
  const { fills, capped } = await pullWindow({
    conditionId: "0xCID", startMs: 0, endMs: 1000, fetchImpl, apiKey: "k",
    sleep: async () => {}, log: (m) => logs.push(m),
  });
  expect(fills.length).toBe(1);
  expect(capped).toBe(false);
  expect(logs.length).toBeGreaterThanOrEqual(1);
});
