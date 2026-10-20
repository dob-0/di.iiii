// A list as wire values: its rows, one per line, in the order a person reads
// them (group by group, as the window draws them — ListPanelWindow.jsx), and
// how many there are. Empty rows are left out: they are places to type, not
// things the list says. Rows whose group no longer exists are read last, so
// nothing written is lost on the wire.
export const readListRows = (values = {}) => {
    const groups = Array.isArray(values.groups) ? values.groups : []
    const items = (Array.isArray(values.items) ? values.items : [])
        .filter((item) => String(item?.text ?? '').trim() !== '')
    const known = new Set(groups)
    return [
        ...groups.flatMap((group) => items.filter((item) => item.group === group)),
        ...items.filter((item) => !known.has(item.group)),
    ]
}

export const computeOutput = (node, portId) => {
    if (portId === 'text') return readListRows(node.values).map((item) => String(item.text).trim()).join('\n')
    if (portId === 'count') return readListRows(node.values).length
    return undefined
}
