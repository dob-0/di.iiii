import { useCallback, useEffect, useMemo, useState } from 'react'
import { getProjectDocument, listProjects } from '../../project/services/projectsApi.js'
import { applyLightEnv, lightEnvDiff, lightEnvOf, lightEnvOps, lightEnvSummary } from '../../shared/lightEnv.js'

const api = {
    listProjects: (spaceId) => listProjects(spaceId),
    getDocument: (id) => getProjectDocument(id)
}

/**
 * The Studio's side of "Light environment" (src/shared/lightEnv.js): one row per version of the space (every project
 * of the space) with its light-environment summary, **Try** (the live view draws with that environment, nothing is
 * written) and **Take** (writes it to this project through applyLocalOps — one history step, so Undo works).
 *
 * `previewDocument` is what the viewport draws while a Try is on, else null. Reads are read-only GETs of the siblings.
 */
export default function useLightEnvPicker({ projectId, spaceId, document, applyLocalOps, fetcher = api }) {
    const [siblings, setSiblings] = useState([])
    const [tryId, setTryId] = useState(null)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!spaceId) return undefined
        let live = true
        Promise.resolve()
            .then(() => fetcher.listProjects(spaceId))
            // a production's list project (`<production>-versions`) holds no light
            .then((projects) => Promise.all((projects || []).filter((p) => p?.id && p.id !== projectId && !p.id.endsWith('-versions')).map((p) => (
                Promise.resolve(fetcher.getDocument(p.id))
                    .then((answer) => ({ id: p.id, title: p.title || p.id, document: answer?.document || null }))
                    .catch(() => null)
            ))))
            .then((rows) => { if (live) { setSiblings(rows.filter((r) => r?.document)); setError(null) } })
            .catch((e) => { if (live) setError(e?.message || String(e)) })
        return () => { live = false }
    }, [spaceId, projectId, fetcher])

    const rows = useMemo(() => {
        const own = { id: projectId, title: document?.projectMeta?.title || projectId, document, current: true }
        return [own, ...siblings.map((s) => ({ ...s, current: false }))]
            .filter((r) => r.document)
            .map((r) => ({ id: r.id, title: r.title, current: r.current, summary: lightEnvSummary(r.document), env: lightEnvOf(r.document), changes: r.current ? 0 : lightEnvDiff(document, applyLightEnv(document, lightEnvOf(r.document))).length }))
    }, [projectId, document, siblings])

    const tried = rows.find((r) => r.id === tryId && !r.current)
    const previewDocument = useMemo(() => (tried ? applyLightEnv(document, tried.env) : null), [tried, document])

    const tryRow = useCallback((id) => setTryId(id), [])
    const back = useCallback(() => setTryId(null), [])
    const take = useCallback((id) => {
        const row = rows.find((r) => r.id === id && !r.current)
        if (!row) return 0
        const ops = lightEnvOps(lightEnvDiff(document, applyLightEnv(document, row.env)))
        setTryId(null)
        if (ops.length) applyLocalOps(ops)
        return ops.length
    }, [rows, document, applyLocalOps])

    return { rows, tryId: tried ? tried.id : null, previewDocument, tryRow, back, take, error }
}
