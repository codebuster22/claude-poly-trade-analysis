import { test, expect } from "bun:test";
import { fetchNames } from "../src/identity.ts";

test("fetchNames maps wallet -> name, tolerates failures", async () => {
  const fetchImpl = (async (u: string) => {
    if (u.includes("0xgood")) return new Response(JSON.stringify({ name: "Alice" }), { status: 200 });
    return new Response("err", { status: 500 });
  }) as unknown as typeof fetch;
  const names = await fetchNames(["0xgood", "0xbad"], { fetchImpl });
  expect(names.get("0xgood")).toBe("Alice");
  expect(names.has("0xbad")).toBe(false);
});
