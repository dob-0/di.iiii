// @vitest-environment node
//
// Source-level invariant guard for a bug class this repo has now shipped
// twice: Walker wires its mouse/touch-look listeners once on mount and closes
// over the exact `playerRef.current` object. Any effect that *replaces* that
// object instead of mutating it orphans the closure — look silently dies
// (yaw/pitch change but the view never rotates) while WASD keeps working,
// because its useFrame re-reads playerRef.current every frame.
//
// The spawn effect was fixed for this once; the gate-entity effect right below
// it kept the same reassignment and was reachable just by naming an entity
// "Entrance". Source parsing rather than rendering: the component is a full
// R3F tree, and the invariant is textual anyway.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(path.join(HERE, 'LiveProjectScene.jsx'), 'utf8')

describe('LiveProjectScene playerRef identity', () => {
    it('never reassigns playerRef.current — mutate in place with Object.assign', () => {
        const reassignments = SOURCE
            .split('\n')
            .map((line, index) => ({ line: line.trim(), number: index + 1 }))
            // `playerRef.current = ...`, but not `playerRef.current.x = ...`
            // and not an `===`/`==`/`!=` comparison.
            .filter(({ line }) => /(^|[^.\w])playerRef\.current\s*=(?!=)/.test(line))

        expect(reassignments.map((r) => `${r.number}: ${r.line}`)).toEqual([])
    })

    it('still has the effects that position the player, so the guard above is not vacuous', () => {
        expect(SOURCE).toMatch(/Object\.assign\(playerRef\.current/)
        expect(SOURCE.match(/Object\.assign\(playerRef\.current/g).length).toBeGreaterThanOrEqual(2)
    })
})
