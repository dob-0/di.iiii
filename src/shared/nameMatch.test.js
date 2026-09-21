import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { pickByLabel, pickByName } from './nameMatch.js'

// ONE RULE, TWO COPIES, ONE CONTRACT.
//
// Naming a live input is the thing a show rig does instead of pointing at one,
// and until 2026-09-20 the rule for resolving that name existed three times:
// `matchStreamDevice` (the wall), `inputOnMachine` (the desk's warning) and
// `matchSourceName` (serverXR's NDI® lane), each with a comment asking the next
// person to keep them the same. The client's two are now one function; the
// server's is the CJS twin, because serverXR is CommonJS and Vite's dev server
// hands a local .cjs to the browser untransformed (checked — `module.exports`
// throws there, even though `vite build` bundles it fine).
//
// So the drift guard is this file: both copies, the same table, asserted
// equal. If someone edits one body, this goes red.
const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const mirror = require(path.join(ROOT, 'shared/nameMatch.cjs'))
// And the CLI's copy — `di stage run` matches a screen by the same rule, and
// scripts/di cannot reach either of the other two from an installed layout
// (see the note at the top of scripts/di/nameMatch.mjs).
const cli = await import(path.join(ROOT, 'scripts/di/nameMatch.mjs'))

const SOURCES = [
    { name: 'AYLMO (td_out_windows)', address: '10.10.10.2:5961' },
    { name: 'WIN (OBS)', address: '10.10.10.3:5961' },
    { name: 'td', address: '10.10.10.4:5961' }
]

describe('choosing the one they meant', () => {
    it('prefers an exact case-insensitive name over any partial one', () => {
        // "td" is contained in "AYLMO (td_out_windows)" too. Without
        // exact-first the wall would show whichever the finder happened to
        // list first, and that changes between nights.
        expect(pickByName(SOURCES, 'td').address).toBe('10.10.10.4:5961')
        expect(pickByName(SOURCES, 'TD').address).toBe('10.10.10.4:5961')
        expect(pickByName(SOURCES, '  td  ').address).toBe('10.10.10.4:5961')
    })

    it('then falls back to "contains", so a fragment is enough', () => {
        expect(pickByName(SOURCES, 'td_out').name).toBe('AYLMO (td_out_windows)')
        expect(pickByName(SOURCES, 'obs').name).toBe('WIN (OBS)')
        expect(pickByName(SOURCES, 'aylmo').name).toBe('AYLMO (td_out_windows)')
    })

    it('returns null rather than guessing', () => {
        expect(pickByName(SOURCES, 'resolume')).toBeNull()
        expect(pickByName(SOURCES, '')).toBeNull()
        expect(pickByName(SOURCES, '   ')).toBeNull()
        expect(pickByName([], 'td')).toBeNull()
        expect(pickByName(undefined, 'td')).toBeNull()
    })

    it('can never invent an address: only the named field is read', () => {
        // The one thing this must not do is let a client's "10.10.10.9:5961"
        // become a connection — the NDI lane's whole security boundary.
        expect(pickByName(SOURCES, '10.10.10.9:5961')).toBeNull()
        // Even an address that IS in the list selects nothing.
        expect(pickByName(SOURCES, '10.10.10.2:5961')).toBeNull()
    })

    it('reads a browser device by its label', () => {
        const devices = [
            { label: 'Integrated Camera (13d3:56b2)', deviceId: 'b' },
            { label: 'OBS Virtual Camera', deviceId: 'c' }
        ]
        expect(pickByLabel(devices, 'obs').deviceId).toBe('c')
        // Before permission every label is '', so nothing can match yet.
        expect(pickByLabel([{ label: '', deviceId: 'x' }], 'obs')).toBeNull()
    })
})

describe('the ESM copy and the CJS mirror agree', () => {
    const NAMES = [
        'td', 'TD', '  td  ', 'td_out', 'obs', 'OBS', 'aylmo', 'AYLMO (td_out_windows)',
        'resolume', '', '   ', '10.10.10.2:5961', ')', '(td'
    ]
    const LISTS = [SOURCES, [], [{ name: '' }], [{ name: 'td' }, { name: 'td' }], undefined]

    it('picks the same entry for every name, over every list', () => {
        for (const list of LISTS) {
            for (const name of NAMES) {
                expect(
                    pickByName(list, name),
                    `pickByName(${JSON.stringify(list)}, ${JSON.stringify(name)})`
                ).toEqual(mirror.pickByName(list, name))
                expect(cli.pickByName(list, name), `cli pickByName(${JSON.stringify(list)}, ${JSON.stringify(name)})`).toEqual(pickByName(list, name))
            }
        }
    })

    it('reads a custom field the same way', () => {
        const rows = [{ label: 'WIN (OBS)' }, { label: 'td' }]
        for (const name of NAMES) {
            expect(pickByLabel(rows, name)).toEqual(mirror.pickByLabel(rows, name))
            expect(cli.pickByLabel(rows, name)).toEqual(pickByLabel(rows, name))
            expect(pickByName(rows, name, (row) => row?.label)).toEqual(mirror.pickByName(rows, name, (row) => row && row.label))
        }
    })

    it('is the rule serverXR actually uses, not a parallel one', () => {
        // matchSourceName is what /ndi/in.mjpg resolves a client's string with.
        const { matchSourceName } = require(path.join(ROOT, 'serverXR/src/ndi/names.js'))
        for (const name of NAMES) {
            expect(matchSourceName(SOURCES, name)).toEqual(pickByName(SOURCES, name))
        }
    })
})
