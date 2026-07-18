---
name: polymarket-discovery
description: Resolve a natural-language Polymarket market description into a conditionId and outcome tokenIds using the Gamma API. Use when the user names a market, event, match, or outcome in words ("England vs Norway QF", "will X win") and you need the on-chain identifiers before analyzing trades.
---

# Polymarket market discovery

Turn a description into identifiers. Endpoints + real response shapes: `references/gamma-api.md`.

## Process
1. **Search** by the user's words: `GET https://gamma-api.polymarket.com/public-search?q=<text>`. Read the returned events/markets.
2. **Disambiguate.** If several plausible matches, show the user 2-4 candidates (question + slug + date) and let them pick. Never silently guess between distinct markets.
3. **Get the conditionId** for the chosen market, and its **outcome tokenIds** (Yes/No) via `https://clob.polymarket.com/markets/<conditionId>` (`tokens[].token_id` + `outcome`).
4. **Hand off** the conditionId (for the whole market) or a specific tokenId (for one outcome) to the `analyze_fills` tool / the trade-fills-analysis workflow.

## Red flags
- An archived/resolved **tokenId** may not resolve via Gamma → use the **conditionId** instead (the tool errors with this hint).
- Confirm the **outcome** (Yes vs No) matches what the user means before filtering by tokenId.
- Market titles are not unique across dates/leagues — confirm the date/competition.

## Example
"England vs Norway quarter-final" → `public-search?q=england norway` → pick the QF market → `clob.polymarket.com/markets/<cid>` → conditionId `0x…` + Yes/No tokenIds. Hand the conditionId to `analyze_fills`.
