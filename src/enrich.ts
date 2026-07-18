// enrich.ts - join Falcon rows with roles + market meta into AnnotatedFill rows
// Exports: enrich
// Related: types.ts
import Decimal from "decimal.js";
import type { AnnotatedFill, FalconRow, MarketMeta, RoleSource, TxRoleMap } from "./types.ts";

export function enrich(args: { rows: FalconRow[]; roles: TxRoleMap; meta: MarketMeta; roleSource: RoleSource; anchorMs: number; names?: Map<string, string> }): AnnotatedFill[] {
  const { rows, roles, meta, roleSource, anchorMs, names } = args;
  // wallets per tx (for counterparty)
  const walletsPerTx = new Map<string, Set<string>>();
  for (const r of rows) (walletsPerTx.get(r.tx) ?? walletsPerTx.set(r.tx, new Set()).get(r.tx)!).add(r.wallet);

  return rows.map((r, i) => {
    const wr = roles.get(r.tx)?.get(r.wallet);
    const set = walletsPerTx.get(r.tx)!;
    const others = [...set].filter((w) => w !== r.wallet);
    const usdc = new Decimal(r.size).times(r.price);
    return {
      n: i + 1,
      tx: r.tx,
      timestamp: new Date(r.tsMs).toISOString(),
      offsetS: Math.round((r.tsMs - anchorMs) / 1000),
      market: meta.slug,
      question: meta.question,
      outcome: r.outcome,
      tokenId: r.tokenId,
      wallet: r.wallet,
      walletName: names?.get(r.wallet),
      side: r.side,
      role: wr?.role ?? "unknown",
      roleSource,
      roleConf: wr?.roleConf ?? "none",
      size: new Decimal(r.size).toString(),
      price: new Decimal(r.price).toString(),
      usdc: usdc.toString(),
      feeUsd: wr?.feeUsd,
      counterparty: others.length === 1 ? others[0] : undefined,
    };
  });
}
