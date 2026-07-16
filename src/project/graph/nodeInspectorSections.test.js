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
        expect(sections).toHaveLength(1)
        expect(sections[0].fields.map((field) => field.label)).toEqual(['Body', 'Title'])
        expect(sections[0].fields[0]).toMatchObject({ path: ['body'], type: 'textarea' })
    })

    it('keeps regular node ports for standard node types', () => {
        const node = createNode('geom.cube')
        const sections = deriveNodeInspectorSections(node)
        expect(sections[0].fields.map((field) => field.label)).toContain('Color')
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
        expect(colorSections).toHaveLength(1)
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
})
