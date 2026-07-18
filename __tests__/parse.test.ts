import { test, expect } from "bun:test";
import { detectMarketIdKind, parseAnchorMs, parseDurationSec } from "../src/parse.ts";

test("detectMarketIdKind: 0x66 -> conditionId", () => {
  expect(detectMarketIdKind("0x" + "a".repeat(64))).toBe("conditionId");
});
test("detectMarketIdKind: long decimal -> tokenId", () => {
  expect(detectMarketIdKind("89969054941820905260983372139923320038115693660830083208242956669285748681379")).toBe("tokenId");
});
test("parseAnchorMs: seconds -> ms", () => {
  expect(parseAnchorMs(1751083200)).toBe(1751083200000);
});
test("parseAnchorMs: ms passthrough", () => {
  expect(parseAnchorMs(1751083200000)).toBe(1751083200000);
});
test("parseAnchorMs: ISO-UTC", () => {
  expect(parseAnchorMs("2026-06-28T02:00:00Z")).toBe(Date.parse("2026-06-28T02:00:00Z"));
});
test("parseDurationSec: units", () => {
  expect(parseDurationSec("10s", 0)).toBe(10);
  expect(parseDurationSec("10m", 0)).toBe(600);
  expect(parseDurationSec("2h", 0)).toBe(7200);
  expect(parseDurationSec(15, 0)).toBe(15);
  expect(parseDurationSec(undefined, 42)).toBe(42);
});
