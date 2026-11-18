// @vitest-environment node

import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { createLedger, parseOpenLine, ageMinutes, clean } = require('./monitorLedger.js')
const { registerMonitorRoutes } = require('./routes/monitorRoutes.js')

let dir
let server
afterEach(() => new Promise((resolve) => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
  dir = null
  if (server) { server.closeAllConnections?.(); server.close(() => resolve()); server = null } else resolve()
}))

function fixture() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'))
  const argvFile = path.join(dir, 'argv.json')
  const add = path.join(dir, 'ledger-add')
  fs.writeFileSync(add, `#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)))\nconsole.log('ledger-add: wrote N7.2')\n`, { mode: 0o755 })
  const open = path.join(dir, 'ledger-open')
  fs.writeFileSync(open, '#!/bin/sh\necho "id touched who state the ask"\necho "N7       11-19 02:09 agent IN PROGRESS    verbatim: do the thing"\necho "N8       11-18 01:00 owner NEW            second ask"\necho "active 2 (shown 2)"\n', { mode: 0o755 })
  const ledgerFile = path.join(dir, 'ledger.md')
  fs.writeFileSync(ledgerFile, '| N7 | 11-19 02:09 | said | NEW | e | n |\n| N7.1 | 11-19 02:10 | did | IN PROGRESS | ev | nx |\n| N70 | 11-19 02:10 | other | NEW | x | y |\n')
  const auditFile = path.join(dir, 'audit.log')
  return { argvFile, cfg: { addPath: add, openPath: open, ledgerFile, auditFile }, auditFile }
}

describe('parsing', () => {
  it('reads a row and ignores the header and footer', () => {
    expect(parseOpenLine('N7       11-19 02:09 agent IN PROGRESS    verbatim: do the thing')).toMatchObject({ id: 'N7', who: 'agent', state: 'IN PROGRESS', text: 'verbatim: do the thing' })
    expect(parseOpenLine('id touched who state the ask')).toBeNull()
    expect(parseOpenLine('active 2 (shown 2)')).toBeNull()
  })
  it('measures age and strips control characters', () => {
    expect(ageMinutes('11-19', '02:00', new Date(new Date().getFullYear(), 10, 19, 3, 0).getTime())).toBe(60)
    expect(clean('a\u0000b\nc|d')).toBe('a b c d')
    expect(clean('--said')).toBe('said')
    expect(clean(' - -x -y')).toBe('x -y')
  })
})

describe('ledger', () => {
  it('lists, groups by the tool output and shows history of one family only', async () => {
    const f = fixture()
    const ledger = createLedger(f.cfg)
    const out = await ledger.list()
    expect(out.ok).toBe(true)
    expect(out.tasks.map((t) => t.id)).toEqual(['N7', 'N8'])
    const d = await ledger.detail('N7')
    expect(d.history.map((h) => h.id)).toEqual(['N7', 'N7.1'])
  })
  it('says there is no ledger instead of an empty list', async () => {
    const ledger = createLedger({ openPath: '/nonexistent/ledger-open', addPath: '/nonexistent/ledger-add' })
    expect(await ledger.list()).toMatchObject({ ok: false, reason: 'no-ledger' })
    expect(await ledger.change({ id: 'N7', action: 'note', text: 'x' })).toMatchObject({ error: 'no_ledger' })
  })
  it('passes a fixed argv: injection text stays inert, state is from the list, audit is written', async () => {
    const f = fixture()
    const ledger = createLedger(f.cfg)
    const evil = '$(touch /tmp/pwned-ledger); `id` ; rm -rf / "\u0000'
    const out = await ledger.change({ id: 'N7', action: 'done', text: evil, evidence: evil, next: '', by: 'owner-1' })
    expect(out.ok).toBe(true)
    const argv = JSON.parse(fs.readFileSync(f.argvFile, 'utf8'))
    expect(argv).toHaveLength(6)
    expect(argv.slice(0, 2)).toEqual(['--ref', 'N7'])
    expect(argv[3]).toBe('DONE')
    expect(argv[2]).toContain('$(touch /tmp/pwned-ledger)')
    expect(fs.existsSync('/tmp/pwned-ledger')).toBe(false)
    expect(argv.some((a) => a.includes(String.fromCharCode(0)))).toBe(false)
    expect(fs.readFileSync(f.auditFile, 'utf8')).toMatch(/by=owner-1 id=N7 state=DONE ok=true/)
    expect(out.row).toMatchObject({ id: 'N7.2', parent: 'N7', state: 'DONE' })
  })
  it('refuses a bad id, a bad action, a Done without evidence', async () => {
    const f = fixture()
    const ledger = createLedger(f.cfg)
    expect(await ledger.change({ id: 'N7; rm', action: 'note', text: 'x' })).toMatchObject({ error: 'bad_id' })
    expect(await ledger.change({ id: 'N7', action: 'nuke', text: 'x' })).toMatchObject({ error: 'bad_action' })
    expect(await ledger.change({ id: 'N7', action: 'done', text: 'x', evidence: '  ' })).toMatchObject({ error: 'evidence_required' })
    expect(fs.existsSync(f.argvFile)).toBe(false)
  })
})

describe('routes', () => {
  async function start(authState, deployEnv = 'staging') {
    const f = fixture()
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => { req.authState = authState; next() })
    const router = express.Router()
    registerMonitorRoutes(router, { hub: { reports: {}, asks: {}, getSnapshot: async () => ({}) }, requireAuth: () => true, deployEnv: () => deployEnv, ownerIds: () => ['owner-1'], ledger: createLedger(f.cfg) })
    app.use(router)
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    return { base: `http://127.0.0.1:${server.address().port}/api/monitor/tasks`, f }
  }
  const post = (base, body) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('the owner reads and changes; the new row comes back', async () => {
    const { base, f } = await start({ authenticated: true, role: 'admin', type: 'session', subject: 'owner-1' })
    expect((await (await fetch(base)).json()).tasks).toHaveLength(2)
    const res = await post(base, { id: 'N7', action: 'blocked', text: 'waits on a cable' })
    expect(res.status).toBe(200)
    expect((await res.json()).row.state).toBe('BLOCKED')
    expect(fs.readFileSync(f.auditFile, 'utf8')).toMatch(/by=owner-1/)
  })
  it('another admin, a token and a visitor are denied and nothing runs', async () => {
    for (const who of [
      { authenticated: true, role: 'admin', type: 'session', subject: 'other-admin' },
      { authenticated: true, role: 'admin', type: 'session', subject: 'owner-1', actor: 'di.bo' },
      { authenticated: false }
    ]) {
      const { base, f } = await start(who)
      expect((await post(base, { id: 'N7', action: 'note', text: 'x' })).status).toBe(404)
      expect((await fetch(base)).status).toBe(404)
      expect(fs.existsSync(f.argvFile)).toBe(false)
      await new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); server = null })
    }
  })
  it('prod answers 404 even for the owner', async () => {
    const { base } = await start({ authenticated: true, role: 'admin', type: 'session', subject: 'owner-1' }, 'production')
    expect((await post(base, { id: 'N7', action: 'note', text: 'x' })).status).toBe(404)
  })
})

describe('a leading dash never reaches ledger-add as an option', () => {
  it('a note like "--said" is sent without its dashes, as one value', async () => {
    const { argvFile, cfg } = fixture()
    const ledger = createLedger(cfg)
    const out = await ledger.change({ id: 'N7', action: 'note', text: '--said', by: 'owner' })
    expect(out.ok).toBe(true)
    const argv = JSON.parse(fs.readFileSync(argvFile, 'utf8'))
    expect(argv.slice(0, 2)).toEqual(['--ref', 'N7'])
    expect(argv[2]).toBe('said')
    expect(argv.slice(2).some((a) => a.startsWith('-'))).toBe(false)
  })
})
