import { describe, expect, it } from 'vitest'
import { doorsForListRow, projectDoors } from './doors.js'
import { openLayersFromCounts } from './layers.js'
import { surfaceDestinations } from '../components/SurfaceBar.jsx'
import { buildPerformPath } from '../perform/performRouting.js'

const keys = (doors) => doors.map(d => d.key)
const at = (open) => ({ space: true, things: true, connections: false, wall: false, lamps: false, handover: false, ...open })
const tool = (key, args = {}) => surfaceDestinations({ space: 'lab', project: 'p1', ...args }).find(d => d.key === key)

describe('projectDoors', () => {
    it('gives no door without a space or without a project', () => {
        expect(projectDoors()).toEqual([])
        expect(projectDoors({ project: 'p1' })).toEqual([])
        expect(projectDoors({ space: 'lab' })).toEqual([])
    })

    it('gives no door to a page that is read: it has no desk', () => {
        expect(projectDoors({ space: 'lab', project: 'p1', mode: 'code' })).toEqual([])
    })

    it('a scene with unknown layers has exactly Perform, Studio and Nodes, in that order', () => {
        const doors = projectDoors({ space: 'lab', project: 'p1', mode: 'scene' })
        expect(keys(doors)).toEqual(['perform', 'studio', 'raw'])
        expect(doors.map(d => d.label)).toEqual(['Perform', 'Studio', 'Nodes'])
    })

    it('opens Perform without naming a layout', () => {
        const [perform] = projectDoors({ space: 'lab', project: 'p1' })
        expect(perform.href).toBe(buildPerformPath('lab', 'p1', { from: 'studio' }))
        expect(perform.href).not.toContain('preset')
    })

    it('takes the Studio and Nodes addresses and words from the top bar', () => {
        const doors = projectDoors({ space: 'lab', project: 'p1', projectLabel: 'First room' })
        for (const key of ['studio', 'raw']) {
            const found = doors.find(d => d.key === key)
            const bar = tool(key, { projectLabel: 'First room' })
            expect(found.href).toBe(bar.href)
            expect(found.label).toBe(bar.label)
        }
    })

    it('says where Perform came from: studio by default, raw when asked', () => {
        const hrefOf = (args) => projectDoors({ space: 'lab', project: 'p1', ...args }).find(d => d.key === 'perform').href
        expect(hrefOf({})).toBe(buildPerformPath('lab', 'p1', { from: 'studio' }))
        expect(hrefOf({ from: 'raw' })).toBe(buildPerformPath('lab', 'p1', { from: 'raw' }))
        expect(hrefOf({ from: 'raw' })).not.toBe(hrefOf({}))
    })

    it('with layers known, adds Projection and Light only once the project has reached them', () => {
        const base = { space: 'lab', project: 'p1', isLocalInstall: true }
        expect(keys(projectDoors({ ...base, layers: at({}) }))).toEqual(['perform', 'studio', 'raw'])
        expect(keys(projectDoors({ ...base, layers: at({ wall: true }) }))).toEqual(['perform', 'studio', 'raw', 'map'])
        expect(keys(projectDoors({ ...base, layers: at({ lamps: true }) }))).toEqual(['perform', 'studio', 'raw', 'light'])
        expect(keys(projectDoors({ ...base, layers: at({ wall: true, lamps: true }) })))
            .toEqual(['perform', 'studio', 'raw', 'map', 'light'])
    })

    it('takes the Projection and Light addresses from the top bar too', () => {
        const doors = projectDoors({ space: 'lab', project: 'p1', projectLabel: 'First room', isLocalInstall: true, layers: at({ wall: true, lamps: true }) })
        const bar = { isLocalInstall: true, projectLabel: 'First room' }
        expect(doors.find(d => d.key === 'map').href).toBe(tool('map', bar).href)
        expect(doors.find(d => d.key === 'map').label).toBe(tool('map', bar).label)
        expect(doors.find(d => d.key === 'light').href).toBe(tool('light', bar).href)
    })
})

describe('projectDoors with allTools', () => {
    it('offers Projection and Light whatever the layers say', () => {
        const base = { space: 'lab', project: 'p1', isLocalInstall: true }
        expect(keys(projectDoors({ ...base, allTools: true }))).toEqual(['perform', 'studio', 'raw', 'map', 'light'])
        expect(keys(projectDoors({ ...base, layers: at({}), allTools: true })))
            .toEqual(['perform', 'studio', 'raw', 'map', 'light'])
    })

    it('still gives a page no door at all', () => {
        expect(projectDoors({ space: 'lab', project: 'p1', mode: 'code', allTools: true })).toEqual([])
    })

    it('is off by default: unknown layers offer only the sure doors', () => {
        expect(keys(projectDoors({ space: 'lab', project: 'p1' }))).toEqual(['perform', 'studio', 'raw'])
    })
})

describe('doorsForListRow', () => {
    const SPACE = { space: 'lab' }
    // A real sample: a project with a wall, a lamp rig and a light show.
    const RIG = { things: 132, nodes: 1, wires: 1, surfaces: 1, lamps: 52, joinedLamps: 52, lightCues: 36 }

    it('gives nothing for a missing row or a row with no id', () => {
        expect(doorsForListRow(null, SPACE)).toEqual([])
        expect(doorsForListRow(undefined, SPACE)).toEqual([])
        expect(doorsForListRow({ title: 'No id' }, SPACE)).toEqual([])
    })

    it('gives nothing for a page: its counts say page, no mode needed', () => {
        expect(doorsForListRow({ id: 'p1', title: 'A page', layers: { page: true, pageBytes: 11 } }, SPACE)).toEqual([])
    })

    it('gives nothing for a row whose mode is code', () => {
        expect(doorsForListRow({ id: 'p1', title: 'A page', mode: 'code' }, SPACE)).toEqual([])
    })

    it('a row with a rig: Perform, Studio, Nodes, Projection, Light, in that order', () => {
        const doors = doorsForListRow({ id: 'p1', title: 'Hall', layers: RIG }, { ...SPACE, isLocalInstall: true })
        expect(keys(doors)).toEqual(['perform', 'studio', 'raw', 'map', 'light'])
        expect(doors.find(d => d.key === 'light').href).toBe(tool('light', { projectLabel: 'Hall', isLocalInstall: true }).href)
    })

    it('empty counts: the three sure doors', () => {
        expect(keys(doorsForListRow({ id: 'p1', title: 'Empty', layers: {} }, SPACE))).toEqual(['perform', 'studio', 'raw'])
    })

    it('a row without counts: the three sure doors', () => {
        expect(keys(doorsForListRow({ id: 'p1', title: 'No counts' }, SPACE))).toEqual(['perform', 'studio', 'raw'])
        expect(keys(doorsForListRow({ id: 'p1', title: 'Null counts', layers: null }, SPACE))).toEqual(['perform', 'studio', 'raw'])
    })

    it('uses the same rule as the top bar: the layers it works out equal openLayersFromCounts', () => {
        const row = { id: 'p1', title: 'Hall', layers: { lamps: 2 } }
        expect(keys(doorsForListRow(row, SPACE)))
            .toEqual(keys(projectDoors({ space: 'lab', project: 'p1', projectLabel: 'Hall', layers: openLayersFromCounts(row.layers) })))
        expect(keys(doorsForListRow(row, SPACE))).toEqual(['perform', 'studio', 'raw', 'light'])
    })

    it('hands from and allTools on', () => {
        const row = { id: 'p1', title: 'Empty', layers: {} }
        expect(doorsForListRow(row, { ...SPACE, from: 'raw' })[0].href).toBe(buildPerformPath('lab', 'p1', { from: 'raw' }))
        expect(keys(doorsForListRow(row, { ...SPACE, allTools: true }))).toEqual(['perform', 'studio', 'raw', 'map', 'light'])
    })

    it('takes mode from the row when it has one', () => {
        expect(doorsForListRow({ id: 'p1', title: 'Scene', mode: 'fixed-camera', layers: { page: true } }, SPACE)).toHaveLength(3)
    })

    it('gives nothing without a space', () => {
        expect(doorsForListRow({ id: 'p1', title: 'x' })).toEqual([])
    })
})
