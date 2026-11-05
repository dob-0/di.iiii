#!/usr/bin/env node
/**
 * space-invite.mjs — mint one invite link for a space (owner or admin), with the stored login.
 *
 *   node scripts/production/space-invite.mjs --space cinema-house --label "ReA team" [--path /cinema-house/p/cinema-house-team] [--tier dev] [--out FILE] [--dry-run]
 *
 * - The server (POST /api/spaces/<space>/invites) gives a link that works for 7 days, for any number of people;
 *   whoever opens it becomes an EDITOR of that one space (serverXR/src/inviteStore.js, AuthGate ?invite=).
 * - The link is shown once by the server, so it is written to --out (mode 600) and printed.
 * - Undo: revoke it in the space's settings (Space hub → invites), or DELETE /api/spaces/<space>/invites/<id>.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const a = { tier: 'dev' }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) { const k = argv[i]; if (k === '--dry-run') a.dryRun = true; else if (k.startsWith('--')) a[k.slice(2)] = argv[++i] }
if (!a.space) { console.error('usage: space-invite.mjs --space S [--label L] [--path /S/p/x] [--tier dev] [--out FILE] [--dry-run]'); process.exit(2) }
const cred = JSON.parse(readFileSync(join(homedir(), '.config/di/credentials.json'), 'utf8'))[a.tier]
if (!cred?.token) { console.error(`space-invite: no stored login for ${a.tier} (run: di whoami)`); process.exit(1) }
const base = cred.base.replace(/\/$/, ''); const origin = new URL(base).origin
const path = a.path || `/${a.space}`
if (a.dryRun) { console.log(`space-invite: dry run — would mint an editor invite for space ${a.space} on ${a.tier}, link ${origin}${path}?invite=…`); process.exit(0) }
const r = await fetch(`${base}/api/spaces/${encodeURIComponent(a.space)}/invites`, {
    method: 'POST', headers: { Authorization: `Bearer ${cred.token}`, 'Content-Type': 'application/json', 'User-Agent': 'di-space-invite' },
    body: JSON.stringify({ label: a.label || 'invite' })
})
const j = await r.json().catch(() => ({}))
if (!r.ok || !j.token) { console.error(`space-invite: ${r.status} ${JSON.stringify(j).slice(0, 200)}`); process.exit(1) }
const link = `${origin}${path}?invite=${encodeURIComponent(j.token)}`
const expires = j.invite?.expiresAt ? new Date(j.invite.expiresAt).toISOString() : 'unknown'
if (a.out) writeFileSync(a.out, `${link}\nspace ${a.space} · id ${j.invite?.id} · expires ${expires}\n`, { mode: 0o600 })
console.log(`\n  The team link (works 7 days, opens as editor of ${a.space}):\n\n  ${link}\n\n  expires ${expires} · id ${j.invite?.id}${a.out ? ` · saved in ${a.out}` : ''}\n`)
