import { useCallback } from 'react'
import { generateId } from '../../shared/projectSchema.js'

// A list somebody manages: add, edit, delete, reorder, and move a row from
// one group to another. It exists because the alternative was a Text window
// holding a list as prose — which reads fine and cannot be maintained: to
// move one line from "core" to "would be good" you retype two paragraphs and
// hope you did not lose a line.
//
// Groups are stored as plain strings on the node rather than a fixed set,
// because the grouping IS the thinking. A gear list wants core / would be
// good; a shot list wants shot / cut; a packing list wants bag / van. Fixing
// the vocabulary here would make this node good for exactly one list.
//
// Every gesture writes one patch through onChange, which the editor turns
// into a document op — so undo works on all of it and a collaborator sees it.

const reindex = (items) => items.map((item, i) => ({ ...item, order: i }))

export default function ListPanelWindow({ node, values = null, onChange = null }) {
    const source = values ? { ...node, values } : node
    const items = Array.isArray(source.values?.items) ? source.values.items : []
    const groups = Array.isArray(source.values?.groups) && source.values.groups.length
        ? source.values.groups
        : ['List']
    const readOnly = !onChange

    const patch = useCallback((next) => onChange?.(next), [onChange])

    const setItems = useCallback((next) => patch({ items: reindex(next) }), [patch])

    const addItem = (group) => setItems([...items, { id: generateId(), text: '', group }])

    const editItem = (id, text) => setItems(items.map((it) => (it.id === id ? { ...it, text } : it)))

    const deleteItem = (id) => setItems(items.filter((it) => it.id !== id))

    const moveToGroup = (id, group) => setItems(items.map((it) => (it.id === id ? { ...it, group } : it)))

    // Up and down move a row within its OWN group. Moving it in the flat
    // array would look like nothing happened whenever the neighbour above
    // belongs to a different group — the row would not visibly move, because
    // the rendering is grouped, not flat.
    const nudge = (id, direction) => {
        const item = items.find((it) => it.id === id)
        if (!item) return
        const siblings = items.filter((it) => it.group === item.group)
        const at = siblings.findIndex((it) => it.id === id)
        const swapWith = siblings[at + direction]
        if (!swapWith) return
        const a = items.findIndex((it) => it.id === id)
        const b = items.findIndex((it) => it.id === swapWith.id)
        const next = [...items]
        next[a] = items[b]
        next[b] = items[a]
        setItems(next)
    }

    const renameGroup = (index, name) => {
        const from = groups[index]
        const nextGroups = groups.map((g, i) => (i === index ? name : g))
        // Rows carry the group by name, so a rename has to move them too or
        // the whole group silently empties.
        patch({
            groups: nextGroups,
            items: reindex(items.map((it) => (it.group === from ? { ...it, group: name } : it)))
        })
    }

    const addGroup = () => patch({ groups: [...groups, `Group ${groups.length + 1}`] })

    // Deleting a group keeps its rows — they move to the first group that
    // remains. Silently deleting somebody's list because they renamed a
    // heading is not a thing this should ever do.
    const deleteGroup = (index) => {
        if (groups.length < 2) return
        const gone = groups[index]
        const nextGroups = groups.filter((_, i) => i !== index)
        patch({
            groups: nextGroups,
            items: reindex(items.map((it) => (it.group === gone ? { ...it, group: nextGroups[0] } : it)))
        })
    }

    return (
        <div className="raw-window-stack raw-list-panel">
            {groups.map((group, gi) => {
                const rows = items.filter((it) => it.group === group)
                return (
                    <section className="raw-list-group" key={`${group}-${gi}`}>
                        <header className="raw-list-group-head">
                            {readOnly ? (
                                <h4 className="raw-list-group-name">{group}</h4>
                            ) : (
                                <input
                                    className="raw-list-group-name"
                                    value={group}
                                    aria-label={`Group ${gi + 1} name`}
                                    onChange={(e) => renameGroup(gi, e.target.value)}
                                />
                            )}
                            <span className="raw-list-count">{rows.length}</span>
                            {!readOnly && groups.length > 1 && (
                                <button
                                    type="button"
                                    className="raw-list-btn"
                                    title="Remove this group — its rows move to the first one"
                                    aria-label={`Remove group ${group}`}
                                    onClick={() => deleteGroup(gi)}
                                >×</button>
                            )}
                        </header>

                        <ul className="raw-list-rows">
                            {rows.map((item, ri) => (
                                <li className="raw-list-row" key={item.id}>
                                    {readOnly ? (
                                        <span className="raw-list-text">{item.text}</span>
                                    ) : (
                                        <input
                                            className="raw-list-text"
                                            value={item.text}
                                            placeholder="What is it?"
                                            aria-label={`Item ${ri + 1} in ${group}`}
                                            onChange={(e) => editItem(item.id, e.target.value)}
                                        />
                                    )}
                                    {!readOnly && (
                                        <div className="raw-list-row-controls">
                                            <button type="button" className="raw-list-btn" aria-label="Move up"
                                                disabled={ri === 0} onClick={() => nudge(item.id, -1)}>↑</button>
                                            <button type="button" className="raw-list-btn" aria-label="Move down"
                                                disabled={ri === rows.length - 1} onClick={() => nudge(item.id, 1)}>↓</button>
                                            <select
                                                className="raw-list-move"
                                                value={group}
                                                aria-label={`Group of ${item.text || 'this item'}`}
                                                onChange={(e) => moveToGroup(item.id, e.target.value)}
                                            >
                                                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                            <button type="button" className="raw-list-btn is-danger" aria-label="Delete"
                                                onClick={() => deleteItem(item.id)}>×</button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>

                        {!readOnly && (
                            <button type="button" className="raw-list-add" onClick={() => addItem(group)}>
                                + Add to {group}
                            </button>
                        )}
                    </section>
                )
            })}

            {!readOnly && (
                <button type="button" className="raw-list-add is-group" onClick={addGroup}>+ Add a group</button>
            )}
        </div>
    )
}
