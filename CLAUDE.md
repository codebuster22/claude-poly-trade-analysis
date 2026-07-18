# trade-analysis

## This package
Market-agnostic annotated fills for a Polymarket market + time window: pulls raw fills from Falcon, derives authoritative on-chain maker/taker role + real fee, joins market/wallet metadata, and serializes to CSV/JSON. Cold-path CLI/library tool — not part of the hot trading path.

## Commands
- `bun test packages/trade-analysis` — full suite (parse/resolve/falcon/roles/enrich/filter/output/identity/analyze/args).
- `bun packages/trade-analysis/src/cli.ts --market <id> --anchor <ts> --before 10s --after 10s` — run the CLI (needs `FALCON_API_KEY`; also `POLYGON_RPC_URL` unless `--fast`).

## Key exports (`src/index.ts`)
- `analyzeTrades(query: TradeQuery, deps?: AnalyzeDeps): Promise<AnnotatedFill[]>` — the pipeline entrypoint.
- `AnalyzeDeps` — `{ fetchImpl?, getReceipt?, apiKey?, maxRetries?, onWarn? }`, all optional DI seams (see Invariants). `maxRetries` caps attempts per upstream call (CLOB/Gamma/Falcon) on transient failure; `onWarn: NetLogger` (`(msg: string) => void`, re-exported from `src/net.ts`) is called with a host-only diagnostic string on each retry.
- `toCsv`, `toJson`, `CSV_COLUMNS` (`src/output.ts`) — serializers; `CSV_COLUMNS` is `(keyof AnnotatedFill)[]`, so headers are **camelCase** (`offsetS`, `tokenId`, `feeUsd`, `roleSource`, `roleConf`, `walletName`, `counterparty`, ...) — never snake_case.
- Types re-exported from `types.ts`: `TradeQuery`, `AnnotatedFill`, `Side`, `Role`, `RoleSource`, `RoleConf`, `SizeUnit`, `FalconRow`, `MarketMeta`, `WalletRole`, `TxRoleMap`.
- `parseArgs` (`src/args.ts`) — CLI argv -> `{ query: TradeQuery; out?: string }`.

## Pipeline (`analyzeTrades`)
`resolve` (conditionId|tokenId -> `MarketMeta` via CLOB + Gamma) -> `falcon.pullWindow` (padded-window pull + dedup-by-id from Falcon; Falcon has no role field and returns BOTH sides of each match) -> `roles.deriveRoles` (on-chain or heuristic, dispatched by `roleSource`) -> `enrich` (join rows + roles + meta into `AnnotatedFill`, compute `usdc = size * price`, `counterparty`) -> `filter.applyFilters` (side/role/minSize+unit/tokenId, then renumber `n`) -> caller serializes via `toCsv`/`toJson`.

## Invariants / boundaries
- **Volume double-count**: output is one row per wallet-fill — both the maker and taker side of a match each get a row. Summing `usdc` across ALL rows double-counts volume. Sum over a single `side` or `role` (e.g. `role === "taker"`) to get true traded volume.
- **On-chain role rule** (`src/roles/onchain.ts`): decode `OrderFilled` logs from the tx receipt; the log whose `taker == emitting exchange address` identifies the taker order (`roleConf: "exact"`; `"ambiguous"` if a wallet appears as both maker and taker in the same tx). `feeUsd = OrderFilled.fee / 1e6`, charged in USDC collateral for BOTH buy and sell (transfer-reconciled) — populated on taker rows only.
- **`--fast` / `roleSource: "heuristic"`** (`src/roles/heuristic.ts`): Falcon-only net-notional aggressor inference, no RPC call, no fee, `roleConf` is `"high"|"med"|"low"` (never `"exact"`). Use only when RPC access is unavailable or exactness isn't required.
- **Classic/V1 exchanges are not decoded on-chain**: `deriveRolesOnchain` throws `"classic/V1 exchange not supported for on-chain role; use --fast"` for those addresses/topics — it never silently returns `role: "unknown"`.
- **Tests are hermetic**: every network/RPC seam is dependency-injected (`fetchImpl`, `getReceipt`, `apiKey` on `AnalyzeDeps`, or a passed `fetchImpl` to `resolveMarket`/`fetchNames`). Retry tests additionally inject `sleep: async () => {}` (an opt on `resolveMarket`/`pullWindow`/`fetchJson`) so backoff never actually waits. Tests never hit the real Falcon API, Gamma, CLOB, or Polygon RPC — see `__tests__/analyze.test.ts` for the pattern.
- **Network resilience** (`src/net.ts`): CLOB, Gamma, and Falcon calls retry with exponential backoff (`backoffMs`: 300ms·2^attempt, capped 3s) on connection failure or a retryable HTTP status (408/425/429/5xx); other 4xx and non-JSON-on-2xx are terminal (no retry). Attempts are capped by `maxRetries` — `AnalyzeDeps.maxRetries` / the MCP `analyze_fills` tool's `maxRetries` arg / env `TRADE_ANALYSIS_MAX_RETRIES` (default 3), in that override order. All upstream error messages carry **host only** (`new URL(x).host`) — never the raw URL — because the Polygon RPC URL embeds an API key in its path; the original error is preserved as `.cause`, never interpolated into `.message` (and viem's own `.message` from `roles/onchain.ts`'s receipt getter is never surfaced, since it embeds the full RPC URL). Retry/failure diagnostics are model-visible via `mcp/analyze-fills.ts`'s `FillsSummary.warnings: string[]` (always present, empty when nothing notable) — the MCP tool result is the only channel the model sees; the same messages also go to `process.stderr` for the human (Claude Code does not forward MCP stderr/logging notifications to the model).

## Gotchas / Does-NOT
- Does NOT place orders, hold strategy state, or touch NATS — pure read/analysis tool, invoked standalone or from scripts.
- **Gamma `closed` defaults to false**: `resolve.ts` looks a tokenId up via `GET /markets/keyset?clob_token_ids=…` (object-wrapped `{ markets: [...] }`, *not* the legacy top-level array from `/markets`). That slice is open-markets-only, and `closed=true` *excludes* open markets rather than widening the search — so it cannot be sent unconditionally. `resolveMarket` queries open first, retries with `closed=true`, and only throws when both are empty. Resolved/archived tokenIds therefore resolve normally now.
- Does NOT compute fees for maker rows or under `--fast` — `feeUsd` is on-chain-taker-only.
- `--out` default path (`cli.ts`) is derived from `market`+`anchor`, not from the market slug — collisions are possible across close-in-time queries on the same id prefix.

## Related
- Design spec → `docs/superpowers/specs/2026-07-12-trade-analysis-design.md` (authoritative source for the taker==exchange rule and fee semantics).
- Implementation plan → `docs/superpowers/plans/2026-07-12-trade-analysis.md`.
- CLI usage / columns / env → `./README.md`.
