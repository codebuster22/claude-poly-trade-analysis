import { test, expect } from "bun:test";
import { parseArgs } from "../src/args.ts";

test("parseArgs maps flags to TradeQuery", () => {
  const { query, out } = parseArgs(["--market", "0xabc", "--anchor", "2026-06-28T02:00:00Z", "--before", "10s", "--after", "10m", "--role", "taker", "--side", "SELL", "--min-size", "100", "--size-unit", "usdc", "--fast", "--identity", "--out", "x.csv"]);
  expect(query.market).toBe("0xabc");
  expect(query.before).toBe("10s");
  expect(query.role).toBe("taker");
  expect(query.minSize).toBe(100);
  expect(query.sizeUnit).toBe("usdc");
  expect(query.roleSource).toBe("heuristic"); // --fast
  expect(query.identity).toBe(true);
  expect(out).toBe("x.csv");
});
test("parseArgs requires --market and --anchor", () => {
  expect(() => parseArgs(["--anchor", "1"])).toThrow(/market/i);
});
