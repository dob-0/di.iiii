import { isTopType } from '../../../project/tops/topOperators.js'

// A picture operator's Runs on and Camera menus list what the space can see
// right now — the registry only knows "where the page is open" and "its
// default camera". One helper, used by the inspector AND the inside, so the
// two menus can never offer different machines.
export function withMachineOptions(node, sections, machines = []) {
    if (!isTopType(node?.typeId)) return sections
    return sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => {
            if (field.path?.[0] === 'machine') {
                return {
                    ...field,
                    options: [...(field.options || []), ...machines.map((machine) => ({ value: machine.id, label: machine.self ? `${machine.name} (this one)` : machine.name }))]
                }
            }
            if (field.path?.[0] === 'device') {
                // The cameras of the machine this operator runs on.
                const owner = machines.find((machine) => machine.id === node.values?.machine)
                    || machines.find((machine) => machine.self)
                const cameras = (owner?.devices || []).filter((device) => device.kind === 'camera')
                return { ...field, options: [...(field.options || []), ...cameras.map((device) => ({ value: device.id, label: device.label }))] }
            }
            return field
        })
    }))
}

/**
 * Where a node runs, in words — only when that is a real fact worth a chip
 * (a picture operator pinned to a machine). Everything else runs wherever
 * the page is open, which is not worth a sentence; the header shows a quiet
 * "here" instead of repeating "runs on where the page is open" on every node.
 */
export function runsOnLabel(node, machines = []) {
    if (!isTopType(node?.typeId)) return null
    const owner = machines.find((machine) => machine.id === node.values?.machine)
    return owner ? owner.name : null
}
