import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { documentFingerprint, makePlayCopy } from '../play/playCopy.js'
import { PlayButton, PlayHost, usePlay } from './PlayButton.jsx'

// The walker itself is WebGL: stood in for here. It receives the document the way the real one does, and WALKS by changing it
// (moves a thing, adds a thing) — which must never reach the editor's document.
const seen = { document: null }
vi.mock('../../components/LiveProjectScene.jsx', () => ({
    default: ({ document, onExit }) => {
        seen.document = document
        // eslint-disable-next-line react-hooks/rules-of-hooks -- a test stub, always rendered the same way
        useEffect(() => {
            document.entities[0].components.transform.position[0] = 99
            document.entities.push({ id: 'walked-in', name: 'walked in' })
            document.worldState.spawn = { x: 1, z: 2, yaw: 0 }
        }, [document])
        return <div data-testid="walk-stub"><button type="button" onClick={onExit}>exit</button></div>
    }
}))

const project = () => ({
    projectMeta: { id: 'p1', spaceId: 'playlab', title: 'Night forest' },
    entities: [{ id: 'e1', name: 'tree', components: { transform: { position: [1, 0, 2] } } }],
    worldState: { spawn: { x: 0, z: 5, yaw: 3.14 }, savedView: { position: [0, 2, 6], target: [0, 1, 0] } },
    nodes: [
        { id: 't', typeId: 'signal.timer', props: {} },
        { id: 'x', typeId: 'view.text', props: {} }
    ],
    edges: [{ id: 'w', fromNodeId: 't', fromPort: 'seconds', toNodeId: 'x', toPort: 'content' }]
})

// A stand-in editor: it owns the document and the camera, as StudioEditor does, and mounts the host beside the button.
function Editor({ onState }) {
    const [doc, setDoc] = useState(project)
    const [camera, setCamera] = useState({ position: [0, 2, 6], target: [0, 1, 0] })
    const play = usePlay()
    onState({ doc, camera })
    return (
        <div>
            <button type="button" onClick={() => setDoc((d) => ({ ...d, entities: [...d.entities, { id: 'e2', name: 'rock', components: { transform: { position: [3, 0, 3] } } }] }))}>edit</button>
            <button type="button" onClick={() => setCamera({ position: [4, 2, 4], target: [0, 1, 0] })}>orbit</button>
            <PlayButton onPlay={play.start} />
            <PlayHost playing={play.playing} document={doc} onStop={play.stop} />
        </div>
    )
}

describe('Play on a copy: edit → Play → walk → Stop', () => {
    afterEach(() => { cleanup(); seen.document = null })

    it('the same camera and the same document (hash equal) after Stop; the walk saw a copy', async () => {
        let now
        render(<Editor onState={(s) => { now = s }} />)
        fireEvent.click(screen.getByText('edit'))
        fireEvent.click(screen.getByText('orbit'))
        const cameraBefore = JSON.stringify(now.camera)
        const hashBefore = documentFingerprint(now.doc)
        expect(now.doc.entities).toHaveLength(2)

        await act(async () => { fireEvent.click(screen.getByText('Play ▸')) })
        // the PLAYING bar and the walk
        expect(await screen.findByText('Playing')).toBeTruthy()
        expect(await screen.findByTestId('walk-stub')).toBeTruthy()
        // the walk got a copy, started from the edited document, and changed it freely
        expect(seen.document).not.toBe(now.doc)
        expect(seen.document.entities.map((e) => e.id)).toEqual(['e1', 'e2', 'walked-in'])
        // while playing, the editor's document is already untouched
        expect(documentFingerprint(now.doc)).toBe(hashBefore)

        fireEvent.click(screen.getByText('Stop ■'))
        expect(screen.queryByText('Playing')).toBeNull()
        expect(screen.queryByTestId('walk-stub')).toBeNull()
        expect(JSON.stringify(now.camera)).toBe(cameraBefore)
        expect(documentFingerprint(now.doc)).toBe(hashBefore)
        expect(now.doc.entities.map((e) => e.id)).toEqual(['e1', 'e2'])
        expect(now.doc.entities[0].components.transform.position[0]).toBe(1)
        expect(now.doc.worldState.spawn).toEqual({ x: 0, z: 5, yaw: 3.14 })
    })

    it('the walk leaving by its own exit also stops play', async () => {
        render(<Editor onState={() => {}} />)
        await act(async () => { fireEvent.click(screen.getByText('Play ▸')) })
        fireEvent.click(await screen.findByText('exit'))
        expect(screen.queryByText('Playing')).toBeNull()
        expect(screen.getByText('Play ▸')).toBeTruthy()
    })
})

describe('the copy and the fingerprint', () => {
    it('makePlayCopy is deep; the fingerprint ignores key order and sees any change', () => {
        const a = project()
        const b = makePlayCopy(a)
        expect(b).not.toBe(a)
        expect(b.entities[0]).not.toBe(a.entities[0])
        expect(documentFingerprint(b)).toBe(documentFingerprint(a))
        expect(documentFingerprint({ x: 1, y: 2 })).toBe(documentFingerprint({ y: 2, x: 1 }))
        b.entities[0].components.transform.position[2] = 2.0001
        expect(documentFingerprint(b)).not.toBe(documentFingerprint(a))
    })
})
