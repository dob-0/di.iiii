// pictures — image operators on the GPU, di.iiii's TOPs (9 palette types).
//
// Shared, honest fact for every entry below: a picture operator's `out`
// evaluates to `null` in the graph, always — the picture itself lives on the
// GPU inside the engine and never passes through computeNodeOutput
// (src/project/tops/topRuntime.js:9). That is not a device/browser gap like
// Webcam's — it is architectural, and no `expect` claims otherwise. Only
// Analyze bridges to real numbers (via context.liveOutputs, the same side
// channel Webcam/Mic/MIDI use), so it is the one entry with a `live` check.
import { exampleBuilder, live } from './helpers.js'

export const pictureExamples = [
    {
        typeId: 'top.camera',
        title: 'Camera In',
        story: 'A live camera feed as a picture operator — wired into Difference here. Its picture stays on the GPU; `out` is null in the graph (see the file header).',
        build: () => {
            const b = exampleBuilder('top.camera')
            b.place('top.camera', 'cam', 0, 0, { label: 'Camera In' })
            b.place('top.difference', 'diff', 1, 0, { label: 'Difference' })
            b.link('cam', 'out', 'diff', 'a')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'top.difference',
        title: 'Difference',
        story: 'What changed since the last frame — Camera In feeds it, and it feeds Level, the real motion-detection chain the all-nodes example wires end to end.',
        build: () => {
            const b = exampleBuilder('top.difference')
            b.place('top.camera', 'cam', 0, 0, { label: 'Camera In' })
            b.place('top.difference', 'diff', 1, 0, { label: 'Difference' })
            b.place('top.level', 'level', 2, 0, { label: 'Level', values: { threshold: 0.05, gain: 5 } })
            b.link('cam', 'out', 'diff', 'a')
            b.link('diff', 'out', 'level', 'a')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'top.level',
        title: 'Level',
        story: 'Threshold, gain, brightness, gamma, invert, opacity — one card of picture adjustment, fed by Difference and feeding Blur.',
        build: () => {
            const b = exampleBuilder('top.level')
            b.place('top.difference', 'diff', 0, 0, { label: 'Difference' })
            b.place('top.level', 'level', 1, 0, { label: 'Level', values: { threshold: 0.05, gain: 5 } })
            b.place('top.blur', 'blur', 2, 0, { label: 'Blur' })
            b.link('diff', 'out', 'level', 'a')
            b.link('level', 'out', 'blur', 'a')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'top.blur',
        title: 'Blur',
        story: 'Softens a picture by Size — fed by Level, feeding Feedback, so a motion trail glows instead of hard-edging.',
        build: () => {
            const b = exampleBuilder('top.blur')
            b.place('top.level', 'level', 0, 0, { label: 'Level' })
            b.place('top.blur', 'blur', 1, 0, { label: 'Blur', values: { size: 3 } })
            b.place('top.feedback', 'trail', 2, 0, { label: 'Feedback' })
            b.link('level', 'out', 'blur', 'a')
            b.link('blur', 'out', 'trail', 'a')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'top.edge',
        title: 'Edge',
        story: 'Outlines a picture by Strength — wired straight off Camera In so it can join Feedback in a Blend.',
        build: () => {
            const b = exampleBuilder('top.edge')
            b.place('top.camera', 'cam', 0, 0, { label: 'Camera In' })
            b.place('top.edge', 'edge', 1, 0, { label: 'Edge', values: { strength: 2 } })
            b.link('cam', 'out', 'edge', 'a')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'top.feedback',
        title: 'Feedback',
        story: 'Fades its own last frame by Trail, then joins the new one — the motion-glow trick, fed by Blur, joined with Edge in a Blend.',
        build: () => {
            const b = exampleBuilder('top.feedback')
            b.place('top.blur', 'blur', 0, 0, { label: 'Blur' })
            b.place('top.feedback', 'trail', 1, 0, { label: 'Feedback', values: { trail: 0.9 } })
            b.link('blur', 'out', 'trail', 'a')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'top.blend',
        title: 'Blend',
        story: 'Combines two pictures by Mode and Amount — Feedback and Edge joined here, the way the all-nodes example lights the projector.',
        build: () => {
            const b = exampleBuilder('top.blend')
            b.place('top.feedback', 'trail', 0, 0, { label: 'Feedback' })
            b.place('top.edge', 'edge', 0, 1, { label: 'Edge' })
            b.place('top.blend', 'blend', 1, 0, { label: 'Blend', values: { mode: '2' } })
            b.link('trail', 'out', 'blend', 'a')
            b.link('edge', 'out', 'blend', 'b')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'top.out',
        title: 'Picture Out',
        story: 'What the projector shows — a pass-through sink so the output page never has to know which operator happens to be last. Fed by Blend here.',
        build: () => {
            const b = exampleBuilder('top.out')
            b.place('top.blend', 'blend', 0, 0, { label: 'Blend' })
            b.place('top.out', 'projector', 1, 0, { label: 'Picture Out' })
            b.link('blend', 'out', 'projector', 'a')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'top.analyze',
        title: 'Analyze',
        story: 'Picture to numbers — Brightness, Amount, and the lit centre (X, Y) are measured a few times a second and published live while the editor runs. Fed by Level here.',
        build: () => {
            const b = exampleBuilder('top.analyze')
            b.place('top.level', 'level', 0, 0, { label: 'Level' })
            b.place('top.analyze', 'meter', 1, 0, { label: 'Analyze', values: { threshold: 0.2 } })
            b.link('level', 'out', 'meter', 'a')
            return b.result()
        },
        expect: [
            live('brightness', 'number', 0.4),
            live('amount', 'number', 0.15),
            live('x', 'number', 0.5),
            live('y', 'number', 0.5)
        ]
    }
]
