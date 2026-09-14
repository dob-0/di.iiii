// numbers — values, time, math: the stuff you shape and wire (38 types).
// One example per type; see docs/ai/audits/2026-09-14-raw-nodes.md "Numbers"
// for the truth this was built from.
import { computed, edgeCheck, exampleBuilder } from './helpers.js'

export const numbersExamples = [
    {
        typeId: 'value.number',
        title: 'Number',
        story: 'A plain number, wired into a Sphere so changing it changes the ball\'s size.',
        build: () => {
            const b = exampleBuilder('value.number')
            b.place('value.number', 'radius', 0, 0, { label: 'Number · radius', values: { value: 0.8 } })
            b.place('geom.sphere', 'ball', 1, 0, { label: 'Sphere' })
            b.link('radius', 'out', 'ball', 'radius')
            return b.result()
        },
        expect: [computed('out', 'number', 0)]
    },
    {
        typeId: 'value.color',
        title: 'Colour',
        story: 'A colour swatch, wired straight into a Cube so the cube wears it.',
        build: () => {
            const b = exampleBuilder('value.color')
            b.place('value.color', 'hue', 0, 0, { label: 'Colour · cyan', values: { value: '#4df9ff' } })
            b.place('geom.cube', 'box', 1, 0, { label: 'Cube' })
            b.link('hue', 'out', 'box', 'color')
            return b.result()
        },
        expect: [computed('out', 'color', 0)]
    },
    {
        typeId: 'value.vec3',
        title: 'Vector',
        story: 'An authored [x,y,z], wired into a Cube\'s Position so the cube stands where the vector points.',
        build: () => {
            const b = exampleBuilder('value.vec3')
            b.place('value.vec3', 'spot', 0, 0, { label: 'Vector · spot', values: { value: [1.5, 0.5, -1] } })
            b.place('geom.cube', 'box', 1, 0, { label: 'Cube' })
            b.link('spot', 'out', 'box', 'position')
            return b.result()
        },
        expect: [computed('out', 'vec3', 0)]
    },
    {
        typeId: 'value.boolean',
        title: 'Boolean',
        story: 'An on/off switch, wired into the Grid\'s Visible so the floor grid can be hidden.',
        build: () => {
            const b = exampleBuilder('value.boolean')
            b.place('value.boolean', 'on', 0, 0, { label: 'Boolean · on', values: { value: true } })
            b.place('world.grid', 'grid', 1, 0, { label: 'Grid' })
            b.link('on', 'out', 'grid', 'visible')
            return b.result()
        },
        expect: [computed('out', 'boolean', 0)]
    },
    {
        typeId: 'value.string',
        title: 'String',
        story: 'A line of text, wired into a Text panel so it reads what the String says.',
        build: () => {
            const b = exampleBuilder('value.string')
            b.place('value.string', 'title', 0, 0, { label: 'String · title', values: { value: 'Backstage' } })
            b.place('view.text', 'panel', 1, 0, { label: 'Text panel' })
            b.link('title', 'out', 'panel', 'content')
            return b.result()
        },
        expect: [computed('out', 'string', 0)]
    },
    {
        typeId: 'time',
        title: 'Time',
        story: 'The document clock. Its Sin swings -1..1 once a second (bpm 60); remapped through Range, it drives a lamp\'s brightness up and down.',
        build: () => {
            const b = exampleBuilder('time')
            b.place('time', 'clock', 0, 0, { label: 'Time · clock' })
            b.place('math.range', 'remap', 1, 0, {
                label: 'Range',
                values: { inMin: -1, inMax: 1, outMin: 0.2, outMax: 2 }
            })
            b.place('light.point', 'lamp', 2, 0, { label: 'Light' })
            b.link('clock', 'sin', 'remap', 'in')
            b.link('remap', 'out', 'lamp', 'intensity')
            return b.result()
        },
        expect: [
            computed('elapsed', 'number', 0),
            computed('elapsed', 'number', 500),
            computed('sin', 'number', 0)
        ]
    },
    {
        typeId: 'math.op',
        title: 'Math',
        story: 'One card, an operation menu — set to Multiply here, it scales two numbers into a Sphere\'s radius. Add, Subtract, Divide, Modulo, Power, Sin and Absolute live on the same card.',
        build: () => {
            const b = exampleBuilder('math.op')
            b.place('value.number', 'a', 0, 0, { label: 'Number A · 0.4', values: { value: 0.4 } })
            b.place('value.number', 'b', 0, 1, { label: 'Number B · 1.5', values: { value: 1.5 } })
            b.place('math.op', 'gain', 1, 0, { label: 'Multiply', values: { operation: 'multiply' } })
            b.place('geom.sphere', 'ball', 2, 0, { label: 'Sphere' })
            b.link('a', 'out', 'gain', 'a')
            b.link('b', 'out', 'gain', 'b')
            b.link('gain', 'out', 'ball', 'radius')
            return b.result()
        },
        expect: [computed('out', 'number', 0)]
    },
    {
        typeId: 'math.mix',
        title: 'Mix',
        story: 'Crossfades two colours by Factor — wired ports lerp correctly; typed straight into the inspector as text, the same port hard-switches at 0.5 instead (a documented defect, not shown here).',
        build: () => {
            const b = exampleBuilder('math.mix')
            b.place('value.color', 'a', 0, 0, { label: 'Colour A · cyan', values: { value: '#4df9ff' } })
            b.place('value.color', 'b', 0, 1, { label: 'Colour B · magenta', values: { value: '#ff4dd8' } })
            b.place('math.mix', 'blend', 1, 0, { label: 'Mix', values: { t: 0.5 } })
            b.place('geom.cube', 'box', 2, 0, { label: 'Cube' })
            b.link('a', 'out', 'blend', 'a')
            b.link('b', 'out', 'blend', 'b')
            b.link('blend', 'out', 'box', 'color')
            return b.result()
        },
        expect: [computed('out', 'color', 0)]
    },
    {
        typeId: 'math.clamp',
        title: 'Clamp',
        story: 'Keeps a number inside Min..Max — a Number well above 1 is clamped to 1 before it reaches a Sphere\'s radius.',
        build: () => {
            const b = exampleBuilder('math.clamp')
            b.place('value.number', 'raw', 0, 0, { label: 'Number · 1.8', values: { value: 1.8 } })
            b.place('math.clamp', 'clamp', 1, 0, { label: 'Clamp', values: { min: 0, max: 1 } })
            b.place('geom.sphere', 'ball', 2, 0, { label: 'Sphere' })
            b.link('raw', 'out', 'clamp', 'in')
            b.link('clamp', 'out', 'ball', 'radius')
            return b.result()
        },
        expect: [computed('out', 'number', 0)]
    },
    {
        typeId: 'logic.compare',
        title: 'Compare',
        story: 'Watches two numbers and answers Less/Equal/Greater as three lamps — here Greater drives whether the floor grid shows.',
        build: () => {
            const b = exampleBuilder('logic.compare')
            b.place('value.number', 'a', 0, 0, { label: 'Number A · 0.7', values: { value: 0.7 } })
            b.place('value.number', 'b', 0, 1, { label: 'Number B · 0.5', values: { value: 0.5 } })
            b.place('logic.compare', 'cmp', 1, 0, { label: 'Compare' })
            b.place('world.grid', 'grid', 2, 0, { label: 'Grid' })
            b.link('a', 'out', 'cmp', 'a')
            b.link('b', 'out', 'cmp', 'b')
            b.link('cmp', 'greater', 'grid', 'visible')
            return b.result()
        },
        expect: [
            computed('less', 'boolean', 0),
            computed('equal', 'boolean', 0),
            computed('greater', 'boolean', 0)
        ]
    },
    {
        typeId: 'logic.route',
        title: 'Route',
        story: 'One card, an operation menu — set to Switch here, Pick chooses between two colours for a Cube. Set to Gate, the same card passes a value through only while Open.',
        build: () => {
            const b = exampleBuilder('logic.route')
            b.place('value.color', 'a', 0, 0, { label: 'Colour A', values: { value: '#4df9ff' } })
            b.place('value.color', 'b', 0, 1, { label: 'Colour B', values: { value: '#ff4dd8' } })
            b.place('value.boolean', 'pick', 0, 2, { label: 'Boolean · pick', values: { value: true } })
            b.place('logic.route', 'route', 1, 0, { label: 'Switch', values: { operation: 'switch' } })
            b.place('geom.cube', 'box', 2, 0, { label: 'Cube' })
            b.link('a', 'out', 'route', 'a')
            b.link('b', 'out', 'route', 'b')
            b.link('pick', 'out', 'route', 'pick')
            b.link('route', 'out', 'box', 'color')
            return b.result()
        },
        expect: [computed('out', 'color', 0)]
    },
    {
        typeId: 'signal.lag',
        title: 'Lag',
        story: 'Chases a target instead of jumping to it — a Number that steps from 0 to 1 arrives at the Sphere\'s radius gradually, over the Lag time.',
        build: () => {
            const b = exampleBuilder('signal.lag')
            b.place('value.number', 'target', 0, 0, { label: 'Number · target', values: { value: 0 } })
            b.place('signal.lag', 'glide', 1, 0, { label: 'Lag', values: { lag: 0.5 } })
            b.place('geom.sphere', 'ball', 2, 0, { label: 'Sphere' })
            b.link('target', 'out', 'glide', 'in')
            b.link('glide', 'out', 'ball', 'radius')
            return b.result()
        },
        expect: [
            edgeCheck('out', 'number', { before: { value: 0 }, after: { value: 1 }, atBefore: 0, atAfter: 300 })
        ]
    },
    {
        typeId: 'value.noise',
        title: 'Noise',
        story: 'A smooth wander -1..1 over the document clock — every window sees the same drift, driving a lamp\'s intensity here.',
        build: () => {
            const b = exampleBuilder('value.noise')
            b.place('value.noise', 'wander', 0, 0, { label: 'Noise', values: { speed: 1, variant: 2 } })
            b.place('light.point', 'lamp', 1, 0, { label: 'Light' })
            b.link('wander', 'out', 'lamp', 'intensity')
            return b.result()
        },
        expect: [computed('out', 'number', 0), computed('out', 'number', 1500)]
    },
    {
        typeId: 'math.range',
        title: 'Range',
        story: 'Remaps a number from one span into another — a Number measured 0..100 answers 0..1 at a Sphere\'s radius.',
        build: () => {
            const b = exampleBuilder('math.range')
            b.place('value.number', 'raw', 0, 0, { label: 'Number · 50', values: { value: 50 } })
            b.place('math.range', 'remap', 1, 0, {
                label: 'Range',
                values: { inMin: 0, inMax: 100, outMin: 0, outMax: 1 }
            })
            b.place('geom.sphere', 'ball', 2, 0, { label: 'Sphere' })
            b.link('raw', 'out', 'remap', 'in')
            b.link('remap', 'out', 'ball', 'radius')
            return b.result()
        },
        expect: [computed('out', 'number', 0)]
    },
    {
        typeId: 'signal.lfo',
        title: 'Oscillator',
        story: 'Four waveforms of one phase, all -1..1 — the Triangle output here drives a lamp\'s intensity up and down every second.',
        build: () => {
            const b = exampleBuilder('signal.lfo')
            b.place('signal.lfo', 'wave', 0, 0, { label: 'Oscillator', values: { frequency: 1 } })
            b.place('math.range', 'remap', 1, 0, { label: 'Range', values: { inMin: -1, inMax: 1, outMin: 0.2, outMax: 2 } })
            b.place('light.point', 'lamp', 2, 0, { label: 'Light' })
            b.link('wave', 'triangle', 'remap', 'in')
            b.link('remap', 'out', 'lamp', 'intensity')
            return b.result()
        },
        expect: [
            computed('sine', 'number', 0),
            computed('square', 'number', 0),
            computed('triangle', 'number', 500),
            computed('saw', 'number', 500)
        ]
    },
    {
        typeId: 'logic.combine',
        title: 'Logic',
        story: 'Two booleans, four verdicts in plain words — Either drives whether the floor grid shows here.',
        build: () => {
            const b = exampleBuilder('logic.combine')
            b.place('value.boolean', 'a', 0, 0, { label: 'Boolean A · true', values: { value: true } })
            b.place('value.boolean', 'b', 0, 1, { label: 'Boolean B · false', values: { value: false } })
            b.place('logic.combine', 'logic', 1, 0, { label: 'Logic' })
            b.place('world.grid', 'grid', 2, 0, { label: 'Grid' })
            b.link('a', 'out', 'logic', 'a')
            b.link('b', 'out', 'logic', 'b')
            b.link('logic', 'either', 'grid', 'visible')
            return b.result()
        },
        expect: [
            computed('both', 'boolean', 0),
            computed('either', 'boolean', 0),
            computed('one', 'boolean', 0),
            computed('neither', 'boolean', 0)
        ]
    },
    {
        typeId: 'math.extremes',
        title: 'Extremes',
        story: 'Answers the Least and Greatest of two numbers at once — Greatest sets a Sphere\'s radius here.',
        build: () => {
            const b = exampleBuilder('math.extremes')
            b.place('value.number', 'a', 0, 0, { label: 'Number A · 0.3', values: { value: 0.3 } })
            b.place('value.number', 'b', 0, 1, { label: 'Number B · 0.9', values: { value: 0.9 } })
            b.place('math.extremes', 'extremes', 1, 0, { label: 'Extremes' })
            b.place('geom.sphere', 'ball', 2, 0, { label: 'Sphere' })
            b.link('a', 'out', 'extremes', 'a')
            b.link('b', 'out', 'extremes', 'b')
            b.link('extremes', 'greatest', 'ball', 'radius')
            return b.result()
        },
        expect: [computed('least', 'number', 0), computed('greatest', 'number', 0)]
    },
    {
        typeId: 'math.round',
        title: 'Round',
        story: 'Nearest, Floor and Ceiling of one number at once — Round quantises a Number into whole steps at a light\'s intensity.',
        build: () => {
            const b = exampleBuilder('math.round')
            b.place('value.number', 'raw', 0, 0, { label: 'Number · 1.6', values: { value: 1.6 } })
            b.place('math.round', 'snap', 1, 0, { label: 'Round' })
            b.place('light.point', 'lamp', 2, 0, { label: 'Light' })
            b.link('raw', 'out', 'snap', 'in')
            b.link('snap', 'round', 'lamp', 'intensity')
            return b.result()
        },
        expect: [
            computed('round', 'number', 0),
            computed('floor', 'number', 0),
            computed('ceiling', 'number', 0)
        ]
    },
    {
        typeId: 'signal.ease',
        title: 'Ease',
        story: 'Shapes a 0..1 progress with intent — Smooth softens a Number into a Sphere\'s radius; Ease In, Ease Out and Bounce answer on the same card.',
        build: () => {
            const b = exampleBuilder('signal.ease')
            b.place('value.number', 'progress', 0, 0, { label: 'Number · progress', values: { value: 0.4 } })
            b.place('signal.ease', 'ease', 1, 0, { label: 'Ease' })
            b.place('geom.sphere', 'ball', 2, 0, { label: 'Sphere' })
            b.link('progress', 'out', 'ease', 'in')
            b.link('ease', 'smooth', 'ball', 'radius')
            return b.result()
        },
        expect: [
            computed('smooth', 'number', 0),
            computed('easeIn', 'number', 0),
            computed('easeOut', 'number', 0),
            computed('bounce', 'number', 0)
        ]
    },
    {
        typeId: 'signal.counter',
        title: 'Counter',
        story: 'Counts rising edges of Count — a Button\'s presses tally here, feeding a Sphere\'s radius one step at a time.',
        build: () => {
            const b = exampleBuilder('signal.counter')
            b.place('value.boolean', 'count', 0, 0, { label: 'Boolean · count' })
            b.place('signal.counter', 'tally', 1, 0, { label: 'Counter', values: { step: 1 } })
            b.place('geom.sphere', 'ball', 2, 0, { label: 'Sphere' })
            b.link('count', 'out', 'tally', 'count')
            b.link('tally', 'out', 'ball', 'radius')
            return b.result()
        },
        expect: [
            edgeCheck('out', 'number', { before: { count: false }, after: { count: true }, atBefore: 0, atAfter: 16 })
        ]
    },
    {
        typeId: 'signal.hold',
        title: 'Hold',
        story: 'Sample-and-hold: freezes Value on each rising edge of Sample — here it captures a Number the instant a Boolean flips.',
        build: () => {
            const b = exampleBuilder('signal.hold')
            b.place('value.number', 'value', 0, 0, { label: 'Number · 0.7', values: { value: 0.7 } })
            b.place('value.boolean', 'sample', 0, 1, { label: 'Boolean · sample' })
            b.place('signal.hold', 'held', 1, 0, { label: 'Hold' })
            b.place('geom.sphere', 'ball', 2, 0, { label: 'Sphere' })
            b.link('value', 'out', 'held', 'value')
            b.link('sample', 'out', 'held', 'sample')
            b.link('held', 'out', 'ball', 'radius')
            return b.result()
        },
        expect: [
            edgeCheck('out', 'number', { before: { sample: false }, after: { sample: true }, atBefore: 0, atAfter: 16 })
        ]
    },
    {
        typeId: 'signal.delay',
        title: 'Delay',
        story: 'Answers what Value was Delay seconds ago — a young Delay is late, never silent, so a Sphere still gets a radius from the first instant.',
        build: () => {
            const b = exampleBuilder('signal.delay')
            b.place('value.number', 'value', 0, 0, { label: 'Number · 0.6', values: { value: 0.6 } })
            b.place('signal.delay', 'later', 1, 0, { label: 'Delay', values: { delay: 0.5 } })
            b.place('geom.sphere', 'ball', 2, 0, { label: 'Sphere' })
            b.link('value', 'out', 'later', 'value')
            b.link('later', 'out', 'ball', 'radius')
            return b.result()
        },
        expect: [
            edgeCheck('out', 'number', { before: { value: 0.2 }, after: { value: 0.9 }, atBefore: 0, atAfter: 600 })
        ]
    },
    {
        typeId: 'signal.timer',
        title: 'Timer',
        story: 'A cued stopwatch — a rising edge on Start begins it, Progress climbs 0..1 over Length, driving a lamp\'s intensity.',
        build: () => {
            const b = exampleBuilder('signal.timer')
            b.place('value.boolean', 'start', 0, 0, { label: 'Boolean · start' })
            b.place('signal.timer', 'clock', 1, 0, { label: 'Timer', values: { length: 5 } })
            b.place('light.point', 'lamp', 2, 0, { label: 'Light' })
            b.link('start', 'out', 'clock', 'start')
            b.link('clock', 'progress', 'lamp', 'intensity')
            return b.result()
        },
        expect: [
            edgeCheck('elapsed', 'number', { before: { start: false }, after: { start: true }, atBefore: 0, atAfter: 1500 }),
            edgeCheck('done', 'boolean', { before: { start: false }, after: { start: true }, atBefore: 0, atAfter: 1500 })
        ]
    },
    {
        typeId: 'signal.trigger',
        title: 'Trigger',
        story: 'Shapes a firing into an attack-hold-release envelope, 0 to 1 and back — a Button re-fires it, driving a lamp\'s intensity.',
        build: () => {
            const b = exampleBuilder('signal.trigger')
            b.place('value.boolean', 'fire', 0, 0, { label: 'Boolean · fire' })
            b.place('signal.trigger', 'envelope', 1, 0, { label: 'Trigger' })
            b.place('light.point', 'lamp', 2, 0, { label: 'Light' })
            b.link('fire', 'out', 'envelope', 'fire')
            b.link('envelope', 'out', 'lamp', 'intensity')
            return b.result()
        },
        expect: [
            edgeCheck('out', 'number', { before: { fire: false }, after: { fire: true }, atBefore: 0, atAfter: 16 })
        ]
    },
    {
        typeId: 'signal.speed',
        title: 'Speed',
        story: 'Integrates a Rate over the clock into a running total — turns "how fast" into "how far", driving a Cube along one axis (via Combine, in the Vector Combine example).',
        build: () => {
            const b = exampleBuilder('signal.speed')
            b.place('value.number', 'rate', 0, 0, { label: 'Number · rate', values: { value: 0.4 } })
            b.place('signal.speed', 'travel', 1, 0, { label: 'Speed' })
            b.place('light.point', 'lamp', 2, 0, { label: 'Light' })
            b.link('rate', 'out', 'travel', 'rate')
            b.link('travel', 'out', 'lamp', 'intensity')
            return b.result()
        },
        expect: [
            edgeCheck('out', 'number', { before: {}, after: {}, atBefore: 0, atAfter: 500 })
        ]
    },
    {
        typeId: 'logic.toggle',
        title: 'Toggle',
        story: 'A latch: each rising edge on Flip inverts it — a light switch, not a held button — wired here into the floor grid\'s visibility.',
        build: () => {
            const b = exampleBuilder('logic.toggle')
            b.place('value.boolean', 'flip', 0, 0, { label: 'Boolean · flip' })
            b.place('logic.toggle', 'latch', 1, 0, { label: 'Toggle' })
            b.place('world.grid', 'grid', 2, 0, { label: 'Grid' })
            b.link('flip', 'out', 'latch', 'flip')
            b.link('latch', 'out', 'grid', 'visible')
            return b.result()
        },
        expect: [
            edgeCheck('out', 'boolean', { before: { flip: false }, after: { flip: true }, atBefore: 0, atAfter: 16 })
        ]
    },
    {
        typeId: 'vector.split',
        title: 'Split',
        story: 'Opens a vector into its three numbers — just the height (Y) drives a lamp\'s intensity here.',
        build: () => {
            const b = exampleBuilder('vector.split')
            b.place('value.vec3', 'vec', 0, 0, { label: 'Vector · [1,2,3]', values: { value: [1, 2, 3] } })
            b.place('vector.split', 'split', 1, 0, { label: 'Split' })
            b.place('light.point', 'lamp', 2, 0, { label: 'Light' })
            b.link('vec', 'out', 'split', 'vector')
            b.link('split', 'y', 'lamp', 'intensity')
            return b.result()
        },
        expect: [
            computed('x', 'number', 0),
            computed('y', 'number', 0),
            computed('z', 'number', 0)
        ]
    },
    {
        typeId: 'vector.combine',
        title: 'Combine',
        story: 'Packs three numbers into one vector — wired into a Cube\'s Position so it stands where X, Y and Z say.',
        build: () => {
            const b = exampleBuilder('vector.combine')
            b.place('value.number', 'x', 0, 0, { label: 'Number X · 1', values: { value: 1 } })
            b.place('value.number', 'y', 0, 1, { label: 'Number Y · 0.5', values: { value: 0.5 } })
            b.place('value.number', 'z', 0, 2, { label: 'Number Z · -1', values: { value: -1 } })
            b.place('vector.combine', 'combine', 1, 0, { label: 'Combine' })
            b.place('geom.cube', 'box', 2, 0, { label: 'Cube' })
            b.link('x', 'out', 'combine', 'x')
            b.link('y', 'out', 'combine', 'y')
            b.link('z', 'out', 'combine', 'z')
            b.link('combine', 'out', 'box', 'position')
            return b.result()
        },
        expect: [computed('out', 'vec3', 0)]
    },
    {
        typeId: 'colour.split',
        title: 'Channels',
        story: 'Opens a colour into Red/Green/Blue and Hue/Saturation/Lightness at once — Red drives a lamp\'s intensity here.',
        build: () => {
            const b = exampleBuilder('colour.split')
            b.place('value.color', 'colour', 0, 0, { label: 'Colour · red', values: { value: '#ff0000' } })
            b.place('colour.split', 'channels', 1, 0, { label: 'Channels' })
            b.place('light.point', 'lamp', 2, 0, { label: 'Light' })
            b.link('colour', 'out', 'channels', 'colour')
            b.link('channels', 'red', 'lamp', 'intensity')
            return b.result()
        },
        expect: [
            computed('red', 'number', 0),
            computed('green', 'number', 0),
            computed('blue', 'number', 0),
            computed('hue', 'number', 0),
            computed('saturation', 'number', 0),
            computed('lightness', 'number', 0)
        ]
    },
    {
        typeId: 'colour.combine',
        title: 'Compose',
        story: 'Builds a colour from Red, Green and Blue (0..1 each) — wired into a Cube so it wears exactly that colour.',
        build: () => {
            const b = exampleBuilder('colour.combine')
            b.place('value.number', 'r', 0, 0, { label: 'Number R · 0.9', values: { value: 0.9 } })
            b.place('value.number', 'g', 0, 1, { label: 'Number G · 0.3', values: { value: 0.3 } })
            b.place('value.number', 'bl', 0, 2, { label: 'Number B · 0.1', values: { value: 0.1 } })
            b.place('colour.combine', 'compose', 1, 0, { label: 'Compose' })
            b.place('geom.cube', 'box', 2, 0, { label: 'Cube' })
            b.link('r', 'out', 'compose', 'red')
            b.link('g', 'out', 'compose', 'green')
            b.link('bl', 'out', 'compose', 'blue')
            b.link('compose', 'out', 'box', 'color')
            return b.result()
        },
        expect: [computed('out', 'color', 0)]
    },
    {
        typeId: 'vector.distance',
        title: 'Distance',
        story: 'How far apart two points stand, and how long the first one is — Distance drives a lamp\'s intensity here.',
        build: () => {
            const b = exampleBuilder('vector.distance')
            b.place('value.vec3', 'a', 0, 0, { label: 'Vector A', values: { value: [0, 0, 0] } })
            b.place('value.vec3', 'bv', 0, 1, { label: 'Vector B', values: { value: [3, 0, 4] } })
            b.place('vector.distance', 'measure', 1, 0, { label: 'Distance' })
            b.place('light.point', 'lamp', 2, 0, { label: 'Light' })
            b.link('a', 'out', 'measure', 'a')
            b.link('bv', 'out', 'measure', 'b')
            b.link('measure', 'distance', 'lamp', 'intensity')
            return b.result()
        },
        expect: [computed('distance', 'number', 0), computed('length', 'number', 0)]
    },
    {
        typeId: 'vector.dot',
        title: 'Dot',
        story: 'How much two directions agree — 1 parallel, 0 perpendicular, -1 opposed — Angle (in degrees) drives a lamp\'s intensity here.',
        build: () => {
            const b = exampleBuilder('vector.dot')
            b.place('value.vec3', 'a', 0, 0, { label: 'Vector A', values: { value: [1, 0, 0] } })
            b.place('value.vec3', 'bv', 0, 1, { label: 'Vector B', values: { value: [0, 1, 0] } })
            b.place('vector.dot', 'facing', 1, 0, { label: 'Dot' })
            b.place('light.point', 'lamp', 2, 0, { label: 'Light' })
            b.link('a', 'out', 'facing', 'a')
            b.link('bv', 'out', 'facing', 'b')
            b.link('facing', 'angle', 'lamp', 'intensity')
            return b.result()
        },
        expect: [computed('dot', 'number', 0), computed('angle', 'number', 0)]
    },
    {
        typeId: 'vector.cross',
        title: 'Cross',
        story: 'The direction perpendicular to two vectors — the surface normal when A and B are two edges of it, wired into a Cube\'s Position here.',
        build: () => {
            const b = exampleBuilder('vector.cross')
            b.place('value.vec3', 'a', 0, 0, { label: 'Vector A', values: { value: [1, 0, 0] } })
            b.place('value.vec3', 'bv', 0, 1, { label: 'Vector B', values: { value: [0, 1, 0] } })
            b.place('vector.cross', 'normal', 1, 0, { label: 'Cross' })
            b.place('geom.cube', 'box', 2, 0, { label: 'Cube' })
            b.link('a', 'out', 'normal', 'a')
            b.link('bv', 'out', 'normal', 'b')
            b.link('normal', 'out', 'box', 'position')
            return b.result()
        },
        expect: [computed('out', 'vec3', 0)]
    },
    {
        typeId: 'vector.direction',
        title: 'Direction',
        story: 'The pure direction of a vector, length 1 — a Cube\'s Position moves exactly one unit that way.',
        build: () => {
            const b = exampleBuilder('vector.direction')
            b.place('value.vec3', 'vec', 0, 0, { label: 'Vector · [3,0,4]', values: { value: [3, 0, 4] } })
            b.place('vector.direction', 'unit', 1, 0, { label: 'Direction' })
            b.place('geom.cube', 'box', 2, 0, { label: 'Cube' })
            b.link('vec', 'out', 'unit', 'vector')
            b.link('unit', 'out', 'box', 'position')
            return b.result()
        },
        expect: [computed('out', 'vec3', 0)]
    },
    {
        typeId: 'vector.rotation',
        title: 'Rotation',
        story: 'Spins a vector around an Axis by an Angle (degrees) — wired into a Cube\'s Position, tracing an orbit as Angle changes.',
        build: () => {
            const b = exampleBuilder('vector.rotation')
            b.place('value.vec3', 'vec', 0, 0, { label: 'Vector · [1,0,0]', values: { value: [1, 0, 0] } })
            b.place('value.number', 'angle', 0, 1, { label: 'Number · angle', values: { value: 45 } })
            b.place('vector.rotation', 'spin', 1, 0, { label: 'Rotation' })
            b.place('geom.cube', 'box', 2, 0, { label: 'Cube' })
            b.link('vec', 'out', 'spin', 'vector')
            b.link('angle', 'out', 'spin', 'angle')
            b.link('spin', 'out', 'box', 'position')
            return b.result()
        },
        expect: [computed('out', 'vec3', 0)]
    },
    {
        typeId: 'vector.aim',
        title: 'Aim',
        story: 'The rotation that turns a thing at From to face To — wired straight into a Cube\'s Rotation so it faces the aimed point.',
        build: () => {
            const b = exampleBuilder('vector.aim')
            b.place('value.vec3', 'from', 0, 0, { label: 'Vector · From', values: { value: [0, 0, 0] } })
            b.place('value.vec3', 'to', 0, 1, { label: 'Vector · To', values: { value: [1, 0, 1] } })
            b.place('vector.aim', 'aim', 1, 0, { label: 'Aim' })
            b.place('geom.cube', 'box', 2, 0, { label: 'Cube' })
            b.link('from', 'out', 'aim', 'from')
            b.link('to', 'out', 'aim', 'to')
            b.link('aim', 'out', 'box', 'rotation')
            return b.result()
        },
        expect: [computed('out', 'vec3', 0)]
    },
    {
        typeId: 'value.random',
        title: 'Random',
        story: 'One fixed draw between Least and Greatest per Variant — change Variant to draw again; it does NOT wander over time (that is Noise). Wired into a Sphere\'s radius.',
        build: () => {
            const b = exampleBuilder('value.random')
            b.place('value.number', 'least', 0, 0, { label: 'Number · least', values: { value: 0.3 } })
            b.place('value.number', 'greatest', 0, 1, { label: 'Number · greatest', values: { value: 1.2 } })
            b.place('value.random', 'draw', 1, 0, { label: 'Random', values: { variant: 3 } })
            b.place('geom.sphere', 'ball', 2, 0, { label: 'Sphere' })
            b.link('least', 'out', 'draw', 'least')
            b.link('greatest', 'out', 'draw', 'greatest')
            b.link('draw', 'out', 'ball', 'radius')
            return b.result()
        },
        expect: [computed('out', 'number', 0), computed('out', 'number', 500)]
    },
    {
        typeId: 'colour.ramp',
        title: 'Ramp',
        story: 'A three-stop gradient read at Position — 0 is A, half is B, 1 is C — wired into a Cube\'s colour so it reads a journey along the ramp.',
        build: () => {
            const b = exampleBuilder('colour.ramp')
            b.place('value.number', 'position', 0, 0, { label: 'Number · position', values: { value: 0.5 } })
            b.place('colour.ramp', 'ramp', 1, 0, {
                label: 'Ramp',
                values: { a: '#0a0e16', b: '#5fa8ff', c: '#ffffff' }
            })
            b.place('geom.cube', 'box', 2, 0, { label: 'Cube' })
            b.link('position', 'out', 'ramp', 'position')
            b.link('ramp', 'out', 'box', 'color')
            return b.result()
        },
        expect: [computed('out', 'color', 0)]
    }
]
