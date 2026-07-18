// identity.ts - best-effort wallet -> name/pseudonym via Gamma public-profile
// Exports: fetchNames
// Related: types.ts. Never throws; failures omit the wallet.
export async function fetchNames(wallets: string[], opts: { fetchImpl?: typeof fetch } = {}): Promise<Map<string, string>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const out = new Map<string, string>();
  for (const w of [...new Set(wallets.map((x) => x.toLowerCase()))]) {
    try {
      const res = await fetchImpl(`https://gamma-api.polymarket.com/public-profile?address=${w}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const j = (await res.json()) as { name?: string; pseudonym?: string };
      const name = j.name || j.pseudonym;
      if (name) out.set(w, name);
    } catch { /* best-effort */ }
  }
  return out;
}
