import { describe, expect, it } from 'vitest'
import { createNode } from '../../project/nodeRegistry.js'
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
})
