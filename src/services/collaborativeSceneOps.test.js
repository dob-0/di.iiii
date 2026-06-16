import { describe, expect, it } from 'vitest'
import {
    applySceneOps,
    buildCollaborativeSceneSnapshot,
    buildSceneOpsFromSnapshots
} from './collaborativeSceneOps.js'

const createScene = (overrides = {}) => buildCollaborativeSceneSnapshot({
    objects: [],
    backgroundColor: '#f7f6ef',
    gridSize: 20,
    gridAppearance: {
        cellSize: 0.75,
        cellThickness: 0.75,
        sectionSize: 6,
        sectionThickness: 1.2,
        fadeDistance: 100,
        fadeStrength: 0.1,
        offset: 0.015
    },
    renderSettings: {
        dpr: [1, 2],
        shadows: true,
        antialias: true,
        toneMapping: 'ACESFilmic',
        toneMappingExposure: 1
    },
    ambientLight: { color: '#ffffff', intensity: 0.8 },
    directionalLight: { color: '#ffffff', intensity: 1, position: [10, 10, 5] },
    transformSnaps: { translation: 0.1, rotation: 15, scale: 0.1 },
    default3DView: { position: [0, 1.6, 4], target: [0, 1, 0] },
    ...overrides
})

describe('collaborativeSceneOps', () => {
    it('canonicalizes missing presentation during snapshot round-trips', () => {
        const previousSnapshot = createScene()
        const nextSnapshot = createScene({
            objects: [{
                id: 'box-1',
                type: 'box',
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1]
            }]
        })

        const ops = buildSceneOpsFromSnapshots({
            previousSnapshot,
            nextSnapshot,
            clientId: 'client-a'
        })

        expect(ops).toHaveLength(1)
        expect(ops[0]).toMatchObject({ type: 'addObject' })

        const acknowledgedSnapshot = buildCollaborativeSceneSnapshot(
            applySceneOps(previousSnapshot, ops)
        )

        expect(acknowledgedSnapshot).toEqual(nextSnapshot)
        expect(
            buildSceneOpsFromSnapshots({
                previousSnapshot: acknowledgedSnapshot,
                nextSnapshot,
                clientId: 'client-a'
            })
        ).toEqual([])
    })
})
