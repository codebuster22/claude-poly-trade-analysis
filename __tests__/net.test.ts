import { test, expect } from "bun:test";
import { safeHost, backoffMs, fetchJson } from "../src/net.ts";

test("safeHost strips creds/path (never leaks a secret in the path) and falls back on an invalid URL", () => {
  const host = safeHost("https://user:sec@h.example.com:8443/v2/KEY");
  expect(host).toBe("h.example.com:8443");
  expect(host).not.toContain("sec");
  expect(host).not.toContain("KEY");
  expect(safeHost("nope")).toBe("unknown host");
});

test("backoffMs is exponential base 300ms doubling, capped at 3000ms, monotonic non-decreasing", () => {
  const seq = [0, 1, 2, 3, 4, 5].map(backoffMs);
  expect(seq).toEqual([300, 600, 1200, 2400, 3000, 3000]);
  for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThanOrEqual(seq[i - 1]!);
});

test("fetchJson: retry-then-succeed on connection failure", async () => {
  let calls = 0;
  const logs: string[] = [];
  const fetchImpl = (async () => {
    calls++;
    if (calls < 3) throw new Error("The socket connection was closed unexpectedly");
    return new Response(JSON.stringify({ ok: 1 }), { status: 200 });
  }) as unknown as typeof fetch;
  const result = await fetchJson(fetchImpl, "https://clob.polymarket.com/markets/x", {
    label: "Polymarket CLOB", maxRetries: 3, sleep: async () => {}, log: (m) => logs.push(m),
  });
  expect(result).toEqual({ ok: 1 });
  expect(calls).toBe(3);
  expect(logs.length).toBe(2);
});

test("fetchJson: exhausts retries on persistent connection failure -> attributed, host-only, cause preserved", async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls++; throw new Error("boom"); }) as unknown as typeof fetch;
  let caught: Error | undefined;
  try {
    await fetchJson(fetchImpl, "https://clob.polymarket.com/markets/x", { label: "Polymarket CLOB", maxRetries: 3, sleep: async () => {} });
  } catch (e) { caught = e as Error; }
  expect(caught).toBeDefined();
  expect(caught!.message).toMatch(/Couldn't reach Polymarket CLOB \(clob\.polymarket\.com\) after 3 attempt/);
  expect(caught!.cause).toBeDefined();
  expect(calls).toBe(3);
});

test("fetchJson: retryable status (503) retries then succeeds", async () => {
  let calls = 0;
  const logs: string[] = [];
  const fetchImpl = (async () => {
    calls++;
    if (calls < 3) return new Response("service unavailable", { status: 503 });
    return new Response(JSON.stringify({ ok: 1 }), { status: 200 });
  }) as unknown as typeof fetch;
  const result = await fetchJson(fetchImpl, "https://clob.polymarket.com/markets/x", {
    label: "Polymarket CLOB", maxRetries: 3, sleep: async () => {}, log: (m) => logs.push(m),
  });
  expect(result).toEqual({ ok: 1 });
  expect(calls).toBe(3);
  expect(logs.length).toBe(2);
});

test("fetchJson: terminal 404 -> no retry, fetch called once", async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls++; return new Response("not found", { status: 404 }); }) as unknown as typeof fetch;
  await expect(fetchJson(fetchImpl, "https://clob.polymarket.com/markets/x", { label: "Polymarket CLOB", maxRetries: 3, sleep: async () => {} }))
    .rejects.toThrow(/returned HTTP 404/);
  expect(calls).toBe(1);
});

test("fetchJson: non-JSON 2xx -> terminal, no retry, fetch called once", async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls++; return new Response("<html>", { status: 200 }); }) as unknown as typeof fetch;
  await expect(fetchJson(fetchImpl, "https://clob.polymarket.com/markets/x", { label: "Polymarket CLOB", maxRetries: 3, sleep: async () => {} }))
    .rejects.toThrow(/non-JSON response/);
  expect(calls).toBe(1);
});
