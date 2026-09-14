// the scene — light, sky, grid, scenes, desks, containers (11 palette types).
import { computed, exampleBuilder, nodeIdFor } from './helpers.js'

export const roomExamples = [
    {
        typeId: 'port.in',
        title: 'In',
        story: 'A doorway: placed inside a Geo, it puts a socket on the Geo\'s outer face. A Colour wired to that socket from outside reaches this door\'s Value.',
        build: () => {
            const b = exampleBuilder('port.in')
            b.place('geom.geo', 'room', 0, 0, { label: 'Geo' })
            b.place('value.color', 'outside', 0, 1, { label: 'Colour · outside', values: { value: '#ff79c6' } })
            const door = b.place('port.in', 'doorIn', 1, 0, {
                label: 'In · a way through the wall',
                parentKey: 'room',
                values: { label: 'Tint', portType: 'color', fallback: '#5fa8ff' }
            })
            b.link('outside', 'out', 'room', door.id)
            return b.result()
        },
        expect: [computed('value', 'color', 0)]
    },
    {
        typeId: 'port.out',
        title: 'Out',
        story: 'A doorway the other way: placed inside a Geo, its Value input is fed by a Number, and the Geo grows a matching socket on its outer face — read from outside.',
        build: () => {
            const b = exampleBuilder('port.out')
            b.place('geom.geo', 'room', 0, 0, { label: 'Geo' })
            b.place('value.number', 'level', 0, 1, { label: 'Number · level', values: { value: 0.5 } })
            b.place('port.out', 'door', 1, 0, {
                label: 'Out · a way back through',
                parentKey: 'room',
                values: { label: 'Level', portType: 'number' }
            })
            b.link('level', 'out', 'door', 'value')
            return b.result()
        },
        expect: [computed(nodeIdFor('port.out', 'door'), 'number', 0, { onId: nodeIdFor('port.out', 'room') })]
    },
    {
        typeId: 'world.environment',
        title: 'Environment',
        story: 'The scene\'s ambient wash and one sun — Ambient Colour and Sun Intensity come from wires. No output: a scene has exactly one, so nothing downstream needs to read it back.',
        build: () => {
            const b = exampleBuilder('world.environment')
            b.place('value.color', 'ambient', 0, 0, { label: 'Colour · ambient', values: { value: '#dfe8ff' } })
            b.place('value.number', 'sun', 0, 1, { label: 'Number · sun intensity', values: { value: 1.2 } })
            b.place('world.environment', 'light', 1, 0, { label: 'Environment' })
            b.link('ambient', 'out', 'light', 'ambientColor')
            b.link('sun', 'out', 'light', 'directionalIntensity')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'light.point',
        title: 'Light',
        story: 'A lamp standing where you put it — Colour, Intensity and Position all come from wires, root or inside any container.',
        build: () => {
            const b = exampleBuilder('light.point')
            b.place('value.color', 'colour', 0, 0, { label: 'Colour · warm', values: { value: '#ffe9c4' } })
            b.place('value.number', 'brightness', 0, 1, { label: 'Number · intensity', values: { value: 4 } })
            b.place('light.point', 'lamp', 1, 0, { label: 'Light' })
            b.link('colour', 'out', 'lamp', 'color')
            b.link('brightness', 'out', 'lamp', 'intensity')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'world.camera',
        title: 'Camera',
        story: 'An authored eye — Position and Look At come from wires. Standing in the room is not the same as being the shot: the ● toggle (not a port) marks which camera is active.',
        build: () => {
            const b = exampleBuilder('world.camera')
            b.place('value.vec3', 'position', 0, 0, { label: 'Vector · position', values: { value: [2, 1.4, 4] } })
            b.place('value.vec3', 'lookAt', 0, 1, { label: 'Vector · look at', values: { value: [0, 0.75, 0] } })
            b.place('world.camera', 'eye', 1, 0, { label: 'Camera' })
            b.link('position', 'out', 'eye', 'position')
            b.link('lookAt', 'out', 'eye', 'lookAt')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'world.background',
        title: 'Background',
        story: 'The sky colour, wired to a Colour card so it can be authored beside everything else.',
        build: () => {
            const b = exampleBuilder('world.background')
            b.place('value.color', 'sky', 0, 0, { label: 'Colour · night sky', values: { value: '#0a0e16' } })
            b.place('world.background', 'backdrop', 1, 0, { label: 'Background' })
            b.link('sky', 'out', 'backdrop', 'color')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'world.grid',
        title: 'Grid',
        story: 'The floor grid — Visible, Size and Colour all come from wires, so a Boolean can hide it entirely.',
        build: () => {
            const b = exampleBuilder('world.grid')
            b.place('value.boolean', 'shown', 0, 0, { label: 'Boolean · visible', values: { value: true } })
            b.place('value.number', 'size', 0, 1, { label: 'Number · size', values: { value: 30 } })
            b.place('world.grid', 'floor', 1, 0, { label: 'Grid' })
            b.link('shown', 'out', 'floor', 'visible')
            b.link('size', 'out', 'floor', 'size')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'universe.world',
        title: 'Scene',
        story: 'The 3D place, entered like any container — Title and Sky come from wires, and (since 2026-08-19) the Scene\'s own Title output can feed a sibling Text panel, an edge crossing OUT of a container.',
        build: () => {
            const b = exampleBuilder('universe.world')
            b.place('value.string', 'title', 0, 0, { label: 'String · title', values: { value: 'Act One' } })
            b.place('value.color', 'sky', 0, 1, { label: 'Colour · sky', values: { value: '#0a0e16' } })
            b.place('universe.world', 'scene', 1, 0, { label: 'Scene' })
            b.place('view.text', 'label', 2, 0, { label: 'Text panel — mirrors the Scene\'s title' })
            b.link('title', 'out', 'scene', 'title')
            b.link('sky', 'out', 'scene', 'bgColor')
            b.link('scene', 'title', 'label', 'content')
            return b.result()
        },
        expect: [computed('title', 'string', 0), computed('bgColor', 'color', 0)]
    },
    {
        typeId: 'universe.space',
        title: 'Kiosk',
        story: 'Hides the toolbar for everything inside — set directly on the card, honestly: a wire into "Show the toolbar" is accepted by the port but currently ignored by the chrome check (docs/ai/known-fixes.md), so it is not wired here.',
        build: () => {
            const b = exampleBuilder('universe.space')
            b.place('universe.space', 'kiosk', 0, 0, { label: 'Kiosk', values: { showChrome: false } })
            b.place('geom.cube', 'exhibit', 1, 0, { label: 'Cube', parentKey: 'kiosk' })
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'geom.geo',
        title: 'Geo',
        story: 'The plain place — TouchDesigner\'s Geometry COMP. Everything spatial placed inside it renders inside it and travels with it; a Cube standing in this Geo IS its Geometry output.',
        build: () => {
            const b = exampleBuilder('geom.geo')
            b.place('geom.geo', 'room', 0, 0, { label: 'Geo' })
            b.place('geom.cube', 'resident', 1, 0, { label: 'Cube', parentKey: 'room' })
            return b.result()
        },
        expect: [computed('geometry', 'geometry', 0)]
    },
    {
        typeId: 'studio',
        title: 'Studio',
        story: 'The editor itself, as one node you can enter — its Title comes from a wire and is the only thing it will say about itself; what is inside stays inside.',
        build: () => {
            const b = exampleBuilder('studio')
            b.place('value.string', 'title', 0, 0, { label: 'String · title', values: { value: 'Studio' } })
            b.place('studio', 'editor', 1, 0, { label: 'Studio' })
            b.link('title', 'out', 'editor', 'title')
            return b.result()
        },
        expect: [computed('title', 'string', 0)]
    }
]
