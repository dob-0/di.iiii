#!/usr/bin/env node
// Read-only cross-environment inventory of spaces + projects.
// Local is read straight from the SQLite DB (truth); staging/prod via the live API.
// Usage: node scripts/data-inventory.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnv() {
  const env = {};
  const p = join(root, 'serverXR', '.env.local');
  if (!existsSync(p)) return env;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const env = loadEnv();

function localInventory() {
  const dbPath = join(root, 'serverXR', 'data', 'di.db');
  const db = new DatabaseSync(dbPath);
  const spaces = db.prepare('SELECT id, label, is_public, owner_user_id, kind, published_project_id FROM spaces ORDER BY id').all();
  const projects = db.prepare('SELECT id, space_id, title FROM projects ORDER BY space_id, id').all();
  // filesystem dirs (orphan detection)
  const fsDir = join(root, 'serverXR', 'data', 'spaces');
  const fsDirs = existsSync(fsDir) ? readdirSync(fsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : [];
  const bySpace = {};
  for (const s of spaces) bySpace[s.id] = { meta: s, projects: [] };
  for (const p of projects) (bySpace[p.space_id] ||= { meta: { id: p.space_id, label: '(no space row)' }, projects: [] }).projects.push(p);
  return { bySpace, fsDirs, spaceIds: spaces.map(s => s.id) };
}

async function api(base, token, path) {
  const res = await fetch(base.replace(/\/$/, '') + path, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json();
}

async function remoteInventory(base, token) {
  const { spaces = [] } = await api(base, token, '/api/spaces');
  const bySpace = {};
  for (const s of spaces) {
    let projects = [];
    try {
      const r = await api(base, token, `/api/spaces/${s.id}/projects`);
      projects = r.projects || [];
    } catch (e) { projects = [{ id: `(error: ${e.message})`, title: '' }]; }
    bySpace[s.id] = { meta: s, projects };
  }
  return { bySpace };
}

function printEnv(name, inv) {
  console.log(`\n${'='.repeat(60)}\n${name}\n${'='.repeat(60)}`);
  const ids = Object.keys(inv.bySpace).sort();
  for (const id of ids) {
    const { meta, projects } = inv.bySpace[id];
    const pub = meta.is_public ?? meta.isPublic;
    const owner = meta.owner_user_id ?? meta.ownerUserId;
    const flags = [pub ? 'public' : 'private', owner ? `owner:${String(owner).slice(0, 8)}` : 'owner:none', meta.kind && meta.kind !== 'normal' ? meta.kind : null].filter(Boolean).join(' ');
    console.log(`\n  [${id}] "${meta.label ?? ''}"  (${flags})  — ${projects.length} project(s)`);
    for (const p of projects) console.log(`      - ${p.id}  "${p.title ?? ''}"`);
  }
  if (inv.fsDirs) {
    const orphans = inv.fsDirs.filter(d => !inv.spaceIds.includes(d));
    if (orphans.length) console.log(`\n  ⚠ filesystem dirs with NO db row: ${orphans.join(', ')}`);
  }
}

const local = localInventory();
printEnv('LOCAL  (serverXR/data/di.db)', local);

for (const [name, urlKey, tokKey] of [
  ['STAGING (staging.di-studio.xyz)', 'LIVE_API_URL', 'LIVE_API_TOKEN'],
  ['PRODUCTION (di-studio.xyz)', 'PROD_API_URL', 'PROD_API_TOKEN']
]) {
  const base = env[urlKey], token = env[tokKey];
  if (!base || !token) { console.log(`\n(skipping ${name}: missing ${urlKey}/${tokKey})`); continue; }
  try {
    printEnv(name, await remoteInventory(base, token));
  } catch (e) {
    console.log(`\n${name}: FAILED — ${e.message}`);
  }
}
