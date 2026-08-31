import { describe, expect, it } from 'vitest'
import { createNode } from '../nodeRegistry.js'
import { deriveNodeInspectorSections } from './nodeInspectorSections.js'

describe('deriveNodeInspectorSections', () => {
    it('includes the node.null body textarea before dynamic input ports', () => {
        const node = createNode('node.null', {
            values: {
                body: 'hello world',
                portDefs: [
                    { dir: 'in', id: 'title', type: 'string', label: 'Title' },
                    { dir: 'out', id: 'result', type: 'number', label: 'Result' }
                ]
            }
        })

        const sections = deriveNodeInspectorSections(node)
        expect(sections[0].fields.map((field) => field.label)).toEqual(['Body', 'Title'])
        expect(sections[0].fields[0]).toMatchObject({ path: ['body'], type: 'textarea' })
    })

    it('keeps regular node ports for standard node types', () => {
        const node = createNode('geom.cube')
        const sections = deriveNodeInspectorSections(node)
        expect(sections[0].fields.map((field) => field.label)).toContain('Colour')
        expect(sections[0].fields.map((field) => field.label)).not.toContain('Body')
    })

    it('treats the view.image source as an asset picker', () => {
        const node = createNode('view.image')
        const sections = deriveNodeInspectorSections(node)
        const srcField = sections[0].fields.find((field) => field.label === 'Source')
        expect(srcField).toMatchObject({ path: ['src'], type: 'asset', assetKind: 'image' })
    })

    it('exposes a synthetic value field for value/source nodes with no inputs', () => {
        const colorNode = createNode('value.color')
        const colorSections = deriveNodeInspectorSections(colorNode)
        const colorField = colorSections[0].fields.find((f) => f.path[0] === 'value')
        expect(colorField).toBeDefined()
        expect(colorField.type).toBe('color')

        const numberNode = createNode('value.number')
        const numberSections = deriveNodeInspectorSections(numberNode)
        const numberField = numberSections[0].fields.find((f) => f.path[0] === 'value')
        expect(numberField).toBeDefined()
        expect(numberField.type).toBe('number')
    })

    // Regression tests for audit finding #19: these node types store real
    // user-facing config in defaultValues (OSC target IP/port, PTZ OSC
    // address, RTMP destination, recording filename pattern) that was never
    // exposed as an inspector field at all — only fields backed by a real
    // port showed up, so users had no way to edit these settings from the
    // UI. hostHint is deliberately excluded (an internal/documentation hint,
    // not user config) — these tests also confirm it stays absent.
    it('exposes device.ptz.osc\'s OSC address as an editable field', () => {
        const node = createNode('device.ptz.osc')
        const sections = deriveNodeInspectorSections(node)
        const field = sections[0].fields.find((f) => f.path[0] === 'oscAddress')
        expect(field).toMatchObject({ label: 'OSC Address', type: 'text' })
        expect(sections[0].fields.some((f) => f.path[0] === 'hostHint')).toBe(false)
    })

    it('exposes device.osc.in\'s listen port as an editable field', () => {
        const node = createNode('device.osc.in')
        const sections = deriveNodeInspectorSections(node)
        const field = sections[0].fields.find((f) => f.path[0] === 'port')
        expect(field).toMatchObject({ label: 'Listen Port', type: 'number' })
    })

    it('exposes device.osc.out\'s target host and port as editable fields', () => {
        const node = createNode('device.osc.out')
        const sections = deriveNodeInspectorSections(node)
        const hostField = sections[0].fields.find((f) => f.path[0] === 'targetHost')
        const portField = sections[0].fields.find((f) => f.path[0] === 'targetPort')
        expect(hostField).toMatchObject({ label: 'Target Host', type: 'text' })
        expect(portField).toMatchObject({ label: 'Target Port', type: 'number' })
    })

    it('exposes stream.output\'s RTMP target URL as an editable field', () => {
        const node = createNode('stream.output')
        const sections = deriveNodeInspectorSections(node)
        const field = sections[0].fields.find((f) => f.path[0] === 'target')
        expect(field).toMatchObject({ label: 'Target URL', type: 'text' })
    })

    it('exposes stream.recorder\'s file pattern as an editable field', () => {
        const node = createNode('stream.recorder')
        const sections = deriveNodeInspectorSections(node)
        const field = sections[0].fields.find((f) => f.path[0] === 'filePattern')
        expect(field).toMatchObject({ label: 'File Pattern', type: 'text' })
    })

    // Universal code panel (product decision 2026-07-19): every node type,
    // not just node.null, gets an inert "view as code" section. It's stored
    // under values.__code — a distinct key from node.null's real values.body
    // — and routes through the shared 'values' component so it reads/writes
    // the same node.values object the Ports/Node section uses, even though
    // its own section id ('code') differs for React-key/labeling purposes.
    // The section used to ship on EVERY node — a dead textarea under every
    // Cube, the UX audit's one systemic clutter generator. Now it appears
    // exactly where it is true: a node.null (code is its identity), or any
    // node actually carrying stored code. A fresh Cube shows nothing.
    it('shows the Code section only where there is code', () => {
        for (const typeId of ['geom.cube', 'value.color', 'view.image', 'device.ptz.osc']) {
            const bare = createNode(typeId)
            expect(
                deriveNodeInspectorSections(bare).find((section) => section.id === 'code'),
                `${typeId} fresh should carry no Code section`
            ).toBeUndefined()
            const carrying = createNode(typeId)
            carrying.values = { ...carrying.values, __code: 'return 1' }
            const codeSection = deriveNodeInspectorSections(carrying).find((section) => section.id === 'code')
            expect(codeSection, `${typeId} with stored code should show it`).toBeDefined()
            expect(codeSection.fields).toEqual([
                { label: 'Body', path: ['__code'], type: 'textarea', portType: 'string', component: 'values' }
            ])
        }
        // node.null keeps it unconditionally — code is that type's identity.
        const nullNode = createNode('node.null')
        expect(deriveNodeInspectorSections(nullNode).find((section) => section.id === 'code')).toBeDefined()
    })

    // Without this the `src` port falls through to a plain text field and the
    // only way to fill it is to type a sha256 by hand.
    it.each([
        ['geom.model', 'model'],
        ['media.video', 'video'],
        ['media.audio', 'audio']
    ])('gives %s an asset picker filtered to %s files', (typeId, assetKind) => {
        const sections = deriveNodeInspectorSections(createNode(typeId))
        const src = sections.find((section) => section.id === 'values')
            ?.fields.find((field) => field.path[0] === 'src')
        expect(src).toBeDefined()
        expect(src.type).toBe('asset')
        expect(src.assetKind).toBe(assetKind)
    })

        // A doorway's port type decides what its socket on the container carries.
    // Typed by hand, a typo produces a type nothing is compatible with and the
    // only symptom is a wire that silently refuses to connect.
    it.each(['port.in', 'port.out'])('%s picks its carried type from a list, not a text box', (typeId) => {
        const fields = deriveNodeInspectorSections(createNode(typeId))
            .find((section) => section.id === 'values')?.fields || []
        const portType = fields.find((field) => field.path[0] === 'portType')
        expect(portType).toBeDefined()
        expect(portType.type).toBe('select')
        expect(portType.options.map((option) => option.value)).toContain('color')
        expect(portType.options.map((option) => option.value)).toContain('vec3')
    })

    it.each(['port.in', 'port.out'])('%s can be renamed without a wire noticing', (typeId) => {
        const fields = deriveNodeInspectorSections(createNode(typeId))
            .find((section) => section.id === 'values')?.fields || []
        expect(fields.find((field) => field.path[0] === 'label')).toBeDefined()
    })

it('keeps the Code section\'s values.__code distinct from node.null\'s own values.body', () => {
        const node = createNode('node.null', { values: { body: 'the null node body', portDefs: [] } })
        const sections = deriveNodeInspectorSections(node)
        const bodySection = sections.find((section) => section.id === 'values')
        const codeSection = sections.find((section) => section.id === 'code')
        expect(bodySection.fields[0].path).toEqual(['body'])
        expect(codeSection.fields[0].path).toEqual(['__code'])
    })
})
