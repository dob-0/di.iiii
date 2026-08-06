import { useCallback, useEffect, useState } from 'react'
import { ModuleSection, InfoPair } from './PreferencesShared.jsx'
import { LoadingInline } from '../LoadingScreen.jsx'
import {
    getSpaceGithubLink,
    connectSpaceGithub,
    disconnectSpaceGithub,
    getGithubAppInfo,
    listGithubRepos
} from '../../services/serverSpaces.js'

// Connect a space to a GitHub repo. Pushes to the repo auto-sync the space via
// the di.iiii GitHub App (serverXR /api/github/webhook). One link per space.
// Server-side the routes are owner-or-admin, so this renders for space owners
// (SpaceHub) and admins (/admin Manage) alike.
export default function GithubSyncSection({ space, projects }) {
    const [link, setLink] = useState(undefined) // undefined=loading · null=none · 'denied' · object=linked
    const [form, setForm] = useState({ owner: '', repo: '', projectId: '', entry: 'index.html' })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [result, setResult] = useState(null)
    const [appInfo, setAppInfo] = useState(null)   // { configured, installUrl, name }
    const [repos, setRepos] = useState(null)       // null=loading · []=none reachable
    const [reposBusy, setReposBusy] = useState(false)
    const [manual, setManual] = useState(false)
    const [awaitingInstall, setAwaitingInstall] = useState(false)

    useEffect(() => {
        let active = true
        setLink(undefined); setError(''); setResult(null)
        getSpaceGithubLink(space.id)
            .then((l) => { if (active) setLink(l) })
            .catch((e) => { if (active) { setLink('denied'); setError(e.message || '') } })
        return () => { active = false }
    }, [space.id])

    const loadRepos = useCallback(async ({ refresh = false } = {}) => {
        setReposBusy(true)
        try {
            const data = await listGithubRepos({ refresh })
            setRepos(Array.isArray(data.repos) ? data.repos : [])
        } catch {
            setRepos([])
        } finally { setReposBusy(false) }
    }, [])

    useEffect(() => {
        if (link !== null) return // only needed while offering to connect
        let active = true
        getGithubAppInfo()
            .then((info) => { if (active) setAppInfo(info) })
            .catch(() => { if (active) setAppInfo({ configured: false }) })
        loadRepos()
        return () => { active = false }
    }, [link, loadRepos])

    useEffect(() => {
        setForm((f) => f.projectId ? f : { ...f, projectId: space.publishedProjectId || projects[0]?.id || '' })
    }, [space.publishedProjectId, projects])

    // After the user opens GitHub's install page there's no callback into this
    // tab — poll quietly until the new repo shows up, then stop. No refresh
    // button to press.
    useEffect(() => {
        if (!awaitingInstall || link !== null) return undefined
        const startCount = Array.isArray(repos) ? repos.length : 0
        const timer = window.setInterval(async () => {
            try {
                const data = await listGithubRepos({ refresh: true })
                const next = Array.isArray(data.repos) ? data.repos : []
                setRepos(next)
                if (next.length > startCount) setAwaitingInstall(false)
            } catch { /* keep polling */ }
        }, 6000)
        const stop = window.setTimeout(() => setAwaitingInstall(false), 3 * 60_000)
        return () => { window.clearInterval(timer); window.clearTimeout(stop) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [awaitingInstall, link])

    const connect = async (overrides = {}) => {
        const owner = (overrides.owner ?? form.owner).trim()
        const repo = (overrides.repo ?? form.repo).trim()
        if (!owner || !repo || !form.projectId) { setError('Pick a repository and a project first.'); return }
        setBusy(true); setError(''); setResult(null)
        try {
            const res = await connectSpaceGithub(space.id, {
                owner, repo,
                projectId: form.projectId, entry: form.entry.trim() || 'index.html'
            })
            setLink(res.link); setResult(res.initialSync)
        } catch (e) { setError(e.message || 'Could not connect.') } finally { setBusy(false) }
    }

    const disconnect = async () => {
        if (!window.confirm('Disconnect this space from GitHub? It will stop auto-syncing.')) return
        setBusy(true); setError('')
        try { await disconnectSpaceGithub(space.id); setLink(null); setResult(null) }
        catch (e) { setError(e.message || 'Could not disconnect.') } finally { setBusy(false) }
    }

    return (
        <ModuleSection title="GitHub sync" subtitle="Connect a repo — pushes auto-update this space">
            {link === undefined && (
                <div className="preferences-empty">
                    <LoadingInline label="loading…" />
                </div>
            )}

            {link === 'denied' && (
                <div className="preferences-empty">Sign in as the space owner or an admin to manage GitHub sync.</div>
            )}

            {link && link !== 'denied' && (
                <>
                    <InfoPair label="Repository" value={`${link.owner}/${link.repo}`} mono />
                    <InfoPair label="Project" value={link.projectId} mono />
                    <InfoPair label="Branch" value={link.ref || 'default'} />
                    <InfoPair label="App install" value={link.installationId ? `#${link.installationId}` : 'not found — install the di.iiii GitHub App on this repo'} />
                    <InfoPair label="Last push synced" value={link.lastSyncSha ? link.lastSyncSha.slice(0, 10) : 'on connect'} />
                    <div className="preferences-command-grid">
                        <button type="button" className="toggle-button active success-button" disabled>Connected ✓</button>
                        <button type="button" className="toggle-button warning" onClick={disconnect} disabled={busy}>Disconnect</button>
                    </div>
                </>
            )}

            {link === null && (
                <>
                    {!manual && Array.isArray(repos) && repos.length > 0 && (
                        <select
                            className="preferences-input"
                            value=""
                            disabled={busy}
                            onChange={(e) => {
                                if (!e.target.value) return
                                const [owner = '', repo = ''] = e.target.value.split('/')
                                setForm({ ...form, owner, repo })
                                connect({ owner, repo })
                            }}
                        >
                            <option value="">{busy ? 'Connecting…' : 'Pick a repository to connect…'}</option>
                            {repos.map((r) => (
                                <option key={r.fullName} value={r.fullName}>{r.fullName}{r.private ? ' · private' : ''}</option>
                            ))}
                        </select>
                    )}
                    {appInfo?.configured && appInfo.installUrl && (
                        <div className="preferences-command-grid">
                            <a
                                className="toggle-button"
                                href={appInfo.installUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => setAwaitingInstall(true)}
                            >
                                {Array.isArray(repos) && repos.length > 0 ? '+ Add another repo on GitHub ↗' : 'Connect a repo — opens GitHub ↗'}
                            </a>
                        </div>
                    )}
                    {awaitingInstall && (
                        <div className="preferences-empty">
                            <LoadingInline announce="Waiting for GitHub" />
                            {' '}Waiting for GitHub… finish choosing repos in the other tab; new ones appear here automatically.
                        </div>
                    )}
                    {!awaitingInstall && Array.isArray(repos) && repos.length === 0 && appInfo?.configured && !reposBusy && (
                        <div className="preferences-empty">No repositories connected yet — the GitHub button above takes ~20 seconds.</div>
                    )}
                    {projects.length > 1 && (
                        <select className="preferences-input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                            {projects.map((p) => <option key={p.id} value={p.id}>{`syncs into: ${p.title || p.id}`}</option>)}
                        </select>
                    )}
                    {(manual || appInfo?.configured === false) && (
                        <form className="preferences-inline-form" onSubmit={(e) => { e.preventDefault(); connect() }}>
                            <input className="preferences-input" placeholder="owner (e.g. dob-0)" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
                            <input className="preferences-input" placeholder="repo (e.g. br_id_ge)" value={form.repo} onChange={(e) => setForm({ ...form, repo: e.target.value })} />
                            <input className="preferences-input" placeholder="entry (index.html)" value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} />
                            <button type="submit" className="toggle-button" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
                        </form>
                    )}
                    {appInfo?.configured && (
                        <button type="button" className="preferences-inline-action" onClick={() => setManual((v) => !v)}>
                            {manual ? 'hide manual entry' : 'advanced: type owner/repo + entry file'}
                        </button>
                    )}
                </>
            )}

            {result && (
                <div className="preferences-empty">
                    {result.error ? `Connected, but first sync failed: ${result.error}` : `Synced ${result.bytes} bytes from ${result.ref}.`}
                </div>
            )}
            {error && link !== 'denied' && <div className="preferences-empty">{error}</div>}
        </ModuleSection>
    )
}
