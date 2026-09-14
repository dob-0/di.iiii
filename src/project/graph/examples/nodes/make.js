// make — things you conjure into the space (16 palette types).
import { computed, exampleBuilder, nodeIdFor } from './helpers.js'

export const makeExamples = [
    {
        typeId: 'geom.cube',
        title: 'Cube',
        story: 'The plain box — Colour and Size come from wires here, not the [0,1,0] "invisible cube" bug the all-nodes example used to ship (docs/ai/known-fixes.md).',
        build: () => {
            const b = exampleBuilder('geom.cube')
            b.place('value.color', 'colour', 0, 0, { label: 'Colour · cyan', values: { value: '#4df9ff' } })
            b.place('value.vec3', 'size', 0, 1, { label: 'Vector · size', values: { value: [0.8, 0.8, 0.8] } })
            b.place('geom.cube', 'box', 1, 0, { label: 'Cube' })
            b.link('colour', 'out', 'box', 'color')
            b.link('size', 'out', 'box', 'size')
            return b.result()
        },
        expect: [computed('bounds', 'vec3', 0), computed('geometry', 'geometry', 0)]
    },
    {
        typeId: 'geom.sphere',
        title: 'Sphere',
        story: 'A ball whose Radius and Colour are both wired — grow it by changing the Number, not the card.',
        build: () => {
            const b = exampleBuilder('geom.sphere')
            b.place('value.number', 'radius', 0, 0, { label: 'Number · radius', values: { value: 0.6 } })
            b.place('value.color', 'colour', 0, 1, { label: 'Colour', values: { value: '#ff79c6' } })
            b.place('geom.sphere', 'ball', 1, 0, { label: 'Sphere' })
            b.link('radius', 'out', 'ball', 'radius')
            b.link('colour', 'out', 'ball', 'color')
            return b.result()
        },
        expect: [computed('geometry', 'geometry', 0)]
    },
    {
        typeId: 'geom.plane',
        title: 'Plane',
        story: 'A flat panel — Width, Height and Colour come from wires. A Webcam wired into Texture would show live video once its window is opened (not running in this static graph).',
        build: () => {
            const b = exampleBuilder('geom.plane')
            b.place('value.color', 'colour', 0, 0, { label: 'Colour', values: { value: '#ffffff' } })
            b.place('value.number', 'width', 0, 1, { label: 'Number · width', values: { value: 3 } })
            b.place('value.number', 'height', 0, 2, { label: 'Number · height', values: { value: 1.5 } })
            b.place('geom.plane', 'panel', 1, 0, { label: 'Plane' })
            b.link('colour', 'out', 'panel', 'color')
            b.link('width', 'out', 'panel', 'width')
            b.link('height', 'out', 'panel', 'height')
            return b.result()
        },
        expect: [computed('geometry', 'geometry', 0)]
    },
    {
        typeId: 'shape.merge',
        title: 'Merge',
        story: 'Joins two shapes into one — bare it carries nothing on purpose; fed a Sphere and a Cube it merges them into one geometry value.',
        build: () => {
            const b = exampleBuilder('shape.merge')
            b.place('geom.sphere', 'head', 0, 0, { label: 'Sphere · head', values: { radius: 0.3, position: [0, 1.2, 0] } })
            b.place('geom.cube', 'body', 0, 1, { label: 'Cube · body', values: { position: [0, 0.5, 0] } })
            b.place('shape.merge', 'merge', 1, 0, { label: 'Merge' })
            b.link('head', 'geometry', 'merge', 'a')
            b.link('body', 'geometry', 'merge', 'b')
            return b.result()
        },
        expect: [computed('out', 'geometry', 0)]
    },
    {
        typeId: 'geom.array',
        title: 'Array',
        story: 'Repeats a shape N times along an offset — a Cube fed in becomes a row of cubes; bare it carries nothing.',
        build: () => {
            const b = exampleBuilder('geom.array')
            b.place('geom.cube', 'unit', 0, 0, { label: 'Cube' })
            b.place('geom.array', 'row', 1, 0, { label: 'Array', values: { count: 4, offset: [1.2, 0, 0] } })
            b.link('unit', 'geometry', 'row', 'geometry')
            return b.result()
        },
        expect: [computed('out', 'geometry', 0)]
    },
    {
        typeId: 'geom.cylinder',
        title: 'Cylinder',
        story: 'A column — Radius and Height come from wires, standing in for a pillar or a drum.',
        build: () => {
            const b = exampleBuilder('geom.cylinder')
            b.place('value.number', 'height', 0, 0, { label: 'Number · height', values: { value: 2 } })
            b.place('value.color', 'colour', 0, 1, { label: 'Colour', values: { value: '#bd93f9' } })
            b.place('geom.cylinder', 'column', 1, 0, { label: 'Cylinder' })
            b.link('height', 'out', 'column', 'height')
            b.link('colour', 'out', 'column', 'color')
            return b.result()
        },
        expect: [computed('geometry', 'geometry', 0)]
    },
    {
        typeId: 'geom.cone',
        title: 'Cone',
        story: 'A spike — Radius comes from a wire, so widening the Number widens the cone\'s base.',
        build: () => {
            const b = exampleBuilder('geom.cone')
            b.place('value.number', 'radius', 0, 0, { label: 'Number · radius', values: { value: 0.7 } })
            b.place('geom.cone', 'spike', 1, 0, { label: 'Cone' })
            b.link('radius', 'out', 'spike', 'radius')
            return b.result()
        },
        expect: [computed('geometry', 'geometry', 0)]
    },
    {
        typeId: 'geom.torus',
        title: 'Torus',
        story: 'A ring — its Tube thickness is wired, so a thin Number makes a delicate hoop and a wide one a fat donut.',
        build: () => {
            const b = exampleBuilder('geom.torus')
            b.place('value.number', 'tube', 0, 0, { label: 'Number · tube', values: { value: 0.12 } })
            b.place('geom.torus', 'ring', 1, 0, { label: 'Torus' })
            b.link('tube', 'out', 'ring', 'tube')
            return b.result()
        },
        expect: [computed('geometry', 'geometry', 0)]
    },
    {
        typeId: 'geom.line',
        title: 'Line',
        story: 'A stroke between two points — its far end is wired to a Vector, so moving the vector re-draws the line.',
        build: () => {
            const b = exampleBuilder('geom.line')
            b.place('value.vec3', 'end', 0, 0, { label: 'Vector · to', values: { value: [1.5, 1.5, 0] } })
            b.place('value.color', 'colour', 0, 1, { label: 'Colour', values: { value: '#f1fa8c' } })
            b.place('geom.line', 'stroke', 1, 0, { label: 'Line' })
            b.link('end', 'out', 'stroke', 'to')
            b.link('colour', 'out', 'stroke', 'color')
            return b.result()
        },
        expect: [computed('geometry', 'geometry', 0)]
    },
    {
        typeId: 'geom.circle',
        title: 'Circle',
        story: 'A flat disc — its Radius is wired, growing and shrinking the mark on the floor.',
        build: () => {
            const b = exampleBuilder('geom.circle')
            b.place('value.number', 'radius', 0, 0, { label: 'Number · radius', values: { value: 0.9 } })
            b.place('geom.circle', 'disc', 1, 0, { label: 'Circle' })
            b.link('radius', 'out', 'disc', 'radius')
            return b.result()
        },
        expect: [computed('geometry', 'geometry', 0)]
    },
    {
        typeId: 'geom.transform',
        title: 'Transform',
        story: 'Re-frames one copy of a shape — a Torus fed in, moved and scaled by wires; bare it carries nothing.',
        build: () => {
            const b = exampleBuilder('geom.transform')
            b.place('geom.torus', 'ring', 0, 0, { label: 'Torus' })
            b.place('value.vec3', 'position', 0, 1, { label: 'Vector · position', values: { value: [0, 1, 0] } })
            b.place('geom.transform', 'reframe', 1, 0, { label: 'Transform' })
            b.link('ring', 'geometry', 'reframe', 'geometry')
            b.link('position', 'out', 'reframe', 'position')
            return b.result()
        },
        expect: [computed('out', 'geometry', 0)]
    },
    {
        typeId: 'geom.constructor',
        title: 'Constructor',
        story: 'A node made of nodes — enter it, build a shape from parts, and the Constructor stands in the room being that shape. Two spheres merged through its Out door make a snowman.',
        build: () => {
            const b = exampleBuilder('geom.constructor')
            b.place('geom.constructor', 'snowman', 0, 0, { label: 'Constructor' })
            b.place('geom.sphere', 'head', 1, 0, {
                label: 'Head', parentKey: 'snowman', values: { radius: 0.3, color: '#ffffff', position: [0, 1.2, 0] }
            })
            b.place('geom.sphere', 'body', 1, 1, {
                label: 'Body', parentKey: 'snowman', values: { radius: 0.5, color: '#dfe8ff', position: [0, 0.5, 0] }
            })
            b.place('shape.merge', 'merge', 2, 0, { label: 'Merge', parentKey: 'snowman' })
            b.place('port.out', 'door', 2, 1, {
                label: 'Out · the worn shape', parentKey: 'snowman', values: { label: 'Shape', portType: 'geometry' }
            })
            b.link('head', 'geometry', 'merge', 'a')
            b.link('body', 'geometry', 'merge', 'b')
            b.link('merge', 'out', 'door', 'value')
            return b.result()
        },
        expect: [computed(nodeIdFor('geom.constructor', 'door'), 'geometry', 0)]
    },
    {
        typeId: 'view.text',
        title: 'Text',
        story: 'A text panel — its Content is wired to a String, so what the panel reads is authored one card away.',
        build: () => {
            const b = exampleBuilder('view.text')
            b.place('value.string', 'copy', 0, 0, { label: 'String · line', values: { value: 'Doors open at 7.' } })
            b.place('view.text', 'panel', 1, 0, { label: 'Text panel' })
            b.link('copy', 'out', 'panel', 'content')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'view.list',
        title: 'List',
        story: 'A checklist panel with groups and rows — the only node whose card shows a summary ("N rows · M groups") without opening the window.',
        build: () => {
            const b = exampleBuilder('view.list')
            b.place('view.list', 'checklist', 0, 0, {
                label: 'List panel',
                values: {
                    groups: ['Core', 'Would be good'],
                    items: [
                        { id: 'row-1', text: 'Six laptops', group: 'Core', order: 0 },
                        { id: 'row-2', text: 'A second projector', group: 'Would be good', order: 1 }
                    ]
                }
            })
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'view.image',
        title: 'Image',
        story: 'An image panel — its Source is a texture port. A Webcam wired in would show a live frame once its window is open; nothing is running here.',
        build: () => {
            const b = exampleBuilder('view.image')
            b.place('source.webcam', 'cam', 0, 0, { label: 'Webcam' })
            b.place('view.image', 'frame', 1, 0, { label: 'Image panel' })
            b.link('cam', 'frame', 'frame', 'src')
            return b.result()
        },
        expect: []
    },
    {
        typeId: 'view.browser',
        title: 'Browser',
        story: 'An iframe panel pointed at a URL — same-origin here (/wiki) so it still opens with no network, unlike a page on someone else\'s domain that may refuse to be framed.',
        build: () => {
            const b = exampleBuilder('view.browser')
            b.place('view.browser', 'frame', 0, 0, { label: 'Browser panel', values: { url: '/wiki' } })
            return b.result()
        },
        expect: []
    }
]
