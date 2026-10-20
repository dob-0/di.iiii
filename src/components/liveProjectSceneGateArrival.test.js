// @vitest-environment node
//
// Source-level guard (same style as liveProjectSceneSeams.test.js): the walker is put at the
// entrance gate once per entry, not on every document edit. A show scene change rewrites the
// entities, which gave `gateEntity` a new identity and sent the walker back to the gate every
// few seconds -- the room page's "walk / fly is stuck" (2026-10-15).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(path.join(HERE, 'LiveProjectScene.jsx'), 'utf8')
const start = SOURCE.indexOf('const gateArrivalRef')
const block = SOURCE.slice(start, SOURCE.indexOf('Neither a gate nor an authored spawn', start))

describe('gate arrival happens once per entry', () => {
    it('is keyed on the gate id + position, not on the gateEntity object', () => {
        expect(start).toBeGreaterThan(0)
        expect(block).toContain('gateArrivalRef.current === gateKey')
        expect(block).not.toMatch(/\[gateEntity,/)
    })
    it('re-arms when walk mode is left, so a new entry still starts at the gate', () => {
        expect(block).toMatch(/if \(!interactive\) \{ gateArrivalRef\.current = null; return \}/)
    })
    it('still moves the pose in place (Walker closes over the object)', () => {
        expect(block).toContain('Object.assign(playerRef.current')
    })
})
