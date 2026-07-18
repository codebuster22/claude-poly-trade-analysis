// abi.ts - Polymarket OrderFilled event ABI + exchange addresses + topic0 constants
// Exports: ORDER_FILLED_V2_ABI, orderFilledEvent, KNOWN_EXCHANGES, ORDER_FILLED_TOPIC0_V2
// Related: roles/onchain.ts. Verified 2026-07-12 against Neg-Risk Exchange logs.
import { keccak256, toHex, type AbiEvent } from "viem";

export const ORDER_FILLED_V2_ABI = {
  type: "event",
  name: "OrderFilled",
  inputs: [
    { name: "orderHash", type: "bytes32", indexed: true },
    { name: "maker", type: "address", indexed: true },
    { name: "taker", type: "address", indexed: true },
    { name: "side", type: "uint8", indexed: false },
    { name: "tokenId", type: "uint256", indexed: false },
    { name: "makerAmountFilled", type: "uint256", indexed: false },
    { name: "takerAmountFilled", type: "uint256", indexed: false },
    { name: "fee", type: "uint256", indexed: false },
    { name: "builder", type: "bytes32", indexed: false },
    { name: "metadata", type: "bytes32", indexed: false },
  ],
} as const satisfies AbiEvent;

export function orderFilledEvent(): AbiEvent {
  return ORDER_FILLED_V2_ABI;
}

export const ORDER_FILLED_TOPIC0_V2 = keccak256(
  toHex("OrderFilled(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,bytes32,bytes32)"),
);
// classic/V1 signature (no side/builder/metadata) — used only to DETECT unsupported markets.
export const ORDER_FILLED_TOPIC0_V1 = keccak256(
  toHex("OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)"),
);

// lowercased. Neg-Risk Exchange + standard CTF Exchange (V2) — docs/reference/polymarket/INDEX.md.
export const KNOWN_EXCHANGES = new Set<string>([
  "0xe2222d279d744050d28e00520010520000310f59",
  "0xe111180000d2663c0091e4f400237545b87b996b",
]);
// classic/V1 CTF Exchange + classic Neg-Risk CTF Exchange. v1 does NOT decode these — it errors.
export const CLASSIC_EXCHANGES = new Set<string>([
  "0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e",
  "0xc5d563a36ae78145c45a50134d48a1215220f80a",
]);
