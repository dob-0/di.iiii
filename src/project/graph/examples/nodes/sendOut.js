// send out — leave the browser: MIDI/DMX out, publish (3 palette types).
import { exampleBuilder, live } from './helpers.js'

export const sendOutExamples = [
    {
        typeId: 'view.publish',
        title: 'Public page',
        story: 'What a visitor to the public page gets — Title is wired; the space-level switches (make public, set the live project) live in the panel itself, owner-or-admin only.',
        build: () => {
            const b = exampleBuilder('view.publish')
            b.place('value.string', 'title', 0, 0, { label: 'String · title', values: { value: 'Notations · Act One' } })
            b.place('view.publish', 'page', 1, 0, { label: 'Public page panel' })
            b.link('title', 'out', 'page', 'title')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'device.dmx.out',
        title: 'DMX Out',
        story: 'A channel on the lighting desk\'s rig — Master, Channel, Value and Blackout all come from real wires here (a wired Boolean is safe; typing "0"/"false" straight into Blackout\'s free-text field is a documented trap). Status reports the rig\'s own reply.',
        build: () => {
            const b = exampleBuilder('device.dmx.out')
            b.place('value.number', 'master', 0, 0, { label: 'Number · master', values: { value: 1 } })
            b.place('value.number', 'channel', 0, 1, { label: 'Number · channel', values: { value: 5 } })
            b.place('value.number', 'level', 0, 2, { label: 'Number · value', values: { value: 0.7 } })
            b.place('value.boolean', 'blackout', 0, 3, { label: 'Boolean · blackout', values: { value: false } })
            b.place('device.dmx.out', 'rig', 1, 0, { label: 'DMX Out' })
            b.link('master', 'out', 'rig', 'master')
            b.link('channel', 'out', 'rig', 'channel')
            b.link('level', 'out', 'rig', 'value')
            b.link('blackout', 'out', 'rig', 'blackout')
            return b.result()
        },
        expect: [live('status', 'string', 'sending')]
    },
    {
        typeId: 'device.midi.out',
        title: 'MIDI Out',
        story: 'Sends a note out over Web MIDI — Trigger holds the note, a changed Value goes out as CC. Status reports the feed\'s own reply.',
        build: () => {
            const b = exampleBuilder('device.midi.out')
            b.place('value.boolean', 'trigger', 0, 0, { label: 'Boolean · trigger' })
            b.place('value.number', 'note', 0, 1, { label: 'Number · note', values: { value: 64 } })
            b.place('value.number', 'value', 0, 2, { label: 'Number · CC value', values: { value: 0.5 } })
            b.place('device.midi.out', 'synth', 1, 0, { label: 'MIDI Out' })
            b.link('trigger', 'out', 'synth', 'trigger')
            b.link('note', 'out', 'synth', 'note')
            b.link('value', 'out', 'synth', 'value')
            return b.result()
        },
        expect: [live('status', 'string', 'sent')]
    }
]
