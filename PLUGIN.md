# trade-analysis plugin

Ask in plain English — "who traded around this goal on Polymarket?" — and get an annotated CSV of the
wallet-fills (takers vs makers, authoritative on-chain role, and the real taker fee) plus an optional
visualization.

## Prerequisites

1. **Bun** — installed and on your PATH (check with `bun --version`). The plugin runs its MCP server with
   `bun`; without it the server silently won't start. Install from https://bun.sh
2. **Claude Code v2.1.203+** (recommended). Older versions abort a tool call after ~30 min of silent work,
   which can cut off a large on-chain analysis — see [Large windows](#large-windows--long-running-analyses).
3. **Two secrets** (details in [Provide your secrets](#provide-your-secrets)):
   - **Falcon API key** — access to the Falcon / Polymarket trade-data API (the source of the raw fills).
     Ask whoever shared the plugin with you.
   - **Polygon RPC URL** — a Polygon **mainnet** JSON-RPC endpoint (e.g. Alchemy, Infura, or QuickNode — a free
     tier works — or a public node). Used to decode the on-chain maker/taker role + real fee. Not required in
     *fast mode*. ⚠️ Keyed providers put the API key in the URL, so treat the whole URL as a secret.

## Install

    /plugin marketplace add codebuster22/claude-poly-trade-analysis
    /plugin install trade-analysis@trade-analysis-plugin

## Provide your secrets

**Recommended — run `/trade-analysis:setup`** (works on every Claude Code version):

    /trade-analysis:setup

It asks for your **Falcon API key** and **Polygon RPC URL** and stores them in
`~/.config/trade-analysis/config.json` (created `chmod 600` — readable only by you). The MCP server reads this
file on its next tool call. Run the same command any time to **rotate** your keys.

If the tool still reports a missing key right after setup, run `/reload-plugins` (or restart the session) so
the server reloads.

**Alternative ways to provide keys:**
- **Masked install prompt** — on some Claude Code versions you're prompted (masked) for both keys during
  `/plugin install`; if so, the plugin picks them up automatically. This isn't available on every version, so
  `/trade-analysis:setup` is the reliable path.
- **Environment variables** — export them before launching Claude Code:

      FALCON_API_KEY=<your-key> POLYGON_RPC_URL=<your-rpc-url> claude

The plugin looks for keys in this order: `FALCON_API_KEY` / `POLYGON_RPC_URL` environment variables → Claude
Code's install-time values → the `~/.config/trade-analysis/config.json` file.

## Use it

Just ask, for example:

> find the takers and makers on Polymarket around `<market>` at `<time>`, ±10s window

You'll get a CSV written to `./trade-analysis-out/` and, if you want, a visualization.

- **On-chain by default** — exact maker/taker role + the real taker fee (needs the Polygon RPC URL).
- **Fast mode** — ask for "fast mode" (the tool passes `fast: true`) to skip the RPC: faster, but role is
  approximate and there's no fee. Use it when you don't have an RPC or don't need exactness.
- One row per wallet-fill — **don't sum `usdc` across all rows** (that double-counts each trade); sum a single
  `side` or `role` instead.

## Large windows / long-running analyses

On-chain mode fetches one RPC receipt per unique transaction, sequentially, so a large window can run for many
minutes. The plugin's `.mcp.json` sets a generous per-server `timeout` (6h) so Claude Code won't abort a long
call at its default 30-minute idle timeout (**requires Claude Code v2.1.203+**). Notes:

- For a big window, prefer **fast mode** (skips the per-tx RPC — minutes, not an hour) or narrow the window.
- On an older Claude Code, raise the idle limit at launch instead:
  `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=21600000 claude` (6h, in ms).
- To go beyond 6h, edit the `timeout` in `.mcp.json` (ms) and bump the plugin version, or set `MCP_TOOL_TIMEOUT`.
- A server-side progress "keep-alive" does **not** work (Claude Code doesn't send a progress token — GH #58687),
  so the `timeout` value is the lever.

## Troubleshooting

- **"Falcon API key not set" / missing-key error** → run `/trade-analysis:setup`, then `/reload-plugins`.
- **The tool never responds / the server won't start** → confirm `bun` is installed and on your PATH
  (`bun --version`).
- **A long analysis got cut off** → see [Large windows](#large-windows--long-running-analyses); use fast mode,
  narrow the window, or raise the idle timeout.
- **"The socket connection was closed unexpectedly" / connection errors** → transient Polymarket-endpoint
  flakiness (their CLOB/Gamma API resets connections intermittently). The plugin already retries with backoff —
  just re-run. Raise the attempts with the tool's `maxRetries` arg or `TRADE_ANALYSIS_MAX_RETRIES` (default 3).

## Owner: publishing an update

Bump the `version` in `.claude-plugin/plugin.json` first (the plugin cache is version-keyed — consumers only
pick up changes on a new version), then:

    PUBLIC_REMOTE=git@github.com:codebuster22/claude-poly-trade-analysis.git bash packages/trade-analysis/scripts/publish-plugin.sh

Consumers update with `/plugin marketplace update trade-analysis-plugin` then `/reload-plugins`.
