// heuristic.ts - Falcon-only maker/taker inference (no RPC, no fee); net-notional aggressor rule
// Exports: deriveRolesHeuristic
// Related: types.ts. Ported from prospects/lib/falcon.mjs deriveRoles.
import Decimal from "decimal.js";
import type { FalconRow, TxRoleMap, WalletRole, RoleConf } from "../types.ts";

export function deriveRolesHeuristic(rows: FalconRow[]): TxRoleMap {
  const byTx = new Map<string, FalconRow[]>();
  for (const r of rows) (byTx.get(r.tx) ?? byTx.set(r.tx, []).get(r.tx)!).push(r);
  const result: TxRoleMap = new Map();
  for (const [tx, group] of byTx) {
    const net = new Map<string, Decimal>();
    for (const f of group) {
      const n = new Decimal(f.size).times(f.price).times(f.side === "BUY" ? 1 : -1);
      net.set(f.wallet, (net.get(f.wallet) ?? new Decimal(0)).plus(n));
    }
    let taker: string | null = null, max = new Decimal(-1), second = new Decimal(-1);
    for (const [w, v] of net) {
      const a = v.abs();
      if (a.gt(max)) { second = max; max = a; taker = w; }
      else if (a.gt(second)) { second = a; }
    }
    const conf: RoleConf = net.size < 2 ? "low" : max.gt(second.times(2)) ? "high" : max.gt(second) ? "med" : "low";
    const byWallet = new Map<string, WalletRole>();
    for (const w of net.keys()) byWallet.set(w, { role: w === taker ? "taker" : "maker", roleConf: conf });
    result.set(tx, byWallet);
  }
  return result;
}
