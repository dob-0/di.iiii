/**
 * credentials.json holds live bearer secrets (editor role, one space each).
 * The properties worth pinning: the file is 0600 — and STAYS 0600 on rewrite,
 * because writeFileSync's mode option only applies on create, a trap that
 * silently leaves a pre-existing file world-readable — and corruption
 * degrades to "nothing linked", never a crash.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCredentials, readLink, writeLink } from './credentialsStore.mjs'
import { paths } from './paths.mjs'

let home
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-home-')) })
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }) })

const mode = (file) => fs.statSync(file).mode & 0o777

describe('credentialsStore', () => {
    it('round-trips a link and preserves other links on rewrite', () => {
        writeLink(home, 'open', { remote: 'https://staging.di-studio.xyz/serverXR', key: 'dii_sync_a.s1' })
        writeLink(home, 'wcc', { remote: 'https://di-studio.xyz/serverXR', key: 'dii_sync_b.s2' })
        expect(readLink(home, 'open').key).toBe('dii_sync_a.s1')
        expect(readLink(home, 'wcc').remote).toBe('https://di-studio.xyz/serverXR')
        expect(readLink(home, 'open').linkedAt).toMatch(/^\d{4}-/)
    })

    it.skipIf(process.platform === 'win32')('is 0600 on create and forced back to 0600 on every rewrite', () => {
        writeLink(home, 'open', { remote: 'https://x.example', key: 'k' })
        const file = paths(home).credentials
        expect(mode(file)).toBe(0o600)
        fs.chmodSync(file, 0o644)
        writeLink(home, 'open', { remote: 'https://x.example', key: 'k2' })
        expect(mode(file)).toBe(0o600)
    })

    it('absent or corrupt file reads as nothing linked, never a crash', () => {
        expect(readCredentials(home)).toEqual({})
        expect(readLink(home, 'open')).toBe(null)
        const file = paths(home).credentials
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, '{broken')
        expect(readLink(home, 'open')).toBe(null)
    })
})
