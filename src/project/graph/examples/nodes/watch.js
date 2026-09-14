// watch — observe and inspect what is happening (6 palette types).
import { computed, exampleBuilder } from './helpers.js'

export const watchExamples = [
    {
        typeId: 'view.outliner',
        title: 'Outliner',
        story: 'Lists what exists in the current scope — its Title is wired, but the list itself has no port: it reads the document directly, not a wire.',
        build: () => {
            const b = exampleBuilder('view.outliner')
            b.place('value.string', 'title', 0, 0, { label: 'String · title', values: { value: 'What\'s here' } })
            b.place('view.outliner', 'list', 1, 0, { label: 'Outliner panel' })
            b.link('title', 'out', 'list', 'title')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'view.inspector',
        title: 'Inspector',
        story: 'Edits whatever is selected — its Title is wired, but selection itself is per-viewer state, never a wire.',
        build: () => {
            const b = exampleBuilder('view.inspector')
            b.place('value.string', 'title', 0, 0, { label: 'String · title', values: { value: 'Properties' } })
            b.place('view.inspector', 'panel', 1, 0, { label: 'Inspector panel' })
            b.link('title', 'out', 'panel', 'title')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'view.timeline',
        title: 'Timeline',
        story: 'The transport as wire values — Playhead climbs on the document clock while Playing is true, driving a Sphere\'s radius here so growth is visible without opening the window.',
        build: () => {
            const b = exampleBuilder('view.timeline')
            b.place('view.timeline', 'transport', 0, 0, {
                label: 'Timeline panel',
                values: { playing: true, fps: 30, playFromFrame: 0, playStartClockMs: 0 }
            })
            b.place('geom.sphere', 'ball', 1, 0, { label: 'Sphere' })
            b.link('transport', 'playhead', 'ball', 'radius')
            return b.result()
        },
        expect: [computed('playhead', 'number', 0), computed('playing', 'boolean', 0)]
    },
    {
        typeId: 'view.director',
        title: 'Director',
        story: 'A specialised editor for a registered work (algovrithm) — it reads as general-purpose in the palette, but the piece it edits is a hard-coded fallback, not a port (docs/ai/known-fixes.md).',
        build: () => {
            const b = exampleBuilder('view.director')
            b.place('view.director', 'panel', 0, 0, { label: 'Director panel' })
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'stream.monitor',
        title: 'Monitor',
        story: 'TouchDesigner\'s viewer, as a window — wire any texture into Source and watch it live while you keep wiring. A picture operator (Camera In, Blur, …) cannot be watched here yet: its picture never leaves the GPU network (topRuntime.js), a known gap.',
        build: () => {
            const b = exampleBuilder('stream.monitor')
            b.place('source.webcam', 'cam', 0, 0, { label: 'Webcam' })
            b.place('stream.monitor', 'screen', 1, 0, { label: 'Monitor', values: { title: 'Camera preview' } })
            b.link('cam', 'frame', 'screen', 'src')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'view.desk',
        title: 'Desk',
        story: 'Every machine linked into this space and what it has — cameras, microphones, screens — with a button that places a device\'s operator already set to run on its machine. No ports: what it shows comes from the space\'s machine roster, not a wire.',
        build: () => {
            const b = exampleBuilder('view.desk')
            b.place('view.desk', 'machines', 0, 0, { label: 'Desk' })
            return b.result()
        },
        expect: []
    }
]
