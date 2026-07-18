// capture-fixtures.ts - dev-only: fetch the two golden receipts and save as test fixtures.
// Run once: POLYGON_RPC_URL=<rpc> bun packages/trade-analysis/scripts/capture-fixtures.ts
import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { mkdirSync, writeFileSync } from "node:fs";

const RPC = process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
const OUT = new URL("../__tests__/fixtures/", import.meta.url).pathname;
const TXS: Record<string, string> = {
  "receipt-sell-0x107eed.json": "0x107eed094a2bdb38ad749ea577324d126a5b66d3c3603b216a8c7e733b368cdf", // 1:1 SELL taker
  "receipt-buy-0x818b33.json": "0x818b3395dd75c8635d5212b4122fc00a7833a735d5e942c6647502590c0ad6be",  // 1:1 BUY taker
  "receipt-sweep-0xfa65d9.json": "0xfa65d924f8dffd29ff956fc890679cda7ec71087083ae5bb2069f7f5740b38c1", // 1 taker vs 50 makers
};
const client = createPublicClient({ chain: polygon, transport: http(RPC) });
mkdirSync(OUT, { recursive: true });
for (const [file, tx] of Object.entries(TXS)) {
  const r = await client.getTransactionReceipt({ hash: tx as `0x${string}` });
  const slim = { logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data })) };
  writeFileSync(OUT + file, JSON.stringify(slim, null, 2));
  console.log("saved", file, "logs:", slim.logs.length);
}
