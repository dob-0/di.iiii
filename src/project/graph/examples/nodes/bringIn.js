// bring in — cameras, microphones, sensors, input devices, and files
// (8 palette types). Several of these publish through context.liveOutputs —
// a side channel a real device/browser feed writes into while its window is
// open — rather than through the pure graph. `live()` checks prove the
// WIRING reads that channel correctly by injecting a sample value, without
// needing a camera, a MIDI controller or a network in the test run.
import { computed, exampleBuilder, live } from './helpers.js'

export const bringInExamples = [
    {
        typeId: 'geom.model',
        title: 'Model',
        story: 'A file the person brought in, standing in space — Scale is wired here. No `src` asset ships with this example (honest: a freshly placed Model is exactly this empty until a file is chosen), so nothing renders yet.',
        build: () => {
            const b = exampleBuilder('geom.model')
            b.place('value.vec3', 'scale', 0, 0, { label: 'Vector · scale', values: { value: [1.2, 1.2, 1.2] } })
            b.place('geom.model', 'mesh', 1, 0, { label: 'Model' })
            b.link('scale', 'out', 'mesh', 'scale')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'media.video',
        title: 'Video',
        story: 'A video file standing in space, wired to Loop — its playing picture publishes to the Frame port only while the window that renders it is open (the same idiom as Webcam).',
        build: () => {
            const b = exampleBuilder('media.video')
            b.place('value.boolean', 'loop', 0, 0, { label: 'Boolean · loop', values: { value: true } })
            b.place('media.video', 'clip', 1, 0, { label: 'Video', values: { muted: true } })
            b.place('view.image', 'preview', 2, 0, { label: 'Image panel' })
            b.link('loop', 'out', 'clip', 'loop')
            b.link('clip', 'frame', 'preview', 'src')
            return b.result()
        },
        expect: [live('frame', 'texture', 'fake-video-frame')]
    },
    {
        typeId: 'media.audio',
        title: 'Sound',
        story: 'A sound file standing in space — Volume and Loop are wired; Volume/Low/Mid/High publish live analysis numbers while the editor\'s own playback runs.',
        build: () => {
            const b = exampleBuilder('media.audio')
            b.place('value.number', 'gain', 0, 0, { label: 'Number · volume', values: { value: 0.8 } })
            b.place('value.boolean', 'loop', 0, 1, { label: 'Boolean · loop', values: { value: true } })
            b.place('media.audio', 'speaker', 1, 0, { label: 'Sound' })
            b.link('gain', 'out', 'speaker', 'volume')
            b.link('loop', 'out', 'speaker', 'loop')
            return b.result()
        },
        expect: [
            live('volume', 'number', 0.6),
            live('low', 'number', 0.2),
            live('mid', 'number', 0.5),
            live('high', 'number', 0.3)
        ]
    },
    {
        typeId: 'source.webcam',
        title: 'Webcam',
        story: 'The live camera frame — real once its window is open (permission-denied and no-camera are normal states it shows). Wired here into a Plane\'s Texture; a live frame always wins over a Texture URL.',
        build: () => {
            const b = exampleBuilder('source.webcam')
            b.place('source.webcam', 'cam', 0, 0, { label: 'Webcam' })
            b.place('geom.plane', 'screen', 1, 0, { label: 'Plane' })
            b.link('cam', 'frame', 'screen', 'texture')
            return b.result()
        },
        expect: [live('frame', 'texture', 'fake-webcam-texture')]
    },
    {
        typeId: 'source.mic',
        title: 'Microphone',
        story: 'Volume 0..1, live while the window is open — wired here into a lamp\'s Intensity so the room pulses with sound. Frequency is a raw spectrum array; nothing in the registry can consume it yet.',
        build: () => {
            const b = exampleBuilder('source.mic')
            b.place('source.mic', 'input', 0, 0, { label: 'Microphone' })
            b.place('light.point', 'lamp', 1, 0, { label: 'Light' })
            b.link('input', 'volume', 'lamp', 'intensity')
            return b.result()
        },
        expect: [live('volume', 'number', 0.4), live('frequency', 'any', [10, 20, 30])]
    },
    {
        typeId: 'device.midi.in',
        title: 'MIDI In',
        story: 'A hardware controller, live while its window is open — listening on every channel (0) by default so a controller set to any channel is heard. Note is wired into a Sphere\'s radius here.',
        build: () => {
            const b = exampleBuilder('device.midi.in')
            b.place('device.midi.in', 'controller', 0, 0, { label: 'MIDI In', values: { channel: 0 } })
            b.place('geom.sphere', 'ball', 1, 0, { label: 'Sphere' })
            b.link('controller', 'note', 'ball', 'radius')
            return b.result()
        },
        expect: [
            live('note', 'number', 60),
            live('velocity', 'number', 100),
            live('cc', 'number', 1),
            live('value', 'number', 0.5),
            live('trigger', 'number', 3)
        ]
    },
    {
        typeId: 'view.button',
        title: 'Button',
        story: 'The desk\'s Go — Presses is the authored, undoable count (one document op per press); Pressed is this window\'s live finger, honest only while actually held.',
        build: () => {
            const b = exampleBuilder('view.button')
            b.place('view.button', 'go', 0, 0, { label: 'Go', values: { presses: 2 } })
            b.place('light.point', 'lamp', 1, 0, { label: 'Light' })
            b.link('go', 'presses', 'lamp', 'intensity')
            return b.result()
        },
        expect: [computed('presses', 'number', 0), live('pressed', 'boolean', true)]
    },
    {
        typeId: 'device.keyboard',
        title: 'Keyboard',
        story: 'The operator\'s other hand — a chosen key, live while the editor is open. Count rises once per press, wired here into a lamp\'s Intensity; a wire into Key itself is accepted but ignored (the listener reads node.values.key directly).',
        build: () => {
            const b = exampleBuilder('device.keyboard')
            b.place('device.keyboard', 'hand', 0, 0, { label: 'Keyboard', values: { key: 'Space' } })
            b.place('light.point', 'lamp', 1, 0, { label: 'Light' })
            b.link('hand', 'count', 'lamp', 'intensity')
            return b.result()
        },
        expect: [live('pressed', 'boolean', true), live('count', 'number', 5)]
    }
]
