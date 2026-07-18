// cli.ts - thin CLI wrapper over analyzeTrades: JSON to stdout, CSV to --out
// Exports: (bin entrypoint)
// Related: args.ts, index.ts
import { writeFileSync } from "node:fs";
import { analyzeTrades, toCsv, toJson } from "./index.ts";
import { parseArgs } from "./args.ts";

async function main() {
  const { query, out } = parseArgs(process.argv.slice(2));
  const fills = await analyzeTrades(query);
  process.stdout.write(toJson(fills) + "\n");
  const path = out ?? `./trades-${String(query.market).slice(0, 10)}-${String(query.anchor).replace(/[^0-9a-zA-Z]/g, "")}.csv`;
  writeFileSync(path, toCsv(fills));
  process.stderr.write(`\n${fills.length} fills → ${path}\n`);
}
main().catch((e) => { process.stderr.write(`error: ${e.message}\n`); process.exit(1); });
