import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { consoleInWords } from './deskState.js'

const ROOT = process.cwd().endsWith('/src') ? path.resolve(process.cwd(), '..') : process.cwd()

describe('console in, as the rig views say it', () => {
    it('reads the desk, never a fixed sentence', () => {
        expect(consoleInWords(null)).toBe('not on this build')
        expect(consoleInWords({ config: { enabled: false } })).toBe('off (Setup → Input)')
        expect(consoleInWords({ config: { enabled: true }, summary: { text: 'Following 127.0.0.1 on 1 of 1 universe' } }))
            .toBe('Following 127.0.0.1 on 1 of 1 universe')
        expect(consoleInWords(undefined)).toBe('…')
    })
})

describe('no view prints a fixed console-in sentence', () => {
    it('PlotSurface, PlotPrint and BuildSurface read it from the desk', () => {
        for (const f of ['PlotSurface.jsx', 'PlotPrint.jsx', 'BuildSurface.jsx']) {
            const src = fs.readFileSync(path.join(ROOT, 'src/rigbuild', f), 'utf8')
            expect(src, f).not.toMatch(/console in\s*[:·]\s*not on this build/)
        }
    })
})
