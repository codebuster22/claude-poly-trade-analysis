import { test, expect } from "bun:test";
import { resolveMarket } from "../src/resolve.ts";

const CLOB = {
  condition_id: "0xb465c0d920be7fa9413909befc3989247de10a1d4feca2621bb36f9a62191a12",
  question: "Will Argentina win on 2026-06-27?",
  market_slug: "fifwc-jor-arg-2026-06-27-arg",
  neg_risk: true,
  tokens: [
    { token_id: "89969054941820905260983372139923320038115693660830083208242956669285748681379", outcome: "Yes" },
    { token_id: "99643978616642943368192487629382085033508480110188276924611866315281486136550", outcome: "No" },
  ],
};

test("resolveMarket: conditionId path", async () => {
  const fetchImpl = (async (u: string) => {
    expect(u).toContain("/markets/0xb465c0");
    return new Response(JSON.stringify(CLOB), { status: 200 });
  }) as unknown as typeof fetch;
  const m = await resolveMarket(CLOB.condition_id, { fetchImpl });
  expect(m.slug).toBe("fifwc-jor-arg-2026-06-27-arg");
  expect(m.negRisk).toBe(true);
  expect(m.tokens.length).toBe(2);
  expect(m.filterTokenId).toBeUndefined();
});

const TID = "89969054941820905260983372139923320038115693660830083208242956669285748681379";
const keyset = (markets: unknown[]) => new Response(JSON.stringify({ markets }), { status: 200 });

test("resolveMarket: tokenId path resolves via gamma then clob + sets filterTokenId", async () => {
  const fetchImpl = (async (u: string) => {
    if (u.includes("gamma-api")) return keyset([{ conditionId: CLOB.condition_id }]);
    return new Response(JSON.stringify(CLOB), { status: 200 });
  }) as unknown as typeof fetch;
  const m = await resolveMarket(TID, { fetchImpl });
  expect(m.conditionId).toBe(CLOB.condition_id);
  expect(m.filterTokenId).toBe(TID);
});

test("resolveMarket: tokenId lookup uses the /markets/keyset endpoint", async () => {
  const urls: string[] = [];
  const fetchImpl = (async (u: string) => {
    urls.push(u);
    if (u.includes("gamma-api")) return keyset([{ conditionId: CLOB.condition_id }]);
    return new Response(JSON.stringify(CLOB), { status: 200 });
  }) as unknown as typeof fetch;
  await resolveMarket(TID, { fetchImpl });
  const gamma = urls.find((u) => u.includes("gamma-api"))!;
  expect(gamma).toContain("/markets/keyset");
  expect(gamma).toContain(`clob_token_ids=${TID}`);
});

test("resolveMarket: open-market tokenId resolves without ever asking for closed markets", async () => {
  const urls: string[] = [];
  const fetchImpl = (async (u: string) => {
    urls.push(u);
    if (u.includes("gamma-api")) return keyset([{ conditionId: CLOB.condition_id }]);
    return new Response(JSON.stringify(CLOB), { status: 200 });
  }) as unknown as typeof fetch;
  const m = await resolveMarket(TID, { fetchImpl });
  expect(m.conditionId).toBe(CLOB.condition_id);
  // gamma defaults to closed=false; an open market must resolve on the first call
  expect(urls.filter((u) => u.includes("gamma-api")).length).toBe(1);
  expect(urls.some((u) => u.includes("closed=true"))).toBe(false);
});

test("resolveMarket: closed-market tokenId retries gamma with closed=true and resolves", async () => {
  const gammaUrls: string[] = [];
  const fetchImpl = (async (u: string) => {
    if (u.includes("gamma-api")) {
      gammaUrls.push(u);
      // real gamma behaviour: closed markets are invisible unless closed=true is passed
      if (!u.includes("closed=true")) return keyset([]);
      return keyset([{ conditionId: CLOB.condition_id }]);
    }
    return new Response(JSON.stringify(CLOB), { status: 200 });
  }) as unknown as typeof fetch;
  const m = await resolveMarket(TID, { fetchImpl });
  expect(m.conditionId).toBe(CLOB.condition_id);
  expect(m.filterTokenId).toBe(TID);
  expect(gammaUrls.length).toBe(2);
  expect(gammaUrls[0]).not.toContain("closed=true");
  expect(gammaUrls[1]).toContain("closed=true");
});

test("resolveMarket: tokenId absent from both open and closed gamma -> actionable error", async () => {
  const tid = "12345678901234567890";
  const fetchImpl = (async () => keyset([])) as unknown as typeof fetch;
  await expect(resolveMarket(tid, { fetchImpl })).rejects.toThrow(/pass the conditionId/i);
});

test("resolveMarket: conditionId, connection reset -> attributed, host-only error (RED against single-shot code)", async () => {
  const fetchImpl = (async () => { throw new Error("The socket connection was closed unexpectedly"); }) as unknown as typeof fetch;
  const sleep = async () => {};
  let caught: Error | undefined;
  try {
    await resolveMarket(CLOB.condition_id, { fetchImpl, maxRetries: 1, sleep });
  } catch (e) { caught = e as Error; }
  expect(caught).toBeDefined();
  expect(caught!.message).toMatch(/Couldn't reach Polymarket CLOB \(clob\.polymarket\.com\)/);
  expect(caught!.cause).toBeDefined();
});

test("resolveMarket: conditionId, 200 body that fails schema -> attributed error, never raw ZodError", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ error: "x" }), { status: 200 })) as unknown as typeof fetch;
  await expect(resolveMarket(CLOB.condition_id, { fetchImpl })).rejects.toThrow(/unexpected response for conditionId/i);
  try {
    await resolveMarket(CLOB.condition_id, { fetchImpl });
    throw new Error("expected rejection");
  } catch (e) {
    const msg = (e as Error).message;
    expect(msg).not.toMatch(/Zod/i);
    expect(msg).not.toMatch(/invalid_type/i);
  }
});

test("resolveMarket: tokenId, fetch throws on gamma URL -> attributed Gamma error", async () => {
  const tid = "12345678901234567890";
  const fetchImpl = (async (u: string) => {
    if (u.includes("gamma-api")) throw new Error("connection reset");
    return new Response(JSON.stringify(CLOB), { status: 200 });
  }) as unknown as typeof fetch;
  const sleep = async () => {};
  await expect(resolveMarket(tid, { fetchImpl, maxRetries: 1, sleep })).rejects.toThrow(/Couldn't reach Polymarket Gamma/);
});
