import { getNodeType } from '../../project/nodeRegistry.js'

const portToInspectorField = (port, node = null) => {
    const label = port.label || port.id
    const path = [port.id]
    if (node?.typeId === 'view.image' && port.id === 'src') {
        return { label, path, type: 'asset', portType: 'texture', assetKind: 'image' }
    }
    if (port.type === 'color') return { label, path, type: 'color', portType: 'color' }
    if (port.type === 'boolean') return { label, path, type: 'checkbox', portType: 'boolean' }
    if (port.type === 'number') return { label, path, type: 'number', min: port.min, max: port.max, step: port.step, portType: 'number' }
    if (port.type === 'string') {
        const isMultiline = port.id === 'body' || port.id === 'text'
        return { label, path, type: isMultiline ? 'textarea' : 'text', portType: 'string' }
    }
    if (port.type === 'vec3') return { label, path, type: 'vec3', portType: 'vec3' }
    if (port.type === 'geometry' || port.type === 'texture' || port.type === 'signal') {
        return { label, path, type: 'connection', portType: port.type }
    }
    return { label, path, type: 'text', portType: port.type || 'any' }
}

export const deriveNodeInspectorSections = (node) => {
    if (!node) return []
    const typeId = node.typeId || node.definitionId
    const type = getNodeType(typeId)
    if (!type) return []

    if (type.isNull) {
        const dynamicPorts = (node.values?.portDefs || [])
            .filter((port) => port.dir === 'in')
            .map((port) => portToInspectorField(port, node))
            .filter(Boolean)

        return [
            {
                id: 'values',
                label: 'Node',
                fields: [
                    { label: 'Body', path: ['body'], type: 'textarea', portType: 'string' },
                    ...dynamicPorts
                ]
            }
        ]
    }

    const fields = (type.inputs || []).map((port) => portToInspectorField(port, node)).filter(Boolean)

    // For value/source nodes with no inputs but an editable `value` field
    if (!fields.length && node.values !== undefined && 'value' in { ...type.defaultValues }) {
        const outType = type.outputs?.[0]?.type
        const fieldType = outType === 'color' ? 'color'
            : outType === 'number' ? 'number'
            : outType === 'vec3' ? 'vec3'
            : outType === 'boolean' ? 'checkbox'
            : 'text'
        fields.push({ label: type.label || 'Value', path: ['value'], type: fieldType, portType: outType || 'any' })
    }

    if (!fields.length) return []
    return [{ id: 'values', label: 'Ports', fields }]
}
