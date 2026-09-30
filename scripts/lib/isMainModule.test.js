import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isMainModule } from './isMainModule.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ismain-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const fileA = path.join(tmp, 'a.mjs')
const fileB = path.join(tmp, 'b.mjs')
fs.writeFileSync(fileA, '')
fs.writeFileSync(fileB, '')

describe('isMainModule', () => {
    it('is true for the same file', () => {
        expect(isMainModule(pathToFileURL(fileA).href, fileA)).toBe(true)
    })
    it('is true for a relative argv1 that resolves to the same file', () => {
        expect(isMainModule(pathToFileURL(fileA).href, path.relative(process.cwd(), fileA))).toBe(true)
    })
    it('is false for another file', () => {
        expect(isMainModule(pathToFileURL(fileA).href, fileB)).toBe(false)
    })
    it('is false when argv1 is missing', () => {
        expect(isMainModule(pathToFileURL(fileA).href, undefined)).toBe(false)
        expect(isMainModule(pathToFileURL(fileA).href, '')).toBe(false)
    })
    it('is true through a symlink', () => {
        const link = path.join(tmp, 'link.mjs')
        fs.symlinkSync(fileA, link)
        expect(isMainModule(pathToFileURL(fileA).href, link)).toBe(true)
    })
    it('is true for a path with spaces and non-ASCII characters', () => {
        const dir = path.join(tmp, 'a b é')
        fs.mkdirSync(dir)
        const f = path.join(dir, 'x.mjs')
        fs.writeFileSync(f, '')
        expect(isMainModule(pathToFileURL(f).href, f)).toBe(true)
    })
    it('Windows shape (asserted by construction, not run on Windows)', () => {
        const url = 'file:///C:/a/b.mjs'
        // the bug: the old guard's left-hand side
        expect(new URL(url).pathname).toBe('/C:/a/b.mjs')
        expect(path.win32.resolve('C:\\a\\b.mjs')).not.toBe(new URL(url).pathname)
        // the fix: Node's own conversion gives the drive-letter path
        expect(fileURLToPath(url, { windows: true })).toBe(path.win32.resolve('C:\\a\\b.mjs'))
    })
})
