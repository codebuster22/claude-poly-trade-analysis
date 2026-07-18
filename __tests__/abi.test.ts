import { test, expect } from "bun:test";
import { keccak256, toHex } from "viem";
import { ORDER_FILLED_TOPIC0_V2, ORDER_FILLED_TOPIC0_V1, KNOWN_EXCHANGES, CLASSIC_EXCHANGES } from "../src/roles/abi.ts";

test("V2 OrderFilled topic0 matches the on-chain signature", () => {
  const sig = "OrderFilled(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,bytes32,bytes32)";
  expect(ORDER_FILLED_TOPIC0_V2).toBe(keccak256(toHex(sig)));
  expect(ORDER_FILLED_TOPIC0_V2).toBe("0xd543adfd945773f1a62f74f0ee55a5e3b9b1a28262980ba90b1a89f2ea84d8ee");
});
test("V1 topic0 constant matches the classic signature", () => {
  expect(ORDER_FILLED_TOPIC0_V1).toBe(keccak256(toHex("OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)")));
});
test("known (V2) exchanges include neg-risk + standard, lowercased", () => {
  expect(KNOWN_EXCHANGES.has("0xe2222d279d744050d28e00520010520000310f59")).toBe(true);
  expect(KNOWN_EXCHANGES.has("0xe111180000d2663c0091e4f400237545b87b996b")).toBe(true);
});
test("classic (V1) exchanges present + disjoint from V2", () => {
  expect(CLASSIC_EXCHANGES.has("0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e")).toBe(true);
  expect(CLASSIC_EXCHANGES.has("0xc5d563a36ae78145c45a50134d48a1215220f80a")).toBe(true);
  for (const a of CLASSIC_EXCHANGES) expect(KNOWN_EXCHANGES.has(a)).toBe(false);
});
