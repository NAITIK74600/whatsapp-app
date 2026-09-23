// Production entry point (plain JS, as required by managed Node hosts like Hostinger).
// Runs the same steps as the Docker CMD: sync DB schema -> bootstrap admin -> start the TS server via tsx.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = process.cwd();
require("@next/env").loadEnvConfig(root);

const run = (label, args) => {
  console.log(`[startup] ${label}...`);
  const res = spawnSync(process.execPath, args, { stdio: "inherit", cwd: root, env: process.env });
  if (res.status !== 0) console.error(`[startup] ${label} failed (exit ${res.status}). Continuing.`);
  return res.status === 0;
};

if (process.env.SKIP_DB_PUSH !== "true") {
  run("Syncing database schema (prisma db push)", [require.resolve("prisma/build/index.js"), "db", "push", "--skip-generate"]);
}

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  run("Ensuring SuperAdmin account", ["scripts/setup-admin.js", process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD]);
}

// Registers tsx's ESM + CJS TypeScript loaders for everything imported after this line.
await import("tsx");
await import("./src/server/index.ts");
