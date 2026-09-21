import { describe, expect, it } from 'vitest'
import { TOP_OPERATORS, TOP_TYPE_IDS, buildTopNodeTypes, hexToRgb01, measurePixels, resolveTopParams, runsHere, sendsOut } from './topOperators.js'
import { checkShader, orderNetwork } from './topEngine.js'
import { toTopNetwork } from './useTopNetwork.js'
import { cardHeight } from '../../raw/utils/cardGeometry.js'

const GENERATOR_IDS = ['top.noise', 'top.ramp', 'top.tint', 'top.transform', 'top.shape']

describe('picture operators', () => {
    it('evaluates every input before its reader', () => {
        const order = orderNetwork(
            [{ id: 'out' }, { id: 'level' }, { id: 'cam' }],
            [{ from: 'cam', to: 'level' }, { from: 'level', to: 'out' }]
        )
        expect(order).toEqual(['cam', 'level', 'out'])
    })

    it('treats a drawn loop as feedback, not an error — every operator still runs once', () => {
        const order = orderNetwork(
            [{ id: 'a' }, { id: 'b' }],
            [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]
        )
        expect([...order].sort()).toEqual(['a', 'b'])
    })

    it('clamps parameters to their range and fills the rest from defaults', () => {
        expect(resolveTopParams('top.feedback', { trail: 7 })).toEqual({ trail: 0.99, mode: 0 })
        expect(resolveTopParams('top.blend', { mode: '3' }).mode).toBe(3)
        expect(resolveTopParams('top.level', { invert: true }).invert).toBe(1)
    })

    it('measures a picture: brightness, how much is lit, and where', () => {
        // 4x2, bottom-up rows; only the top-right pixel lit.
        const pixels = new Uint8Array(4 * 2 * 4)
        pixels.set([255, 255, 255, 255], (1 * 4 + 3) * 4)
        const numbers = measurePixels(pixels, 4, 2, 0.5)
        expect(numbers.amount).toBeCloseTo(1 / 8)
        expect(numbers.x).toBeCloseTo(3.5 / 4)
        expect(numbers.y).toBeCloseTo(0.5 / 2)
    })

    it('becomes node types with a Picture output, settings instead of sockets, and no window', () => {
        const types = buildTopNodeTypes()
        expect(Object.keys(types)).toEqual(TOP_TYPE_IDS)
        for (const [id, type] of Object.entries(types)) {
            expect(type.render, id).toBe('hidden')
            expect(type.outputs[0], id).toEqual({ id: 'out', type: 'texture', label: 'Picture' })
            expect(type.inputs.every((port) => port.type === 'texture'), id).toBe(true)
            expect(type.configInputs.map((field) => field.id), id).toEqual(['machine', ...(TOP_OPERATORS[id].pickDevice ? ['device'] : []), ...TOP_OPERATORS[id].params.map((p) => p.name)])
        }
        expect(types['top.analyze'].outputs.map((port) => port.id)).toEqual(['out', 'brightness', 'amount', 'x', 'y'])
    })

    it('reads only picture wires out of a document', () => {
        const network = toTopNetwork({
            nodes: [
                { id: 'cam', typeId: 'top.camera', values: {} },
                { id: 'lvl', typeId: 'top.level', values: { gain: 3 } },
                { id: 'lfo', typeId: 'signal.lfo', values: {} }
            ],
            edges: [
                { fromNodeId: 'cam', fromPort: 'out', toNodeId: 'lvl', toPort: 'a' },
                { fromNodeId: 'lfo', fromPort: 'sine', toNodeId: 'lvl', toPort: 'gain' }
            ]
        })
        expect(network.nodes.map((node) => node.id)).toEqual(['cam', 'lvl'])
        expect(network.wires).toEqual([{ from: 'cam', to: 'lvl', port: 'a' }])
    })

    it('gives a picture card room for its picture without moving a single port', () => {
        const level = { typeId: 'top.level', values: {} }
        const plain = { typeId: 'math.clamp', values: {} }
        expect(cardHeight(level)).toBeGreaterThan(cardHeight({ ...level, typeId: 'math.round' }))
        expect(cardHeight(plain)).toBe(cardHeight({ ...plain }))
    })

    it('runs an operator here only when it belongs to anywhere or to this machine', () => {
        expect(runsHere({ machine: '' }, 'aylmo-id')).toBe(true)
        expect(runsHere({}, null)).toBe(true)
        expect(runsHere({ machine: 'aylmo-id' }, 'aylmo-id')).toBe(true)
        expect(runsHere({ machine: 'asuz-id' }, 'aylmo-id')).toBe(false)
        // Before this page knows which machine it is on, a pinned operator waits
        // rather than opening the wrong camera.
        expect(runsHere({ machine: 'asuz-id' }, null)).toBe(false)
    })
})

// The five generators (2026-09-20): Clouds, Gradient, Tint, Reframe, Shape.
// "Noise" and "Transform" were the TouchDesigner names asked for, but both
// labels were already spoken for elsewhere in the palette (value.noise,
// geom.transform) — one word, one meaning (docs/ai/vocabulary.md) — so the
// picture operators read as Clouds and Reframe; the type ids keep the TD
// names. src/nodeLabelVocabulary.test.js already guards every label in
// NODE_TYPES (this codebase's own words for the same fact) generically, so
// it is not repeated here.
describe('the generator wave', () => {
    it('compiles every generator\'s fragment in the same harness custom shaders use', () => {
        for (const id of GENERATOR_IDS) {
            // checkShader degrades to null (not an error) without a real
            // WebGL context — this environment has none — but it still
            // exercises the exact path a custom-shader edit is checked
            // through, and will catch a real compiler error wherever it runs
            // with a GPU (headless Chromium, a browser).
            expect(checkShader(TOP_OPERATORS[id].fragment), id).toBeNull()
        }
    })

    it('declares exactly one uniform per param, and no param without one', () => {
        for (const id of GENERATOR_IDS) {
            const operator = TOP_OPERATORS[id]
            const declared = new Set([...operator.fragment.matchAll(/uniform\s+(?:float|vec3)\s+p_(\w+)\s*;/g)].map((m) => m[1]))
            expect([...declared].sort(), id).toEqual(operator.params.map((p) => p.name).sort())
        }
    })

    it('uploads a colour param as vec3, every other param as float', () => {
        for (const id of GENERATOR_IDS) {
            const operator = TOP_OPERATORS[id]
            for (const p of operator.params) {
                const kind = p.colour ? 'vec3' : 'float'
                const re = new RegExp(`uniform\\s+${kind}\\s+p_${p.name}\\s*;`)
                expect(re.test(operator.fragment), `${id}.${p.name} should be uniform ${kind}`).toBe(true)
            }
        }
    })

    it('samples exactly the textures it declares as inputs', () => {
        for (const id of GENERATOR_IDS) {
            const operator = TOP_OPERATORS[id]
            for (const port of ['a', 'b']) {
                const reads = operator.fragment.includes(`texture2D(${port},`)
                expect(reads, `${id} texture2D(${port}, …)`).toBe(operator.inputs.includes(port))
            }
        }
    })

    it('keeps every default inside its own range', () => {
        for (const id of GENERATOR_IDS) {
            for (const p of TOP_OPERATORS[id].params) {
                if (p.colour) {
                    expect(p.value, `${id}.${p.name}`).toMatch(/^#[0-9a-f]{6}$/i)
                    continue
                }
                expect(p.value, `${id}.${p.name}`).toBeGreaterThanOrEqual(p.min)
                expect(p.value, `${id}.${p.name}`).toBeLessThanOrEqual(p.max)
            }
        }
    })

    it('never defaults a generator to white or an unlit black screen', () => {
        // Ramp's two stops and Shape's fill are the ones the task called out
        // by name — dark warm, never white, never invisible.
        expect(TOP_OPERATORS['top.ramp'].params.find((p) => p.name === 'a').value).toBe('#1a0500')
        expect(TOP_OPERATORS['top.ramp'].params.find((p) => p.name === 'b').value).toBe('#a03c00')
        expect(TOP_OPERATORS['top.shape'].params.find((p) => p.name === 'colour').value).not.toBe('#ffffff')
        expect(TOP_OPERATORS['top.shape'].params.find((p) => p.name === 'colour').value).not.toBe('#000000')
        expect(TOP_OPERATORS['top.tint'].params.find((p) => p.name === 'bright').value).toBe('#ff7a1a')
    })

    it('resolves a colour param from stored values, and falls back to the default when the value is not a hex string', () => {
        expect(resolveTopParams('top.tint', { bright: '#00ff00' }).bright).toBe('#00ff00')
        expect(resolveTopParams('top.tint', { bright: 'not-a-colour' }).bright).toBe('#ff7a1a')
        expect(resolveTopParams('top.tint', {}).bright).toBe('#ff7a1a')
        // A numeric param on the same operator still clamps as before.
        expect(resolveTopParams('top.tint', { amount: 5 }).amount).toBe(1)
    })

    it('converts a hex colour to 0..1 RGB, and never lets a bad value read as white', () => {
        expect(hexToRgb01('#ff7a1a')).toEqual([1, 122 / 255, 26 / 255])
        expect(hexToRgb01('#000000')).toEqual([0, 0, 0])
        expect(hexToRgb01('not a colour')).toEqual([0, 0, 0])
        expect(hexToRgb01(undefined)).toEqual([0, 0, 0])
    })

    it('gives Ramp\'s Gradient and Shape a Colour config field the inspector draws as a colour box', () => {
        const types = buildTopNodeTypes()
        const gradientFields = Object.fromEntries(types['top.ramp'].configInputs.map((f) => [f.id, f]))
        expect(gradientFields.a).toMatchObject({ type: 'color', label: 'Colour A' })
        expect(gradientFields.b).toMatchObject({ type: 'color', label: 'Colour B' })
        const tintFields = Object.fromEntries(types['top.tint'].configInputs.map((f) => [f.id, f]))
        expect(tintFields.dark).toMatchObject({ type: 'color' })
        expect(tintFields.bright).toMatchObject({ type: 'color' })
    })
})

describe('Send Out — a picture leaving the machine', () => {
    it('is an out-family operator with one picture in and one text parameter, the name', () => {
        const send = TOP_OPERATORS['top.send']
        expect(send.label).toBe('Send Out')
        expect(send.family).toBe('out')
        expect(send.inputs).toEqual(['a'])
        expect(send.params).toEqual([{ name: 'name', label: 'Called on the network', value: '', text: true }])
        expect(send.fragment).toBe(TOP_OPERATORS['top.out'].fragment)
        expect(sendsOut('top.send')).toBe(true)
        expect(sendsOut('top.out')).toBe(false)
    })

    it('never puts NDI in its name — NDI is what we speak, not what we are', () => {
        // The trademark terms (docs/architecture/NDI.md) let us say what the
        // operator speaks; they do not let us name a feature after it.
        for (const [id, operator] of Object.entries(TOP_OPERATORS)) {
            expect(id.toLowerCase(), id).not.toContain('ndi')
            expect(operator.label.toLowerCase(), id).not.toContain('ndi')
        }
    })

    it('keeps a text parameter a string — trimmed, capped at 200, never a number', () => {
        expect(resolveTopParams('top.send', { name: '  AYLMO (di test)  ' })).toEqual({ name: 'AYLMO (di test)' })
        expect(resolveTopParams('top.send', {})).toEqual({ name: '' })
        expect(resolveTopParams('top.send', { name: 42 })).toEqual({ name: '' })
        expect(resolveTopParams('top.send', { name: 'x'.repeat(300) }).name).toHaveLength(200)
    })

    it('declares no uniform for its text parameter, so the engine never uploads the string', () => {
        // topEngine.js uploads a parameter only when gl.getUniformLocation
        // finds `p_<name>` in the program (`if (location === null) continue`);
        // a name the fragment never declares is skipped, and a string never
        // reaches gl.uniform1f. This holds only while the fragment stays quiet.
        expect(TOP_OPERATORS['top.send'].fragment).not.toContain('p_name')
    })

    it('becomes a plain text box with the licence line and the link beside it', () => {
        // Wherever a person picks NDI in the product, the attribution and the
        // link to ndi.video must appear — a condition of naming it at all.
        const field = buildTopNodeTypes()['top.send'].configInputs.find((f) => f.id === 'name')
        expect(field).toMatchObject({ type: 'string', label: 'Called on the network', maxLength: 200 })
        expect(field.note.href).toBe('https://ndi.video')
        expect(field.note.label).toBe('ndi.video')
        expect(`${field.note.text} ${field.note.after}`).toContain('NDI® is a registered trademark of Vizrt NDI AB.')
        expect(buildTopNodeTypes()['top.send'].defaultValues.name).toBe('')
    })
})
