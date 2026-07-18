# Gamma / CLOB API cheatsheet

Both APIs are public — no API key needed. All examples below were captured live on 2026-07-12 against the real World Cup match "Norway vs. England" (played 2026-07-11), so the resolve flow is real end-to-end. The connection resets intermittently under `curl` (SSL `Connection reset by peer`) — retry with `curl --retry 5 --retry-delay 2 --retry-all-errors ...` rather than treating one failed attempt as "the API is down."

## 1. Text search — `GET gamma-api.polymarket.com/public-search`

**Params:** `q=<text>` (required), `limit_per_type=<n>` (optional, caps results per category), `search_profiles=true` (optional — adds a `profiles[]` array of matching wallet profiles, e.g. `{"name":"THE.DONALD.TRUMP","proxyWallet":"0x455d..."}`; omitted/`false` by default, response then has only `events`+`pagination`).

**Read:** `events[].id`, `events[].slug`, `events[].title`, `events[].markets[]` — each member market has `conditionId`, `question`, `slug`, `clobTokenIds` (**a JSON-encoded string**, not a real array — `JSON.parse` it), `outcomes` (also a JSON-encoded string, typically `["Yes","No"]`).

**Real request:**
```
curl -s "https://gamma-api.polymarket.com/public-search?q=england+norway&limit_per_type=5"
```

**Trimmed real response** (one event, 3 of its markets shown; full response had `pagination.totalResults: 23` and no `profiles` key since `search_profiles` was not passed):
```json
{
  "events": [
    {
      "id": "672628",
      "slug": "fifwc-nor-eng-2026-07-11",
      "title": "Norway vs. England",
      "markets": [
        {
          "id": "2815441",
          "question": "Will Norway win on 2026-07-11?",
          "conditionId": "0x4b84a8e08cb3376c9e5be5cc5a37f7073de05cdf0810d2ad3fe745c4760ef3e0",
          "slug": "fifwc-nor-eng-2026-07-11-nor",
          "clobTokenIds": "[\"101609312241167873882360947921080859853145865660281247946682387335776462114544\", \"112687692561172166673230801968915167939088054199749652872179835554451355839012\"]",
          "outcomes": "[\"Yes\", \"No\"]"
        },
        {
          "id": "2815442",
          "question": "Will Norway vs. England end in a draw?",
          "conditionId": "0xdbbbbd6ea71cad296d859aa629497400402ab253a51350bddd5d761dbbad1460",
          "slug": "fifwc-nor-eng-2026-07-11-draw"
        },
        {
          "id": "2815444",
          "question": "Will England win on 2026-07-11?",
          "conditionId": "0x0f5e01cf1cabb6c49e424f230ca77a2ccd3e1ac63b31ae03ef749ac2bde7fa0e",
          "slug": "fifwc-nor-eng-2026-07-11-eng"
        }
      ]
    }
  ],
  "pagination": { "hasMore": true, "totalResults": 23 }
}
```
Note the pattern: one **event** ("Norway vs. England") groups several binary **markets** (win/win/draw). This is why disambiguation matters — a text search for a match returns multiple markets, not one.

## 2. Event → markets — `GET gamma-api.polymarket.com/events?slug=<slug>`

**Params:** `slug=<event slug>` (from step 1's `events[].slug`), or use `GET /events/<id>` with the numeric `id`.

**Read:** response is a **top-level array** of event objects (even when filtering by one slug). Each event has `markets[]` with `conditionId`, `question`, `slug` per member market (same fields as embedded in public-search, plus much more event metadata — `title`, `startDate`, `closed`, `live`, `score`, etc.).

**Real request:**
```
curl -s "https://gamma-api.polymarket.com/events?slug=fifwc-nor-eng-2026-07-11"
```

**Trimmed real response:**
```json
[
  {
    "id": "672628",
    "slug": "fifwc-nor-eng-2026-07-11",
    "title": "Norway vs. England",
    "markets": [
      { "id": "2815441", "question": "Will Norway win on 2026-07-11?", "conditionId": "0x4b84a8e08cb3376c9e5be5cc5a37f7073de05cdf0810d2ad3fe745c4760ef3e0", "slug": "fifwc-nor-eng-2026-07-11-nor" },
      { "id": "2815442", "question": "Will Norway vs. England end in a draw?", "conditionId": "0xdbbbbd6ea71cad296d859aa629497400402ab253a51350bddd5d761dbbad1460", "slug": "fifwc-nor-eng-2026-07-11-draw" },
      { "id": "2815444", "question": "Will England win on 2026-07-11?", "conditionId": "0x0f5e01cf1cabb6c49e424f230ca77a2ccd3e1ac63b31ae03ef749ac2bde7fa0e", "slug": "fifwc-nor-eng-2026-07-11-eng" }
    ]
  }
]
```

## 3. Token → conditionId — `GET gamma-api.polymarket.com/markets/keyset?clob_token_ids=<tokenId>`

**This is the endpoint `resolveMarket` (`packages/trade-analysis/src/resolve.ts`) uses** when given a tokenId instead of a conditionId — confirmed by reading `resolve.ts`: it calls this exact URL and parses the response with `z.object({ markets: z.array(z.object({ conditionId: z.string() })) })`.

**Params:** `clob_token_ids=<tokenId>` (single token id, decimal string), `limit`, and `closed`.

**`closed` is the one that bites.** It defaults to **false**, so a bare query returns **open markets only** — a resolved market comes back as an empty list, not an error. Pass `closed=true` to search resolved markets. It is a filter, not a widener: `closed=true` *excludes* open markets, so you cannot pass it unconditionally. `resolveMarket` therefore queries without it first, then retries with `closed=true`, and only errors when both slices are empty.

**Read:** response is an **object with a `markets` array** (`{"markets": []}` if not found) — *not* the top-level array the legacy `/markets` endpoint returned. Each element has `conditionId` (what `resolve.ts` extracts), plus `question`, `slug`, `clobTokenIds` (JSON-encoded string array), `outcomes` (JSON-encoded string array), `active`, `closed`.

**Real request (open market):**
```
curl -s "https://gamma-api.polymarket.com/markets/keyset?limit=1&clob_token_ids=98022490269692409998126496127597032490334070080325855126491859374983463996227"
```

**Trimmed real response:**
```json
{
  "markets": [
    {
      "id": "540817",
      "question": "New Rihanna Album before GTA VI?",
      "conditionId": "0x1fad72fae204143ff1c3035e99e7c0f65ea8d5cd9bd1070987bd1a3316f772be",
      "slug": "new-rhianna-album-before-gta-vi-926",
      "clobTokenIds": "[\"98022490269692409998126496127597032490334070080325855126491859374983463996227\", \"53831553061883006530739877284105938919721408776239639687877978808906551086026\"]",
      "outcomes": "[\"Yes\", \"No\"]",
      "active": true,
      "closed": false
    }
  ]
}
```

**Real request (RESOLVED/closed market tokenId — needs `closed=true`):**
```
curl -s "https://gamma-api.polymarket.com/markets/keyset?limit=1&clob_token_ids=866370305411260885620344443432925550941005016614412438009174244566837236043"
```
Without `closed=true` this returns `{"markets": []}`. Adding it resolves the market:
```json
{
  "markets": [
    {
      "id": "2815444",
      "question": "Will England win on 2026-07-11?",
      "conditionId": "0x0f5e01cf1cabb6c49e424f230ca77a2ccd3e1ac63b31ae03ef749ac2bde7fa0e",
      "slug": "fifwc-nor-eng-2026-07-11-eng",
      "active": true,
      "closed": true
    }
  ]
}
```
Note `active: true` alongside `closed: true` — **`active` does not tell you whether a market is still trading.** Filter on `closed`.

Resolved tokenIds are now fully resolvable, so this is no longer a dead end. If *both* slices come back empty, the tokenId is genuinely unknown to Gamma — fall back to getting the **conditionId** from search/event lookup (steps 1-2).

## 4. conditionId → market detail — `GET clob.polymarket.com/markets/<conditionId>`

**Params:** conditionId in the path (0x-prefixed hex string).

**Read:** `condition_id`, `question`, `market_slug`, `neg_risk`, `tokens[]` — each token has `token_id` (the outcome tokenId) and `outcome` (`"Yes"` / `"No"`), plus `price` and `winner` for resolved markets. This endpoint works for **both open and closed/resolved markets** (unlike step 3) — it's the reliable way to get tokenIds once you have a conditionId.

**Real request (the same resolved England-win market, conditionId from step 1):**
```
curl -s "https://clob.polymarket.com/markets/0x0f5e01cf1cabb6c49e424f230ca77a2ccd3e1ac63b31ae03ef749ac2bde7fa0e"
```

**Trimmed real response:**
```json
{
  "condition_id": "0x0f5e01cf1cabb6c49e424f230ca77a2ccd3e1ac63b31ae03ef749ac2bde7fa0e",
  "question": "Will England win on 2026-07-11?",
  "market_slug": "fifwc-nor-eng-2026-07-11-eng",
  "neg_risk": true,
  "tokens": [
    { "token_id": "866370305411260885620344443432925550941005016614412438009174244566837236043", "outcome": "Yes", "price": 0, "winner": false },
    { "token_id": "98036956977988822349195253378492641100614259039336046371319558339271157316495", "outcome": "No", "price": 1, "winner": true }
  ],
  "closed": true,
  "active": true
}
```
This matches the shape `resolve.ts`'s `ClobMarket` Zod schema expects exactly (`condition_id`, `question`, `market_slug`, `neg_risk`, `tokens[].token_id`, `tokens[].outcome`).

## Discovery flow summary

```
text description
  -> public-search?q=...           (get candidate events/markets, disambiguate)
  -> events?slug=<slug>            (optional: confirm full set of markets for one event)
  -> pick one market's conditionId
  -> clob.polymarket.com/markets/<conditionId>   (authoritative tokens[] + outcome names)
```
Only use `markets/keyset?clob_token_ids=<tokenId>` when you're starting from a tokenId (not a conditionId) and need to find its conditionId — and remember it returns open markets only unless you add `closed=true`, so a resolved token needs both queries before you conclude it's missing.
