/* global __APP_VERSION__ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './kit.css'
import SurfaceBar from '../components/SurfaceBar.jsx'
import useAuthSession from '../hooks/useAuthSession.js'
import { apiBaseUrl } from '../services/apiClient.js'
import { isEmbedRequest } from '../utils/previewMode.js'
import { buildWikiPath } from '../utils/spaceRouting.js'
import {
    KIT_LIBS,
    SANDBOX_PLACEHOLDER,
    isAppPath,
    kitGroupsWithTools,
    sourceUrl
} from './kitCatalogue.js'
import { kitStackGroups } from './kitStack.js'
import KitPreview from './KitPreview.jsx'
import kitWeights from './kitWeights.json'

/**
 * `/tools` — the Kit.
 *
 * Every tool di.iiii has, one card each, grouped the way a person thinks about
 * them: walk, build, nodes, light & projection, carry & share, together, for
 * agents. A card shows the tool running (a live picture of the real route, or
 * a real screenshot where nothing live can be shown without a machine in the
 * room), one button that opens it ready to use with no account, the public
 * works made with it, and what it is made of — each library at its own site,
 * each source file in the public repo, the wiki article.
 *
 * Two rules the page keeps. Only ONE live picture at a time: a preview is a
 * whole app instance, and a phone that has not asked for one downloads none of
 * it. And nothing here says "coming": the list is kitCatalogue.js, which only
 * holds what the audit saw working.
 */

const INSTALL_HREF = `${buildWikiPath()}#di-cli-local`
const isCoarsePointer = () => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches

const fillSandbox = (path, sandboxSpaceId) => (
    typeof path === 'string' && path.includes(SANDBOX_PLACEHOLDER)
        ? (sandboxSpaceId ? path.replace(SANDBOX_PLACEHOLDER, sandboxSpaceId) : null)
        : path
)

const whereLabel = (where) => {
    if (where === 'web') return 'on the web'
    if (where === 'install') return 'on your own di.iiii'
    return 'on the web · on your own di.iiii'
}

// The address the visitor's own copy of a tool has, once the session has said
// which sandbox is theirs. Until then the sandbox card keeps its still.
const resolveTool = (tool, sandboxSpaceId) => {
    const tryPath = fillSandbox(tool.try?.path, sandboxSpaceId)
    const previewPath = tool.preview.kind === 'frame' ? fillSandbox(tool.preview.path, sandboxSpaceId) : null
    return {
        ...tool,
        try: tool.try && tryPath ? { ...tool.try, path: tryPath } : null,
        preview: tool.preview.kind === 'frame' && !previewPath
            ? { kind: 'still', poster: tool.preview.poster }
            : (previewPath ? { ...tool.preview, path: previewPath } : tool.preview)
    }
}

const tryHref = (tool) => {
    if (!tool.try) return null
    if (tool.try.download) return `${apiBaseUrl}${tool.try.path.replace(/^\/serverXR/, '')}`
    return tool.try.path
}

function KitCard({ tool, live, onAskLive, coarse }) {
    const ref = useRef(null)
    const href = tryHref(tool)

    // On a phone, the card most in view becomes the live one once the person
    // has scrolled — never on arrival, so a first load fetches no scene.
    useEffect(() => {
        const node = ref.current
        if (!node || !coarse || tool.preview.kind !== 'frame' || typeof IntersectionObserver !== 'function') return undefined
        let scrolled = false
        const onScroll = () => { scrolled = true }
        window.addEventListener('scroll', onScroll, { passive: true, once: true })
        const observer = new IntersectionObserver((entries) => {
            if (!scrolled) return
            if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.75)) onAskLive(tool.id)
        }, { threshold: [0.75] })
        observer.observe(node)
        return () => {
            observer.disconnect()
            window.removeEventListener('scroll', onScroll)
        }
    }, [coarse, onAskLive, tool.id, tool.preview.kind])

    const askLive = tool.preview.kind === 'frame' ? () => onAskLive(tool.id) : undefined

    return (
        <article
            className={`kit-card${live ? ' is-live' : ''}`}
            id={`kit-${tool.id}`}
            ref={ref}
            onPointerEnter={coarse ? undefined : askLive}
            onFocus={askLive}
        >
            <KitPreview tool={tool} live={live} onAskLive={tool.preview.kind === 'frame' ? onAskLive : null} />
            <div className="kit-body">
                <div className="kit-head">
                    <h3 className="kit-name">{tool.name}</h3>
                    <span className="kit-where">
                        {tool.where === 'web'
                            ? whereLabel(tool.where)
                            : <a href={INSTALL_HREF}>{whereLabel(tool.where)}</a>}
                    </span>
                </div>
                <p className="kit-line">{tool.line}</p>
                <div className="kit-actions">
                    {href ? (
                        <a className="kit-try" href={href} {...(tool.try.download ? { download: true } : {})}>
                            {tool.try.label}
                        </a>
                    ) : tool.needs ? (
                        <span className="kit-needs">
                            {tool.needs.text}{' '}
                            <a href={tool.needs.href} {...(isAppPath(tool.needs.href) ? {} : { target: '_blank', rel: 'noreferrer' })}>{tool.needs.label}</a>
                        </span>
                    ) : (
                        <span className="kit-needs">
                            Runs on your own di.iiii — <a href={INSTALL_HREF}>how to install</a>
                        </span>
                    )}
                </div>
                <dl className="kit-facts">
                    {tool.show.length > 0 ? (
                        <div className="kit-fact">
                            <dt>Show</dt>
                            <dd>
                                {tool.show.map((item) => (
                                    <a key={item.href} href={item.href} {...(isAppPath(item.href) ? {} : { target: '_blank', rel: 'noreferrer' })}>{item.label}</a>
                                ))}
                            </dd>
                        </div>
                    ) : null}
                    <div className="kit-fact">
                        <dt>Made with</dt>
                        <dd>
                            {tool.madeWith.map((key) => {
                                const lib = KIT_LIBS[key]
                                return <a key={key} href={lib.url} target="_blank" rel="noreferrer">{lib.name}</a>
                            })}
                        </dd>
                    </div>
                    <div className="kit-fact">
                        <dt>Source</dt>
                        <dd className="kit-sources">
                            {tool.sources.map((path) => (
                                <a key={path} href={sourceUrl(path)} target="_blank" rel="noreferrer" title={path}>{path.split('/').pop()}</a>
                            ))}
                            <a className="kit-wiki-link" href={`${buildWikiPath()}#${tool.wiki}`}>wiki</a>
                        </dd>
                    </div>
                </dl>
            </div>
        </article>
    )
}

const kb = (value) => `${Math.round(Number(value) || 0)} KB`

export default function KitPage({ isLocalInstall = false }) {
    const isEmbed = isEmbedRequest()
    const { sandboxSpaceId } = useAuthSession()
    const [liveId, setLiveId] = useState(null)
    const [coarse] = useState(isCoarsePointer)
    const askLive = useCallback((id) => setLiveId(id), [])

    const groups = useMemo(
        () => kitGroupsWithTools().map((group) => ({ ...group, tools: group.tools.map((tool) => resolveTool(tool, sandboxSpaceId)) })),
        [sandboxSpaceId]
    )
    const stackGroups = useMemo(() => kitStackGroups(), [])
    const count = groups.reduce((total, group) => total + group.tools.length, 0)

    return (
        <div className="kit">
            <SurfaceBar here="tools" isLocalInstall={isLocalInstall} hidden={isEmbed} />

            <main className="kit-page">
                <header className="kit-intro">
                    <h1 className="kit-title">Tools</h1>
                    <p className="kit-lede">
                        Everything di.iiii does, one card each. Watch it run, try it without an account, and see what it is built from.
                    </p>
                    <nav className="kit-nav" aria-label="Groups">
                        {groups.map((group) => (
                            <a key={group.id} href={`#kit-group-${group.id}`}>{group.label}</a>
                        ))}
                        <a href="#kit-stack">what we use</a>
                    </nav>
                </header>

                {groups.map((group) => (
                    <section className="kit-group" key={group.id} id={`kit-group-${group.id}`} aria-labelledby={`kit-group-${group.id}-title`}>
                        <h2 className="kit-group-title" id={`kit-group-${group.id}-title`}>
                            {group.label}
                            <span className="kit-group-line">{group.line}</span>
                        </h2>
                        <div className="kit-grid">
                            {group.tools.map((tool) => (
                                <KitCard key={tool.id} tool={tool} live={liveId === tool.id} onAskLive={askLive} coarse={coarse} />
                            ))}
                        </div>
                    </section>
                ))}

                <section className="kit-stack" id="kit-stack" aria-labelledby="kit-stack-title">
                    <h2 className="kit-group-title" id="kit-stack-title">
                        what we use
                        <span className="kit-group-line">{count} tools, built from these.</span>
                    </h2>
                    <p className="kit-stack-lede">
                        di.iiii is built like a kit: each part loads only when a piece uses it. This page is one part —{' '}
                        {kb(kitWeights.kitPageKB)} of its own code on top of the {kb(kitWeights.coreKB)} every page shares — and a live
                        picture fetches its 3D engine, {kb(kitWeights.threeKB)}, only when you ask for one. Opening this page:{' '}
                        {kb(kitWeights.firstLoadKB)} on a desk, {kb(kitWeights.firstLoadPhoneKB)} on a phone, before any picture goes live.
                        Measured {kitWeights.measured}, compressed as sent.
                    </p>
                    {stackGroups.map((group) => (
                        <div className="kit-stack-group" key={group.id}>
                            <h3 className="kit-stack-group-title">
                                {group.label}
                                <span className="kit-group-line">{group.line}</span>
                            </h3>
                            <table className="kit-stack-table">
                                <thead>
                                    <tr><th scope="col">part</th><th scope="col">version</th><th scope="col">used for</th><th scope="col">licence</th></tr>
                                </thead>
                                <tbody>
                                    {group.entries.map((entry) => (
                                        <tr key={entry.name}>
                                            <th scope="row"><a href={entry.url} target="_blank" rel="noreferrer">{entry.name}</a></th>
                                            <td className="kit-mono">{entry.version || '—'}</td>
                                            <td>{entry.use}</td>
                                            <td className="kit-mono">{entry.licence}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </section>

                <div className="kit-version">di.iiii v{typeof __APP_VERSION__ === 'undefined' ? '' : __APP_VERSION__}</div>
            </main>
        </div>
    )
}
