import { useCallback, useEffect, useMemo, useState } from 'react'
import { listServerSpaces } from '../../services/serverSpaces.js'
import { listUsers } from '../../services/usersApi.js'
import { listOpenCallApplications } from '../../services/openCallApi.js'
import { getAppVisitors } from '../../services/appVisitorsApi.js'
import { getAgentBoard, getEstateMap, hasServerApi } from '../../services/apiClient.js'

// The number or state each desk tile shows, read from the same calls the sections make (one small
// request each, all at once, a failed one leaves a dash). A tile is { value, word, tone, chips }:
// `word` is at most three words, `tone` is the state colour (default | success | warning | danger),
// `chips` are the facts the open window wears in its strip.
const DASH = '—'
const num = (value) => (Number.isFinite(value) ? value : DASH)

/** Pure: the tiles from what was fetched and what the page knows. Tested. */
export const buildTiles = ({ remote = {}, page = {}, overrides = {}, knowledge = null } = {}) => {
    const spaces = overrides.manage?.spaces ?? remote.spaces
    const users = overrides.manage?.users ?? remote.users
    const live = overrides.agents?.live ?? overrides.monitor?.live ?? remote.agentsLive
    const total = overrides.agents?.total ?? overrides.monitor?.total ?? remote.agentsTotal
    const calls = remote.calls
    const newCalls = remote.callsNew
    const programs = remote.visitors
    const entries = page.entries || []
    const errors = entries.filter((entry) => entry.level === 'error').length
    const warns = entries.filter((entry) => entry.level === 'warn' || entry.level === 'warning').length
    const switches = (page.managementButtons || []).filter((button) => button.kind === 'switch')
    const on = switches.filter((button) => button.checked).length
    const health = String(page.backendHealthStatus || '')
    const healthy = /^(ok|healthy|up|ready|connected|online)$/i.test(health)
    const liveTone = (n) => (n > 0 ? 'success' : 'default')
    const rules = knowledge?.rules?.sets?.[0]
    const hooks = knowledge?.hooks?.sets?.[0]
    const helpers = knowledge?.agents?.helpers?.length
    const asks = knowledge?.rows
    const skills = knowledge?.skills?.sets?.[0]
    const waiting = knowledge?.waiting?.count ?? knowledge?.waiting?.rows?.length ?? 0
    const openRows = Number.isFinite(asks?.open) ? asks.open + waiting : (waiting || null)
    const agentChips = [{ label: 'Live', value: num(live), tone: liveTone(live) }, { label: 'Sessions', value: num(total) }]
    if (Number.isFinite(helpers)) agentChips.push({ label: 'Helpers', value: helpers })
    return {
        rules: { value: num(rules?.count), word: 'Rules', tone: 'default', chips: [{ label: 'Rules', value: num(rules?.count) }, { label: 'Machines', value: rules?.same ?? DASH }] },
        hooks: { value: num(hooks?.count), word: 'Hooks', tone: 'default', chips: [{ label: 'Hooks', value: num(hooks?.count) }, { label: 'Events', value: hooks ? Object.keys(hooks.events || {}).length : DASH }] },
        skills: { value: num(skills?.count), word: 'Skills', tone: 'default', chips: [{ label: 'Skills', value: num(skills?.count) }, { label: 'Machines', value: skills?.same ?? DASH }] },
        requests: { value: num(openRows), word: 'Open rows', tone: openRows > 0 ? 'warning' : 'default', chips: [{ label: 'Open', value: num(asks?.open) }, { label: 'Waiting', value: num(waiting) }] },
        manage: { value: num(spaces), word: 'Spaces', tone: 'default', chips: [{ label: 'Spaces', value: num(spaces) }, { label: 'Users', value: num(users) }] },
        opencall: { value: num(calls), word: 'Applications', tone: newCalls > 0 ? 'warning' : 'default', chips: [{ label: 'Total', value: num(calls) }, { label: 'New', value: num(newCalls), tone: newCalls > 0 ? 'warning' : 'default' }] },
        monitor: { value: num(live), word: 'Live', tone: liveTone(live), chips: [{ label: 'Live', value: num(live), tone: liveTone(live) }, { label: 'Sessions', value: num(total) }] },
        agents: { value: num(live), word: 'Live chats', tone: liveTone(live), chips: agentChips },
        visitors: { value: num(programs), word: 'Programs', tone: 'default', chips: [{ label: 'Programs', value: num(programs) }] },
        overview: { value: page.connected ? 'On' : 'Off', word: 'Live link', tone: page.connected ? 'success' : 'warning', chips: [{ label: 'Live link', value: page.connected ? 'On' : 'Off', tone: page.connected ? 'success' : 'warning' }] },
        inspect: { value: num(page.objectCount), word: 'Objects', tone: 'default', chips: [{ label: 'Objects', value: num(page.objectCount) }, { label: 'People', value: num(page.people) }] },
        system: { value: switches.length ? `${on}/${switches.length}` : DASH, word: 'Switches on', tone: 'default', chips: [{ label: 'On', value: on }] },
        log: { value: entries.length, word: errors ? 'Errors' : 'Entries', tone: errors ? 'danger' : warns ? 'warning' : 'default', chips: [{ label: 'Entries', value: entries.length }, { label: 'Errors', value: errors, tone: errors ? 'danger' : 'default' }] },
        build: { value: health || DASH, word: 'Backend', tone: healthy ? 'success' : health ? 'warning' : 'default', chips: [{ label: 'Backend', value: health || DASH, tone: healthy ? 'success' : 'default' }] },
        estate: { value: remote.estate === 'ready' ? 'Ready' : DASH, word: 'Atlas map', tone: remote.estate === 'ready' ? 'success' : 'default', chips: [{ label: 'Map', value: remote.estate === 'ready' ? 'Ready' : DASH }] }
    }
}

const first = (promise) => promise.then((value) => ({ ok: true, value }), () => ({ ok: false }))

export default function useAdminTiles({ monitorAllowed = false, page = {}, knowledge = null } = {}) {
    const [remote, setRemote] = useState({})
    const [overrides, setOverrides] = useState({})
    const [tick, setTick] = useState(0)
    useEffect(() => {
        if (!hasServerApi) return undefined
        let alive = true
        ;(async () => {
            const [sp, us, oc, vi, ag, es] = await Promise.all([
                first(listServerSpaces()), first(listUsers()), first(listOpenCallApplications('beyond_form')),
                first(getAppVisitors()), first(getAgentBoard()), first(getEstateMap())
            ])
            if (!alive) return
            const apps = oc.ok && Array.isArray(oc.value) ? oc.value : null
            setRemote({
                spaces: sp.ok && Array.isArray(sp.value) ? sp.value.length : undefined,
                users: us.ok && Array.isArray(us.value) ? us.value.length : undefined,
                calls: apps ? apps.length : undefined,
                callsNew: apps ? apps.filter((a) => (a.status || 'new') === 'new').length : undefined,
                visitors: vi.ok && Array.isArray(vi.value?.agents) ? vi.value.agents.length : undefined,
                agentsLive: ag.ok ? ag.value?.live?.length || 0 : undefined,
                agentsTotal: ag.ok ? ag.value?.totalSessions || 0 : undefined,
                estate: es.ok ? 'ready' : 'none'
            })
        })()
        return () => { alive = false }
    }, [tick, monitorAllowed])
    // A window that is open reports fresher numbers than the one fetch above.
    const report = useCallback((key, stats) => {
        setOverrides((prev) => {
            const old = prev[key]
            if (old && Object.keys(stats).every((k) => old[k] === stats[k])) return prev
            return { ...prev, [key]: { ...old, ...stats } }
        })
    }, [])
    const refresh = useCallback(() => setTick((n) => n + 1), [])
    const tiles = useMemo(() => buildTiles({ remote, page, overrides, knowledge }), [remote, page, overrides, knowledge])
    return { tiles, report, refresh }
}
