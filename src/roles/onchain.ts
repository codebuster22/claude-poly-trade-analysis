// onchain.ts - authoritative maker/taker role + real fee from OrderFilled logs
// Exports: Receipt, deriveRolesOnchain, makeViemReceiptGetter
// Related: roles/abi.ts, types.ts, ../net.ts. Rule: taker==emittingExchange log identifies the taker order.
// SECURITY: rpcUrl embeds an API key in its path; errors surface `safeHost(rpcUrl)` only, never the URL or
// viem's own `.message` (which embeds the full URL).
import Decimal from "decimal.js";
import { decodeEventLog, createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import type { TxRoleMap, WalletRole } from "../types.ts";
import { orderFilledEvent, KNOWN_EXCHANGES, CLASSIC_EXCHANGES, ORDER_FILLED_TOPIC0_V2, ORDER_FILLED_TOPIC0_V1 } from "./abi.ts";
import { safeHost } from "../net.ts";

export interface Receipt { logs: { address: string; topics: string[]; data: string }[]; }

const ONE = new Decimal(1_000_000);

export function makeViemReceiptGetter(rpcUrl: string): (tx: string) => Promise<Receipt> {
  const client = createPublicClient({ chain: polygon, transport: http(rpcUrl) });
  const host = safeHost(rpcUrl);
  return async (tx: string) => {
    try {
      const r = await client.getTransactionReceipt({ hash: tx as `0x${string}` });
      return { logs: r.logs.map((l) => ({ address: l.address, topics: [...l.topics], data: l.data })) };
    } catch (e) {
      // do NOT echo viem's own .message here — it embeds the full rpcUrl (with the API key).
      throw new Error(`Polygon RPC (${host}) failed while fetching the receipt for tx ${tx} — connection failed or receipt unavailable (transient). Please retry; if it persists, check your Polygon RPC endpoint.`, { cause: e });
    }
  };
}

interface Decoded { exchange: string; maker: string; taker: string; side: number; makerAmt: bigint; takerAmt: bigint; fee: bigint; }

function decodeReceipt(rcpt: Receipt): Decoded[] {
  const out: Decoded[] = [];
  const ev = orderFilledEvent();
  for (const log of rcpt.logs) {
    const addr = log.address.toLowerCase();
    const topic0 = (log.topics[0] ?? "").toLowerCase();
    if (CLASSIC_EXCHANGES.has(addr) || topic0 === ORDER_FILLED_TOPIC0_V1.toLowerCase()) {
      throw new Error("classic/V1 exchange not supported for on-chain role; use --fast");
    }
    if (!KNOWN_EXCHANGES.has(addr)) continue;
    if (topic0 !== ORDER_FILLED_TOPIC0_V2.toLowerCase()) continue;
    const { args } = decodeEventLog({ abi: [ev], data: log.data as `0x${string}`, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] }) as unknown as {
      args: { maker: string; taker: string; side: number | bigint; makerAmountFilled: bigint; takerAmountFilled: bigint; fee: bigint };
    };
    out.push({ exchange: addr, maker: args.maker.toLowerCase(), taker: args.taker.toLowerCase(), side: Number(args.side), makerAmt: args.makerAmountFilled, takerAmt: args.takerAmountFilled, fee: args.fee });
  }
  return out;
}

// OrderFilled.fee is charged in USDC collateral for BOTH sides (verified by transfer reconciliation).
function takerFee(d: Decoded): { feeUsd: string } {
  return { feeUsd: new Decimal(d.fee.toString()).div(ONE).toString() };
}

export async function deriveRolesOnchain(txHashes: string[], opts: { getReceipt: (tx: string) => Promise<Receipt> }): Promise<TxRoleMap> {
  const result: TxRoleMap = new Map();
  const uniq = [...new Set(txHashes.map((t) => t.toLowerCase()))];
  for (const tx of uniq) {
    const decoded = decodeReceipt(await opts.getReceipt(tx));
    const byWallet = new Map<string, WalletRole>();
    const takerWallets = new Set<string>();
    const makerWallets = new Set<string>();
    for (const d of decoded) {
      if (d.taker === d.exchange) {           // taker order
        takerWallets.add(d.maker);
        byWallet.set(d.maker, { role: "taker", roleConf: "exact", ...takerFee(d) });
      } else {                                 // maker fill
        makerWallets.add(d.maker);
        if (!byWallet.has(d.maker)) byWallet.set(d.maker, { role: "maker", roleConf: "exact" });
      }
    }
    for (const w of takerWallets) if (makerWallets.has(w)) { const r = byWallet.get(w)!; r.roleConf = "ambiguous"; }
    result.set(tx, byWallet);
  }
  return result;
}
