---
name: trade-fills-analysis
description: Find and (optionally) visualize the Polymarket wallet-fills — takers vs makers, role, and real fee — around a market and moment. Use when the user asks who traded / find traders / fills / takers and makers around a market at a time, event, goal, or price move.
---

# Trade fills analysis (workflow)

Guides a plain-English request to a CSV + an optional visualization. Deterministic analysis is the `analyze_fills` MCP tool; you resolve the fuzzy inputs and shape the output.

## Process
1. **Resolve the market** — use the `polymarket-discovery` skill to get a conditionId (whole market) or a specific outcome tokenId.
2. **Resolve the anchor timestamp.** Prefer the user's explicit time. Otherwise find it and **confirm before running**: web-search the match/kickoff + goal minute → UTC, and/or inspect the market's price move around the match window. State the candidate time and ask the user to confirm. Default window: ±10s (adjust on request).
3. **Run `analyze_fills`** with `{ market, anchor, before, after, ... }`. Default on-chain (exact role + real fee). Only pass `fast: true` if there's no RPC. It writes a CSV and returns a compact summary.
4. **Report the summary** (counts, top takers/makers, total taker fee), then **offer a visualization — do not force it**: ask whether they want one and *what to see*, offering options like a timeline of fills around the anchor (colored by role, sized by usdc), a taker-vs-maker split, a per-wallet leaderboard, a fee breakdown, or a combined dashboard.
5. **If they want it:** load the built-in `artifact-design` and `dataviz` skills first, read the CSV at `summary.csvPath`, and publish a self-contained HTML artifact via the built-in `Artifact` tool shaped to their choice. If the `Artifact` tool is unavailable, write a self-contained HTML file and render it via SendUserFile.
6. **Present** the artifact (or CSV-only if declined) + the CSV path + the summary.

## Red flags
- **Never sum `usdc` across ALL rows** — one row per wallet-fill double-counts volume. Sum one `side` or `role` (e.g. `role === "taker"`).
- `feeUsd` is **taker-only and on-chain-only**; makers and `--fast` rows have none.
- On-chain = exact role + real fee; `fast` = approximate role, no fee. Say which was used.
- If the market or the time is ambiguous, **ask the user — don't guess**.
- If `analyze_fills` reports a missing key, tell the user to run `/trade-analysis:setup`.

## Example
"Who were the takers on England's 2nd goal vs Norway?" → discover the market (conditionId) → confirm the goal time (web-search kickoff + 2nd-goal minute, or the price jump) → `analyze_fills({ market, anchor, before:"10s", after:"10s", role:"taker" })` → summarize top takers + fees → offer a timeline viz → build it via artifact-design/dataviz/Artifact.
