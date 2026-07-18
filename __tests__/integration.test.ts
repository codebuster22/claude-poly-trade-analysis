import { test, expect } from "bun:test";
import { resolveMarket } from "../src/resolve.ts";
import { analyzeTrades } from "../src/index.ts";

const gated = process.env.RUN_INTEGRATION === "1" ? test : test.skip;

gated("resolves a live conditionId end-to-end", async () => {
  // "Will Argentina win the 2026 FIFA World Cup?" — replace if resolved.
  const cid = "0x0c4cd2055d6ea89354ffddc55d6dbcef9355748112ea952fc925f3db6a5c457f";
  const m = await resolveMarket(cid);
  expect(m.tokens.length).toBe(2);
  expect(typeof m.negRisk).toBe("boolean");
});

gated("resolves a live tokenId via gamma round-trip", async () => {
  const tid = "18812649149814341758733697580460697418474693998558159483117100240528657629879";
  const m = await resolveMarket(tid);
  expect(m.filterTokenId).toBe(tid);
});

// Full DEFAULT on-chain path against live Falcon + Polygon RPC, on a known-answer trade
// (fifwc-jor-arg SELL taker in tx 0x107eed — transfer-reconciled feeUsd = 0.021430).
// Needs FALCON_API_KEY + POLYGON_RPC_URL (Bun auto-loads .env).
gated("analyzeTrades on-chain path yields the known live feeUsd end-to-end", async () => {
  const out = await analyzeTrades({
    market: "0xb465c0d920be7fa9413909befc3989247de10a1d4feca2621bb36f9a62191a12",
    anchor: "2026-06-28T04:14:38Z",
    before: "1s",
    after: "1s",
  });
  const taker = out.find((r) => r.wallet === "0xe9076a87c5ed90ef16e6fe6529c943baeca0cff6");
  expect(taker).toBeDefined();
  expect(taker!.role).toBe("taker");
  expect(taker!.roleSource).toBe("onchain");
  expect(Number(taker!.feeUsd)).toBeCloseTo(0.021430, 6);
  expect(taker!.counterparty).toBe("0xc96aeabae8c81faf8d803201da1d2461cefc396a");
}, 30000);
