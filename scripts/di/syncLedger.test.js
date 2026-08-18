/**
 * The ledger is the origin field the ops do not have — lose it and every
 * future audit downgrades to "unknown — refuse". These tests pin the three
 * properties that protect it: it lives under data/ (what `di backup` carries
 * and `di update` may not touch), one file per (remote, space) so staging and
 * prod cursors can never share state, and installId is minted exactly once.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    createLedger, ensureInstallId, ledgerPath, readLedger, remoteSlug, writeLedger
} from './ledger.mjs'
import { readState } from './state.mjs'

let home
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-home-')) })
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }) })

describe('ensureInstallId', () => {
    it('mints once into state.json and returns the same id forever after', async () => {
        const first = await ensureInstallId(home)
        expect(first).toMatch(/^[0-9a-f-]{36}$/)
        expect(await ensureInstallId(home)).toBe(first)
        expect(readState(home).installId).toBe(first)
    })
})

describe('ledger files', () => {
    it('lives under data/sync/<remote>/<space>.json — the backup-carried, update-proof directory', () => {
        const file = ledgerPath(home, 'https://staging.di-studio.xyz/serverXR', 'open')
        expect(file).toBe(path.join(home, 'data', 'sync', 'staging.di-studio.xyz_serverxr', 'open.json'))
    })

    it('two remotes for the same space never share a file', () => {
        const a = ledgerPath(home, 'https://staging.di-studio.xyz/serverXR', 'open')
        const b = ledgerPath(home, 'https://di-studio.xyz/serverXR', 'open')
        expect(a).not.toBe(b)
    })

    it('round-trips, and a fresh ledger has null cursors so an audit answers unknown', () => {
        const remote = 'https://staging.di-studio.xyz/serverXR'
        const ledger = createLedger({ installId: 'i-1', remote, spaceId: 'open' })
        expect(ledger.cursors).toBe(null)
        writeLedger(home, remote, 'open', ledger)
        const back = readLedger(home, remote, 'open')
        expect(back.installId).toBe('i-1')
        expect(back.cursors).toBe(null)
        expect(back.assetIdRemap).toEqual({})
    })

    it('absent, corrupt, or foreign json reads as null — never a crash, never a fake ledger', () => {
        const remote = 'https://x.example'
        expect(readLedger(home, remote, 'open')).toBe(null)
        const file = ledgerPath(home, remote, 'open')
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, 'not json')
        expect(readLedger(home, remote, 'open')).toBe(null)
        fs.writeFileSync(file, JSON.stringify({ some: 'other file' }))
        expect(readLedger(home, remote, 'open')).toBe(null)
    })
})

describe('remoteSlug', () => {
    it('is filesystem-safe and scheme-blind', () => {
        expect(remoteSlug('https://di-studio.xyz/serverXR')).toBe('di-studio.xyz_serverxr')
        expect(remoteSlug('http://localhost:4000/serverXR')).toBe('localhost_4000_serverxr')
        expect(remoteSlug('')).toBe('remote')
    })
})
