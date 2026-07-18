import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAnalyzeFills } from "../analyze-fills.ts";

const gated = process.env.RUN_INTEGRATION === "1" ? test : test.skip;

gated("runAnalyzeFills end-to-end on the known-answer trade (live Falcon + RPC)", async () => {
  const out = mkdtempSync(join(tmpdir(), "ta-live-"));
  const s = await runAnalyzeFills({
    market: "0xb465c0d920be7fa9413909befc3989247de10a1d4feca2621bb36f9a62191a12",
    anchor: "2026-06-28T04:14:38Z", before: "1s", after: "1s", out,
  });
  const t = s.topTakers.find((w) => w.wallet === "0xe9076a87c5ed90ef16e6fe6529c943baeca0cff6");
  expect(t).toBeDefined();
  expect(Number(t!.feeUsd)).toBeCloseTo(0.021430, 6);
}, 30000);
