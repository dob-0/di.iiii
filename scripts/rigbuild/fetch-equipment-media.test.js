import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CACHE, insideRepo, judge, sha256, sniff } from './fetch-equipment-media.mjs'
import { isLocalApi } from '../../src/rigbuild/items/mediaRules.js'
import { fileURLToPath } from 'node:url'

// The fetch script is the only way a maker's file reaches the studio's install
// (RIG_BUILD.md §13.8). These hold its three promises: the bytes are what was recorded,
// they never land in the repository, and they never go to a hosted tier.
const PDF = Buffer.from('%PDF-1.4\n%fake but shaped like one\n')
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46])
const HTML = Buffer.from('<!doctype html><title>Not found</title>')

describe('fetch-equipment-media', () => {
    it('knows a file by its bytes, not by what the server says it is', () => {
        expect(sniff(PDF)).toBe('application/pdf')
        expect(sniff(JPG)).toBe('image/jpeg')
        expect(sniff(HTML)).toBe(null)
    })
    it('refuses an error page served in place of a manual', () => {
        expect(judge({ kind: 'manual', url: 'https://x/m.pdf' }, HTML, { record: true }).state).toBe('bad-type')
        expect(judge({ kind: 'photo', url: 'https://x/p.jpg' }, PDF, { record: true }).state).toBe('bad-type')
    })
    it('records a first fetch only when asked, and never overwrites a recorded sha256', () => {
        expect(judge({ kind: 'manual' }, PDF).state).toBe('mismatch')
        const first = judge({ kind: 'manual' }, PDF, { record: true, date: '2026-09-28' })
        expect(first.state).toBe('recorded')
        expect(first.record).toEqual({ sha256: sha256(PDF), bytes: PDF.length, mime: 'application/pdf', fetched: '2026-09-28' })
        expect(judge({ kind: 'manual', sha256: sha256(PDF) }, PDF).state).toBe('ok')
        const changed = judge({ kind: 'manual', sha256: sha256(PDF) }, Buffer.concat([PDF, Buffer.from('x')]), { record: true })
        expect(changed.state).toBe('mismatch')
        expect(changed.record).toBeUndefined()
    })
    it('keeps the bytes outside the repository', () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
        expect(insideRepo(path.join(root, 'public/rigbuild/media'), root)).toBe(true)
        expect(insideRepo(root, root)).toBe(true)
        expect(insideRepo(DEFAULT_CACHE, root)).toBe(false)
    })
    it('uploads only to a local install, never a hosted tier', () => {
        for (const ok of ['https://local.thedi.studio/serverXR', 'http://localhost:4395/serverXR', 'http://127.0.0.1:4000', 'http://dii.localhost:8088/serverXR']) expect(isLocalApi(ok), ok).toBe(true)
        for (const no of ['https://diiii.xyz/serverXR', 'https://dev.diiii.xyz/serverXR', 'https://di-studio.xyz', 'https://local.thedi.studio.evil.example', 'not a url']) expect(isLocalApi(no), no).toBe(false)
    })
})
