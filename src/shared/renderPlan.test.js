import { describe, expect, it } from 'vitest'
import {
    RENDER_MODES, SCHEMATIC_LOOK, TECH_AMBIENT, TECH_LAYERS,
    isShowThing, normalizeRender, outputDocument, renderPlan, roomRenderWanted, techEntities
} from './renderPlan.js'

// The table of docs/ai/decisions/2026-10-15-studio-tech-show-render.md, one row per field.

const ENTITIES = [
    { id: 'place-hall', type: 'model', name: 'MOXIR hall' },
    { id: 'truss-g', type: 'group', name: 'truss group' },
    { id: 'lamp-1', type: 'spotLight', name: 'PAR 1', parentId: 'truss-g', components: { fixture: { type: 'par' }, light: {}, beam: {} } },
    { id: 'cube-1', type: 'spotLight', name: 'Cube 1', components: { beam: { laser: {} } } },
    { id: 'truss-1', type: 'model', name: 'Truss', components: { piece: { kind: 'truss' } } },
    { id: 'stage', type: 'box', name: 'Stage deck' },
    { id: 'cam-floor', type: 'camera', name: 'floor' },
    { id: 'screen', type: 'video', name: 'LED wall content' },
    { id: 'press', type: 'model', name: 'Press 1890' },
    { id: 'txt', type: 'text', name: 'Welcome' },
    { id: 'deco-g', type: 'group', name: 'decor' },
    { id: 'plant', type: 'model', name: 'Plant', parentId: 'deco-g' }
]

const DOC = Object.freeze({
    entities: ENTITIES,
    renderSettings: {
        atmosphere: { scattering: 0.02, anisotropy: 0.7, haze: { model: 'nf-ff' } },
        bloom: { enabled: true, strength: 0.03 },
        surfaces: { floor: { roughness: 0.4 } },
        shadows: true,
        shadowCasting: { enabled: true, max: 12 },
        toneMapping: 'aces',
        toneMappingExposure: 3.5
    },
    worldState: { ambientLight: { color: '#a39c92', intensity: 0.6 }, fog: { enabled: true, near: 8, far: 50, color: '#111' }, backgroundColor: '#000' },
    mappingState: {}
})

const ids = (list) => list.map((e) => e.id)

describe('render words', () => {
    it('reads studio / tech / show and nothing else', () => {
        expect(RENDER_MODES).toEqual(['studio', 'tech', 'show'])
        expect(normalizeRender('TECH')).toBe('tech')
        expect(normalizeRender('lite')).toBe(null)
        expect(normalizeRender(undefined)).toBe(null)
    })
    it('a room page draws Show unless the address or the tab says Tech; studio there draws Show', () => {
        expect(roomRenderWanted({})).toBe('show')
        expect(roomRenderWanted({ search: '?render=tech' })).toBe('tech')
        expect(roomRenderWanted({ search: '?quality=low&render=tech' })).toBe('tech')
        expect(roomRenderWanted({ stored: 'tech' })).toBe('tech')
        expect(roomRenderWanted({ search: '?render=show', stored: 'tech' })).toBe('show') // the address wins
        expect(roomRenderWanted({ search: '?render=studio' })).toBe('show')
        expect(roomRenderWanted({ search: '?rendered=tech' })).toBe('show')
    })
})

describe('Tech keeps only the show\'s things', () => {
    it('keeps the rig, the building, the floor/stage, cameras and the parent of a kept lamp; drops the rest', () => {
        expect(ids(techEntities(ENTITIES))).toEqual(['place-hall', 'truss-g', 'lamp-1', 'cube-1', 'truss-1', 'stage', 'cam-floor'])
    })
    it('keeps a show thing on its own merit and nothing else (parity with smartViewGeometry: src/project/viewport/renderPlanParity.test.js)', () => {
        expect(isShowThing(ENTITIES.find((e) => e.id === 'press'))).toBe(false)
        expect(isShowThing(ENTITIES.find((e) => e.id === 'cube-1'))).toBe(true)
    })
    it('survives a parent loop and a missing parent', () => {
        const loop = [{ id: 'a', parentId: 'b', type: 'spotLight' }, { id: 'b', parentId: 'a', type: 'group' }, { id: 'c', parentId: 'gone', type: 'spotLight' }]
        expect(ids(techEntities(loop))).toEqual(['a', 'b', 'c'])
        expect(techEntities(null)).toEqual([])
    })
})

describe('renderPlan — the decision table', () => {
    const tech = renderPlan(DOC, { mode: 'tech', quality: 'high' })
    const show = renderPlan(DOC, { mode: 'show', quality: 'high' })
    const studio = renderPlan(DOC, { mode: 'studio', quality: 'high' })

    it('Studio and Show High draw the document as authored (the same object, nothing copied)', () => {
        expect(show.document).toBe(DOC)
        expect(studio.document).toBe(DOC)
        expect(show.layers).toBe(null)
        expect(studio.editing).toBe(true)
        expect(show.editing).toBe(false)
        expect(show.schematic).toBe(false)
    })
    it('Tech: no air, no bloom, no floor reflection, no shadows, the schematic look', () => {
        const rs = tech.document.renderSettings
        expect(rs.atmosphere).toBeUndefined()
        expect(rs.bloom).toBeUndefined()
        expect(rs.surfaces).toBeUndefined()
        expect(rs.shadows).toBe(false)
        expect(rs.shadowCasting).toEqual({ enabled: false, max: 12 })
        expect(rs.look).toBe(SCHEMATIC_LOOK)
        expect(tech.schematic).toBe(true)
        expect(tech.editing).toBe(false)
    })
    it('Tech keeps the exposure (the one light-environment group it reads)', () => {
        expect(tech.document.renderSettings.toneMapping).toBe('aces')
        expect(tech.document.renderSettings.toneMappingExposure).toBe(3.5)
    })
    it('Tech: fog off, the hall lit white, machines and outside off', () => {
        expect(tech.document.worldState.fog).toEqual({ enabled: false, near: 8, far: 50, color: '#111' })
        expect(tech.document.worldState.ambientLight).toEqual(TECH_AMBIENT)
        expect(tech.document.worldState.backgroundColor).toBe('#000')
        expect(tech.layers).toEqual(TECH_LAYERS)
        expect(ids(tech.document.entities)).not.toContain('screen')
    })
    it('never writes the document', () => {
        const before = JSON.stringify(DOC)
        for (const mode of RENDER_MODES) for (const quality of ['low', 'high']) renderPlan(DOC, { mode, quality })
        expect(JSON.stringify(DOC)).toBe(before)
    })
    it('Low is the output on top of whatever the render left (render first, then quality)', () => {
        expect(renderPlan(DOC, { mode: 'show', quality: 'low' }).document).toEqual(outputDocument(DOC))
        const techLow = renderPlan(DOC, { mode: 'tech', quality: 'low' })
        expect(techLow.document).toEqual(outputDocument(tech.document))
        expect(techLow.document.renderSettings.look).toBe(SCHEMATIC_LOOK)
        expect(techLow.document.renderSettings.dprMax).toBe(1)
        expect(techLow.document.renderSettings.atmosphere).toBeUndefined()
    })
    it('an unknown mode draws Show; no document plans nothing', () => {
        expect(renderPlan(DOC, { mode: 'cinema' }).mode).toBe('show')
        expect(renderPlan(null, { mode: 'tech' }).document).toBe(null)
    })
})
