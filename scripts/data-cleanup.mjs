#!/usr/bin/env node
// Plan-driven cleanup of spaces/projects across environments. DRY-RUN by default.
// Usage:
//   node scripts/data-cleanup.mjs <plan.json>            # dry run (prints, does nothing)
//   node scripts/data-cleanup.mjs <plan.json> --apply    # actually delete
//
// Plan shape:
// { "env": "local|staging|prod",
//   "deleteSpaces": ["id", ...],
//   "deleteProjects": [{ "space": "id", "id": "projId" }, ...],
//   "pruneOrphanDirs": ["dirname", ...]   // local filesystem dirs with no DB row (local only)
// }
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apply = process.argv.includes('--apply');
const planPath = process.argv[2];
if (!planPath) { console.error('Usage: data-cleanup.mjs <plan.json> [--apply]'); process.exit(1); }
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

function loadEnv() {
  const env = {};
  const p = join(root, 'serverXR', '.env.local');
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const env = loadEnv();
const TARGETS = {
  local: { base: 'http://localhost:4000/serverXR', token: env.API_TOKEN },
  staging: { base: env.LIVE_API_URL, token: env.LIVE_API_TOKEN },
  prod: { base: env.PROD_API_URL, token: env.PROD_API_TOKEN }
};
const tgt = TARGETS[plan.env];
if (!tgt || !tgt.base || !tgt.token) { console.error(`Bad/unknown env "${plan.env}" or missing token.`); process.exit(1); }

const mode = apply ? 'APPLY' : 'DRY-RUN';
console.log(`\n[${mode}] env=${plan.env} base=${tgt.base}\n`);

async function del(path) {
  if (!apply) { console.log(`  would DELETE ${path}`); return { ok: true }; }
  const res = await fetch(tgt.base.replace(/\/$/, '') + path, {
    method: 'DELETE',
    headers: { Accept: 'application/json', Authorization: `Bearer ${tgt.token}` }
  });
  const body = await res.text();
  console.log(`  DELETE ${path} -> ${res.status}${res.ok ? '' : ' ' + body.slice(0, 200)}`);
  return { ok: res.ok };
}

let failures = 0;
// Projects first (so a space we keep loses junk projects; spaces we delete go whole anyway)
for (const p of plan.deleteProjects || []) {
  const r = await del(`/api/projects/${p.id}`);
  if (!r.ok) failures++;
}
for (const id of plan.deleteSpaces || []) {
  const r = await del(`/api/spaces/${id}`);
  if (!r.ok) failures++;
}
// Orphan filesystem dirs (local only) — no DB row, API can't touch them
if ((plan.pruneOrphanDirs || []).length) {
  if (plan.env !== 'local') { console.log('  (pruneOrphanDirs ignored: only valid for local)'); }
  else for (const d of plan.pruneOrphanDirs) {
    const full = join(root, 'serverXR', 'data', 'spaces', d);
    if (!existsSync(full)) { console.log(`  skip dir (absent): ${d}`); continue; }
    if (!apply) { console.log(`  would rm -rf serverXR/data/spaces/${d}`); continue; }
    rmSync(full, { recursive: true, force: true });
    console.log(`  rm -rf serverXR/data/spaces/${d}`);
  }
}

console.log(`\n[${mode}] done. failures=${failures}`);
process.exit(failures ? 1 : 0);
