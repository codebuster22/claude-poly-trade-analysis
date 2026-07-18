// index.ts (roles) - dispatch role derivation to on-chain or heuristic
// Exports: deriveRoles
// Related: roles/onchain.ts, roles/heuristic.ts, types.ts
import type { FalconRow, TxRoleMap, RoleSource } from "../types.ts";
import { deriveRolesOnchain, makeViemReceiptGetter, type Receipt } from "./onchain.ts";
import { deriveRolesHeuristic } from "./heuristic.ts";

export async function deriveRoles(rows: FalconRow[], opts: { source: RoleSource; rpcUrl?: string; getReceipt?: (tx: string) => Promise<Receipt> }): Promise<TxRoleMap> {
  if (opts.source === "heuristic") return deriveRolesHeuristic(rows);
  const getReceipt = opts.getReceipt ?? (opts.rpcUrl ? makeViemReceiptGetter(opts.rpcUrl) : undefined);
  if (!getReceipt) throw new Error("on-chain role requires a reachable RPC. Set POLYGON_RPC_URL or pass rpcUrl, or use --fast for the heuristic.");
  return deriveRolesOnchain(rows.map((r) => r.tx), { getReceipt });
}
