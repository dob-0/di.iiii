import { Document } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { stripPlanningMarks } from './hall-show.mjs'

// The show copy of a hall carries no planning tape (hall-show.mjs; the blue dance-floor
// outline glowed on /moxir's black floor through the whole underground set, 2026-09-28).
describe('hall-show: the planning marks come out, nothing else', () => {
    it('removes every hall-zone-* node and keeps the hall', () => {
        const doc = new Document()
        const scene = doc.createScene()
        for (const name of ['hall-concrete', 'hall-zone-dance', 'hall-frame', 'hall-zone-stage']) {
            scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name)))
        }
        expect(stripPlanningMarks(doc).sort()).toEqual(['hall-zone-dance', 'hall-zone-stage'])
        expect(doc.getRoot().listNodes().map((n) => n.getName()).sort()).toEqual(['hall-concrete', 'hall-frame'])
    })
})
