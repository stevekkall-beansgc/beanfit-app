#!/usr/bin/env node
// Sync catalog from the beanfit CLI into the app's D1 database.
// Usage:
//   BEANFIT_SRC=~/Desktop/beanfit/src node scripts/sync_catalog.js [--remote]
import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const src = process.env.BEANFIT_SRC;
if (!src) {
  console.error("Set BEANFIT_SRC=/path/to/beanfit/src");
  process.exit(1);
}
const remote = process.argv.includes("--remote");

let doc;
try {
  const out = execSync(`python3 -m beanfit --export-catalog`, {
    env: { ...process.env, PYTHONPATH: src },
    encoding: "utf8",
  });
  doc = JSON.parse(out);
} catch (err) {
  console.error("Failed to export catalog from beanfit CLI:", err.message);
  process.exit(1);
}

const esc = s => String(s ?? "").replace(/'/g, "''");
const rows = doc.models.map(m => {
  const mlx = doc.mlx_repos[m.runtime_tag] ?? null;
  return `INSERT INTO catalog_models (ollama_tag, name, params_b, mem_q4, mem_q8, kv32k, qual_coding, qual_reasoning, qual_chat, mlx_repo)
VALUES ('${esc(m.runtime_tag)}', '${esc(m.name)}', ${m.params_b}, ${m.mem_q4}, ${m.mem_q8}, ${m.kv32k}, ${m.qual_coding}, ${m.qual_reasoning}, ${m.qual_chat}, ${mlx ? `'${esc(mlx)}'` : "NULL"})
ON CONFLICT(ollama_tag) DO UPDATE SET name=excluded.name, params_b=excluded.params_b,
  mem_q4=excluded.mem_q4, mem_q8=excluded.mem_q8, kv32k=excluded.kv32k,
  qual_coding=excluded.qual_coding, qual_reasoning=excluded.qual_reasoning,
  qual_chat=excluded.qual_chat, mlx_repo=excluded.mlx_repo;`;
});

const sqlFile = join(mkdtempSync(join(tmpdir(), "bfcat-")), "catalog.sql");
writeFileSync(sqlFile, rows.join("\n\n"));
console.log(`Exported beanfit ${doc.version}: ${doc.models.length} models -> ${sqlFile}`);

execSync(
  `npx wrangler d1 execute beanfit-app ${remote ? "--remote" : "--local"} --file "${sqlFile}"`,
  { stdio: "inherit" },
);
