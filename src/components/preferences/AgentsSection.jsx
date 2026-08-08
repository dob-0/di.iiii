import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArchitectureCanvas, InfoPair, ModuleSection, formatTimestamp } from './PreferencesShared.jsx'
import { getAgentBoard, getAgentBoardSession } from '../../services/apiClient.js'

const POLL_MS = 10000
const MAP_SESSION_LIMIT = 8
const MAP_COLUMNS = 4

// live.status comes from the local Claude session records
const STATUS_TONE = {
    busy: 'success',
    shell: 'accent',
    idle: 'muted',
    blocked: 'warning'
}

const timeAgo = (iso) => {
    if (!iso) return 'n/a'
    const ms = Date.now() - new Date(iso).getTime()
    if (!Number.isFinite(ms) || ms < 0) return 'now'
    const minutes = Math.floor(ms / 60000)
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 48) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
}

const sessionLabel = (session) => session.title || session.sessionId.slice(0, 8)

// Long titles must not blow the sidebar grid column open (grid min-width:auto
// lets an unbreakable row paint over the detail pane) — truncate in JS, the
// full title stays available on the card tooltip and detail header.
const shortLabel = (session) => {
    const label = sessionLabel(session)
    return label.length > 30 ? `${label.slice(0, 29)}…` : label
}

const treeLabel = (treePath) => treePath.split('/').filter(Boolean).pop() || treePath

// Which checkout a session is working in — worktree-state beats cwd because
// most sessions launch from the home directory and only then enter a tree.
const sessionTreePath = (session) => session.worktreePath || session.cwd || null

export default function AgentsSection() {
    const [board, setBoard] = useState(null)
    const [unavailable, setUnavailable] = useState(false)
    const [error, setError] = useState('')
    const [selectedSessionId, setSelectedSessionId] = useState(null)
    const [selectedTreePath, setSelectedTreePath] = useState(null)
    const [detail, setDetail] = useState(null)
    const [detailError, setDetailError] = useState('')

    const loadBoard = useCallback(async () => {
        try {
            setBoard(await getAgentBoard())
            setUnavailable(false)
            setError('')
        } catch (e) {
            if (e.status === 404) {
                setUnavailable(true)
            } else {
                setError(e.message || 'Failed to load the agent board.')
            }
        }
    }, [])

    useEffect(() => {
        loadBoard()
        const timer = setInterval(loadBoard, POLL_MS)
        return () => clearInterval(timer)
    }, [loadBoard])

    useEffect(() => {
        if (!selectedSessionId) {
            setDetail(null)
            setDetailError('')
            return undefined
        }
        let cancelled = false
        const loadDetail = async () => {
            try {
                const next = await getAgentBoardSession(selectedSessionId)
                if (!cancelled) {
                    setDetail(next)
                    setDetailError('')
                }
            } catch (e) {
                if (!cancelled) setDetailError(e.message || 'Failed to read the session.')
            }
        }
        loadDetail()
        const timer = setInterval(loadDetail, POLL_MS)
        return () => {
            cancelled = true
            clearInterval(timer)
        }
    }, [selectedSessionId])

    const sessions = useMemo(() => board?.sessions || [], [board])
    const liveSessions = useMemo(
        () => sessions.filter((session) => session.live),
        [sessions]
    )
    const recentSessions = useMemo(
        () => sessions.filter((session) => !session.live),
        [sessions]
    )

    // Map: live sessions on the upper rows, the checkouts they hold below them.
    // Showing which session owns which tree is the point — parallel agents
    // editing the same checkout is how real incidents happen.
    const { mapNodes, mapLinks } = useMemo(() => {
        const shown = liveSessions.slice(0, MAP_SESSION_LIMIT)
        const nodes = []
        const links = []
        const sessionRows = Math.max(1, Math.ceil(shown.length / MAP_COLUMNS))
        const treeNodesByPath = new Map()

        shown.forEach((session, index) => {
            const status = session.live?.status || 'idle'
            nodes.push({
                id: `session:${session.sessionId}`,
                col: (index % MAP_COLUMNS) + 1,
                row: Math.floor(index / MAP_COLUMNS) + 1,
                kicker: session.live?.kind === 'bg' ? 'background' : 'session',
                label: sessionLabel(session),
                status,
                detail: session.branch || '',
                meta: session.sessionId.slice(0, 8),
                tone: STATUS_TONE[status] || 'default',
                tooltip: session.title || session.sessionId
            })
        })

        shown.forEach((session) => {
            const treePath = sessionTreePath(session)
            if (!treePath) return
            if (!treeNodesByPath.has(treePath)) {
                const index = treeNodesByPath.size
                treeNodesByPath.set(treePath, {
                    id: `tree:${treePath}`,
                    col: (index % MAP_COLUMNS) + 1,
                    row: sessionRows + 1 + Math.floor(index / MAP_COLUMNS),
                    kicker: 'checkout',
                    label: treeLabel(treePath),
                    status: session.branch || '',
                    detail: treePath,
                    tone: 'default',
                    tooltip: treePath
                })
            }
            const from = nodes.find((node) => node.id === `session:${session.sessionId}`)
            const to = treeNodesByPath.get(treePath)
            if (from && to) {
                links.push({
                    key: `${from.id}->${to.id}`,
                    from,
                    to,
                    tone: from.tone
                })
            }
        })

        return { mapNodes: [...nodes, ...treeNodesByPath.values()], mapLinks: links }
    }, [liveSessions])

    const selectedMapNodeId = selectedTreePath
        ? `tree:${selectedTreePath}`
        : (selectedSessionId ? `session:${selectedSessionId}` : null)

    const onSelectMapNode = useCallback((nodeId) => {
        if (nodeId.startsWith('session:')) {
            setSelectedTreePath(null)
            setSelectedSessionId(nodeId.slice('session:'.length))
        } else if (nodeId.startsWith('tree:')) {
            setSelectedSessionId(null)
            setSelectedTreePath(nodeId.slice('tree:'.length))
        }
    }, [])

    const selectedSession = useMemo(
        () => sessions.find((session) => session.sessionId === selectedSessionId) || null,
        [sessions, selectedSessionId]
    )
    const treeHolders = useMemo(
        () => (selectedTreePath
            ? liveSessions.filter((session) => sessionTreePath(session) === selectedTreePath)
            : []),
        [liveSessions, selectedTreePath]
    )

    if (unavailable) {
        return (
            <ModuleSection title="Agents" subtitle="Operator mode only">
                <div className="preferences-empty">
                    The agent board reads this machine&apos;s local Claude data, so it is
                    only available when serverXR runs on your own machine in dev mode
                    (loopback, non-production). Nothing is served here in deployed
                    environments.
                </div>
            </ModuleSection>
        )
    }

    const renderSessionRow = (session, isChild) => {
        const status = session.live?.status || null
        return (
            <button
                key={session.sessionId}
                type="button"
                className={`preferences-tree-row${isChild ? ' is-child' : ''}${session.sessionId === selectedSessionId ? ' is-selected' : ''}`}
                onClick={() => {
                    setSelectedTreePath(null)
                    setSelectedSessionId(session.sessionId)
                }}
            >
                <span className="preferences-tree-name">{shortLabel(session)}</span>
                <span className="preferences-tree-tag">{status || timeAgo(session.lastActivity)}</span>
            </button>
        )
    }

    return (
        <>
            <ModuleSection
                title="Agent Map"
                subtitle={`${liveSessions.length} live session${liveSessions.length === 1 ? '' : 's'} · ${board?.totalSessions ?? 0} total on this machine`}
                actions={
                    <button type="button" className="preferences-inline-action" onClick={loadBoard}>
                        Refresh
                    </button>
                }
            >
                {error ? <div className="preferences-empty">{error}</div> : null}
                <div className="preferences-stage-layout">
                    <ArchitectureCanvas
                        nodes={mapNodes}
                        links={mapLinks}
                        selectedNodeId={selectedMapNodeId}
                        onSelectNode={onSelectMapNode}
                    />

                    <div className="preferences-stage-sidebar-block preferences-node-inspector">
                        <div className="preferences-stage-sidebar-title">
                            Inspector — {selectedSession ? sessionLabel(selectedSession) : (selectedTreePath ? treeLabel(selectedTreePath) : 'none')}
                        </div>
                        {selectedSession ? (
                            <>
                                <InfoPair label="Session" value={selectedSession.sessionId} mono />
                                <InfoPair label="Status" value={selectedSession.live?.status || 'ended'} mono />
                                <InfoPair label="Branch" value={selectedSession.branch || 'n/a'} mono />
                                <InfoPair label="Checkout" value={sessionTreePath(selectedSession) || 'n/a'} mono />
                                <InfoPair label="Model" value={selectedSession.model || 'n/a'} mono />
                                <InfoPair label="Messages" value={String(selectedSession.messageCount ?? 'n/a')} />
                                <InfoPair label="Last activity" value={formatTimestamp(selectedSession.lastActivity)} />
                                {selectedSession.prUrl ? (
                                    <InfoPair label="PR" value={`#${selectedSession.prNumber}`} mono />
                                ) : null}
                            </>
                        ) : selectedTreePath ? (
                            <>
                                <InfoPair label="Path" value={selectedTreePath} mono />
                                <InfoPair label="Held by" value={`${treeHolders.length} live session${treeHolders.length === 1 ? '' : 's'}`} />
                                {treeHolders.map((session) => (
                                    <InfoPair
                                        key={session.sessionId}
                                        label={session.live?.status || 'live'}
                                        value={sessionLabel(session)}
                                    />
                                ))}
                            </>
                        ) : (
                            <div className="preferences-empty">
                                Select a session or checkout on the map to inspect it.
                            </div>
                        )}
                    </div>
                </div>
            </ModuleSection>

            <ModuleSection title="Sessions" subtitle="Chats and topics — live first, then recent">
                <div className="preferences-manage-layout">
                    <div className="preferences-stage-sidebar-block">
                        <div className="preferences-stage-sidebar-title">Directory</div>
                        <div className="preferences-tree">
                            <div className="preferences-tree-group">
                                <div className="preferences-tree-row">
                                    <span className="preferences-tree-name">Live</span>
                                    <span className="preferences-tree-tag">{liveSessions.length}</span>
                                </div>
                                {liveSessions.map((session) => renderSessionRow(session, true))}
                            </div>
                            <div className="preferences-tree-group">
                                <div className="preferences-tree-row">
                                    <span className="preferences-tree-name">Recent</span>
                                    <span className="preferences-tree-tag">{recentSessions.length}</span>
                                </div>
                                {recentSessions.map((session) => renderSessionRow(session, true))}
                            </div>
                        </div>
                    </div>

                    <div className="preferences-manage-detail">
                        {!selectedSession ? (
                            <ModuleSection title="Session detail" subtitle="Nothing selected">
                                <div className="preferences-empty">
                                    Pick a session from the directory or the map to read its
                                    conversation tail and agent tree.
                                </div>
                            </ModuleSection>
                        ) : (
                            <>
                                <ModuleSection
                                    title={sessionLabel(selectedSession)}
                                    subtitle={`${selectedSession.live ? `live · ${selectedSession.live.status}` : `last active ${timeAgo(selectedSession.lastActivity)} ago`}`}
                                >
                                    {detailError ? <div className="preferences-empty">{detailError}</div> : null}
                                    <InfoPair label="Branch" value={selectedSession.branch || 'n/a'} mono />
                                    <InfoPair label="Checkout" value={sessionTreePath(selectedSession) || 'n/a'} mono />
                                    {detail?.job ? (
                                        <>
                                            <InfoPair label="Job state" value={detail.job.state || 'n/a'} mono />
                                            {detail.job.result ? <InfoPair label="Result" value={detail.job.result} /> : null}
                                        </>
                                    ) : null}
                                </ModuleSection>

                                <ModuleSection
                                    title="Agent tree"
                                    subtitle={`${detail?.subagents?.length ?? 0} subagents`}
                                >
                                    {detail?.subagents?.length ? (
                                        <div className="preferences-tree">
                                            {detail.subagents.map((agent) => (
                                                <div
                                                    key={agent.agentId}
                                                    className={`preferences-tree-row${(agent.spawnDepth ?? 1) > 1 ? ' is-child' : ''} is-leaf`}
                                                >
                                                    <span className="preferences-tree-name">
                                                        {(agent.description || agent.agentId).slice(0, 44)}
                                                    </span>
                                                    <span className="preferences-tree-tag">{agent.agentType || 'agent'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="preferences-empty">No subagents recorded for this session.</div>
                                    )}
                                </ModuleSection>

                                <ModuleSection
                                    title="Conversation tail"
                                    subtitle={`Last ${detail?.tail?.length ?? 0} turns`}
                                >
                                    <div className="preferences-console preferences-console-full">
                                        {detail?.tail?.length ? (
                                            detail.tail.map((turn, index) => (
                                                <div
                                                    key={`${turn.timestamp || index}-${index}`}
                                                    className={`preferences-console-line ${turn.role === 'user' ? 'warn' : 'info'}`}
                                                >
                                                    <span className="preferences-console-time">
                                                        {turn.timestamp ? new Date(turn.timestamp).toLocaleTimeString() : ''}
                                                    </span>
                                                    <span className="preferences-console-level">
                                                        {turn.role === 'user' ? 'YOU' : 'AGENT'}
                                                    </span>
                                                    <span className="preferences-console-message">{turn.text}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="preferences-empty">No readable turns in the transcript tail.</div>
                                        )}
                                    </div>
                                </ModuleSection>
                            </>
                        )}
                    </div>
                </div>
            </ModuleSection>
        </>
    )
}
