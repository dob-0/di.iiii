// What the Monitor knows about (to do, rules, skills, hooks, the agents' helpers) as map nodes, joined to the
// machine (or chat) they come from. Pure: monitorKnowledge(snap) + the server's map in, one { nodes, edges } out.
// Nothing here is drawn: the layout, 2D, 3D and List read the new kinds like any other.

import { hostsOf } from './monitorKnowledge.js'

export const KNOWLEDGE_PARTS = [['todo', 'To do'], ['rules', 'Rules'], ['skills', 'Skills'], ['hooks', 'Hooks']]
// more helpers than this under one machine fold into one node, like spaces do (monitorMapGroups.js FOLD_OVER)
export const HELPER_FOLD = 8

const list = (v) => (Array.isArray(v) ? v : [])
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// the second line of a skills card: the two biggest scopes (a card is 160 px wide), e.g. "12 user · 5 repo"
const scopeText = (counts) => Object.entries(counts || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${n} ${k}`).join(' · ')

const partNode = (host, part, title, panel, ask) => {
    const id = `know:${host}:${part}`
    if (ask) return { id, kind: 'knowledge', part, label: `${title} ${ask.open}`, state: ask.open ? 'ok' : 'off', sub: `${ask.open} of ${ask.count} open`, count: ask.count }
    if (!panel) return null
    if (panel.ok === false) return { id, kind: 'knowledge', part, label: `${title} ?`, state: 'warn', sub: 'could not be read', count: 0 }
    const count = panel.count ?? list(panel.rows).length
    const sub = part === 'skills' ? scopeText(panel.counts) : part === 'hooks' ? plural(Object.keys(panel.events || {}).length, 'event', 'events') : null
    return { id, kind: 'knowledge', part, label: `${title} ${count}`, state: 'ok', sub: sub || `this machine`, count }
}

/**
 * Extra nodes and edges for one snapshot.
 * @param {object} map the server's { nodes, edges } (only its machine and agent ids are read)
 * @param {object} knowledge monitorKnowledge(snap)
 * @param {object} snap the snapshot (for the machines that reported)
 */
export const knowledgeNodes = (map, knowledge, snap) => {
    const have = new Set(list(map?.nodes).map((n) => n && n.id))
    const nodes = []
    const edges = []
    const hosts = hostsOf(snap).filter((h) => have.has(`machine:${h.host}`))
    // the ledger lives on one machine: its To do hangs on the first host only, never repeated; with no ledger
    // on hand, the messages spooled for it are the to do, on the machine that holds them
    const ledger = knowledge?.rows?.count ? knowledge.rows : null
    const waiting = !ledger && knowledge?.waiting?.count ? knowledge.waiting : null
    const todoHost = ledger ? hosts[0]?.host : waiting ? (hosts.find((h) => list(waiting.hosts).includes(h.host)) || hosts[0])?.host : null
    hosts.forEach(({ host, panels }) => {
        const machine = `machine:${host}`
        const todo = host !== todoHost ? null : ledger ? partNode(host, 'todo', 'To do', null, ledger)
            : { id: `know:${host}:todo`, kind: 'knowledge', part: 'todo', label: `To do ${waiting.count}`, state: 'ok', sub: 'waiting', count: waiting.count }
        const parts = [
            todo,
            partNode(host, 'rules', 'Rules', panels.rules),
            partNode(host, 'skills', 'Skills', panels.skills),
            partNode(host, 'hooks', 'Hooks', panels.hooks)
        ].filter(Boolean)
        for (const n of parts) { nodes.push(n); edges.push({ from: machine, to: n.id, kind: 'has' }) }
    })
    // helpers hang on their chat when the map has it, else on the machine
    const byHost = new Map()
    for (const h of list(knowledge?.agents?.helpers)) {
        if (!have.has(`machine:${h.host}`)) continue
        if (!byHost.has(h.host)) byHost.set(h.host, [])
        byHost.get(h.host).push(h)
    }
    for (const [host, helpers] of byHost) {
        const machine = `machine:${host}`
        if (helpers.length > HELPER_FOLD) {
            const id = `helper:${host}:all`
            const busy = helpers.filter((h) => h.busy).length
            nodes.push({ id, kind: 'helper', label: `${helpers.length} helpers`, state: busy ? 'ok' : 'off', sub: `${busy} busy`, count: helpers.length })
            edges.push({ from: machine, to: id, kind: 'helps' })
            continue
        }
        helpers.forEach((h, i) => {
            const id = `helper:${host}:${h.parent || 'none'}:${i}`
            nodes.push({ id, kind: 'helper', label: h.label || h.type || 'helper', state: h.busy ? 'ok' : 'off', sub: h.busy ? 'helper · busy' : 'helper · done', count: 1 })
            const chat = h.parent ? list(map?.nodes).find((n) => n && n.kind === 'agent' && n.id.startsWith(`agent:${host}:${h.parent}`)) : null
            edges.push({ from: chat ? chat.id : machine, to: id, kind: 'helps' })
        })
    }
    return { nodes, edges }
}

/** The server's map plus the knowledge nodes, ready for groupMap. */
export const mergeKnowledge = (map, knowledge, snap) => {
    if (!knowledge) return map
    const extra = knowledgeNodes(map, knowledge, snap)
    if (!extra.nodes.length) return map
    return { nodes: [...list(map?.nodes), ...extra.nodes], edges: [...list(map?.edges), ...extra.edges] }
}
