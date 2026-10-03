import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Runs inside Vercel, using its production environment; never reads a local .env as production.
if (process.env.VERCEL_ENV !== "production") process.exit(0);
if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "[SENSITIVE]") {
  throw new Error("Production DATABASE_URL is unavailable.");
}
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("prisma/package.json")), "build", "index.js");
function run(command) {
  const result = spawnSync(process.execPath, [cli, "migrate", command, "--config", "prisma7.config.ts"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[redacted database URL]"));
  if (result.error) throw result.error;
  return { status: result.status, output };
}
const before = run("status");
// A pending additive migration yields exit 1. Failed/divergent/unreachable histories must stop.
if (before.status !== 0 && !(before.status === 1 && /have not yet been applied/.test(before.output)
  && !/failed migration|diverge|Error:/i.test(before.output))) process.exit(before.status || 1);
const deployed = run("deploy");
if (deployed.status !== 0) process.exit(deployed.status || 1);
const after = run("status");
process.exit(after.status ?? 1);
