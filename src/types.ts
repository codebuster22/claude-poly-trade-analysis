// types.ts - shared type contracts for the trade-analysis pipeline
// Exports: Side, Role, RoleSource, RoleConf, SizeUnit, TradeQuery, FalconRow, MarketToken, MarketMeta, WalletRole, TxRoleMap, AnnotatedFill
export type Side = "BUY" | "SELL";
export type Role = "maker" | "taker" | "unknown";
export type RoleSource = "onchain" | "heuristic";
export type RoleConf = "exact" | "high" | "med" | "low" | "ambiguous" | "none";
export type SizeUnit = "usdc" | "shares";

export interface TradeQuery {
  market: string;              // conditionId (0x..66) or tokenId (long decimal)
  anchor: string | number;     // unix sec | ms | ISO-UTC
  before?: string | number;    // duration "10s"/"10m"/"2h" or seconds; symmetric if only one given
  after?: string | number;
  minSize?: number;
  sizeUnit?: SizeUnit;         // default "usdc"
  side?: Side;                 // filter
  role?: Exclude<Role, "unknown">; // filter: maker|taker
  roleSource?: RoleSource;     // default "onchain"
  identity?: boolean;          // default false
  rpcUrl?: string;             // default process.env.POLYGON_RPC_URL
}

export interface FalconRow {
  id: string;
  conditionId: string;
  tokenId: string;
  outcome: string;
  side: Side;
  size: number;                // raw float from Falcon; wrapped in Decimal downstream
  price: number;
  tsMs: number;
  tx: string;                  // lowercased
  wallet: string;              // lowercased
}

export interface MarketToken { tokenId: string; outcome: string; }
export interface MarketMeta {
  conditionId: string;
  question: string;
  slug: string;
  negRisk: boolean;
  tokens: MarketToken[];
  filterTokenId?: string;      // set only when the input was a tokenId
}

export interface WalletRole {
  role: Role;
  roleConf: RoleConf;
  feeUsd?: string;             // Decimal string; = OrderFilled.fee/1e6 (USDC, both sides); taker only
}
// tx (lowercased) -> wallet (lowercased) -> role
export type TxRoleMap = Map<string, Map<string, WalletRole>>;

export interface AnnotatedFill {
  n: number;
  tx: string;
  timestamp: string;           // ISO-UTC
  offsetS: number;             // signed whole seconds from anchor
  market: string;              // slug
  question: string;
  outcome: string;
  tokenId: string;
  wallet: string;
  walletName?: string;
  side: Side;
  role: Role;
  roleSource: RoleSource;
  roleConf: RoleConf;
  size: string;                // Decimal string
  price: string;
  usdc: string;
  feeUsd?: string;             // = OrderFilled.fee/1e6 (USDC); taker rows, on-chain only
  counterparty?: string;
}
