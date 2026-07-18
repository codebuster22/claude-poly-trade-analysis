# @titus/trade-analysis

Annotated Polymarket fills for a market + time window, with authoritative on-chain maker/taker role and real fee.

## Install as a Claude Code plugin

To use this as a Claude Code plugin — ask in plain English ("who traded around this goal?") and get a CSV plus an optional visualization — follow the **[installation guide → PLUGIN.md](./PLUGIN.md)** (marketplace add, `/plugin install`, and `/trade-analysis:setup` for keys).

The rest of this README covers the underlying library + CLI.

## Usage
    FALCON_API_KEY=... POLYGON_RPC_URL=... \
      bun packages/trade-analysis/src/cli.ts \
      --market <conditionId|tokenId> --anchor <sec|ms|ISO> \
      --before 10s --after 10s [--role taker] [--side SELL] \
      [--min-size 100 --size-unit usdc|shares] [--fast] [--identity] [--out trades.csv]

Programmatic: `import { analyzeTrades } from "@titus/trade-analysis"`.

## Output columns

CSV/JSON columns are camelCase (`CSV_COLUMNS` in `src/output.ts`), one row per wallet-fill:

```
n, tx, timestamp, offsetS, market, outcome, tokenId, wallet, walletName,
side, role, roleSource, roleConf, size, price, usdc, feeUsd, counterparty
```

## Notes
- One row per wallet-fill (both sides of a match). Summing `usdc` across ALL rows double-counts volume — sum one `side`/`role`.
- `--fast` uses the Falcon-only heuristic (no RPC, no fee, approximate role). Default derives role on-chain (exact + real fee).
- `feeUsd` is the real taker fee = `OrderFilled.fee / 1e6` (charged in USDC collateral for both buy and sell; taker rows only).
- `--market` takes either a conditionId or a tokenId; a tokenId also filters output to that one outcome. Resolved/closed markets work — Gamma is searched open-first, then with `closed=true`.

## Network resilience
- Calls to the Polymarket CLOB, Gamma, and Falcon trade API retry with exponential backoff on transient failures (connection drops, 408/425/429/5xx); other 4xx and non-JSON responses fail immediately (not retried).
- Max attempts: `TRADE_ANALYSIS_MAX_RETRIES` env (default 3), overridable via the MCP `analyze_fills` tool's `maxRetries` arg or `AnalyzeDeps.maxRetries` programmatically.
- All error messages report the upstream **host only** (never the full URL, since the Polygon RPC URL embeds an API key). Retry diagnostics surface in the MCP tool's `summary.warnings` array (model-visible) and on stderr (human-visible).

## Env
- `FALCON_API_KEY` (required) · `POLYGON_RPC_URL` (required unless `--fast`).
- `TRADE_ANALYSIS_MAX_RETRIES` (optional) — max attempts per upstream call on transient failure (default 3).
