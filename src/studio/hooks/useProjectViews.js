import { useCallback, useEffect, useMemo, useState } from 'react'
import { getProjectDocument, submitProjectOps } from '../../project/services/projectsApi.js'
import { productionViewsOf, versionProjectIds, versionsFromDocument } from '../../shared/productionVersions.js'
import { rigVariantOf, versionListProjectOf } from '../../rigbuild/rigVariant.js'
import { addCameraView, removeView, setViewHidden, setViewLive, viewRows } from '../../project/viewport/smartView/viewData.js'
import { productionChromeOf, visitorChromeOf } from '../../shared/visitorChrome.js'
import { writeChromeEverywhere, writeViewsEverywhere } from '../../project/viewport/smartView/productionViewsSync.js'

const api = {
    getDocument: (id) => getProjectDocument(id),
    submitOps: (id, baseVersion, ops) => submitProjectOps(id, baseVersion, ops)
}

/**
 * The Studio's side of views as data (src/project/viewport/smartView/viewData.js): the list this project shows,
 * and the edits — live or work, hide a built-in, add the current camera, remove an extra.
 *
 * A project that is a version of a production (its rigVariant names the set, and the space holds the
 * production's list `<set>-versions`) edits the PRODUCTION's list (decision 3, 2026-10-13): the change lands in
 * this project at once (a local op), then in the list and in every other version's document. Anyone who cannot
 * read the list (or a project in no production) edits the project's own list.
 */
export default function useProjectViews({ projectId, document, applyLocalOps, log }) {
    const listProjectId = useMemo(() => versionListProjectOf(rigVariantOf(document?.entities || [])), [document?.entities])
    const [production, setProduction] = useState(null)
    const [nonce, setNonce] = useState(0)

    useEffect(() => {
        if (!listProjectId) { setProduction(null); return undefined }
        let live = true
        Promise.resolve()
            .then(() => getProjectDocument(listProjectId))
            .then((answer) => {
                if (!live) return
                const list = answer?.document ? versionsFromDocument(answer.document) : null
                setProduction(list?.production
                    ? { listProjectId, title: list.production.title, views: productionViewsOf(answer.document), chrome: productionChromeOf(answer.document), projectIds: versionProjectIds(answer.document) }
                    : null)
            })
            .catch(() => { if (live) setProduction(null) })
        return () => { live = false }
    }, [listProjectId, nonce])

    const own = document?.presentationState?.viewPresets
    // The production's choice wins once it has one; until then the project's own list is where it starts from.
    const current = production?.views || own
    const rows = useMemo(() => viewRows(current), [current])

    const change = useCallback((viewPresets) => {
        applyLocalOps({ type: 'setPresentationState', payload: { patch: { viewPresets } } })
        if (!production) return
        writeViewsEverywhere({
            viewPresets,
            listProjectId: production.listProjectId,
            projectIds: production.projectIds.filter((id) => id !== projectId),
            api
        }).then(({ written, failed }) => {
            if (failed.length) log?.('warning', `Views saved here; not saved in ${failed.map((f) => `${f.projectId} (${f.error})`).join(', ')}.`)
            else if (written.length) log?.('info', `Views saved for every version of ${production.title}.`)
            setNonce((n) => n + 1)
        })
    }, [applyLocalOps, production, projectId, log])

    // What visitors see (visitorChrome.js): the production's choice wins once it has one, else this project's own.
    const chrome = production?.chrome || visitorChromeOf(document)
    const setChrome = useCallback((next) => {
        applyLocalOps({ type: 'setPresentationState', payload: { patch: { visitorChrome: next } } })
        if (!production) return
        writeChromeEverywhere({
            chrome: next,
            listProjectId: production.listProjectId,
            projectIds: production.projectIds.filter((id) => id !== projectId),
            api
        }).then(({ written, failed }) => {
            if (failed.length) log?.('warning', `What visitors see saved here; not saved in ${failed.map((f) => `${f.projectId} (${f.error})`).join(', ')}.`)
            else if (written.length) log?.('info', `What visitors see saved for every version of ${production.title}.`)
            setNonce((n) => n + 1)
        })
    }, [applyLocalOps, production, projectId, log])

    return {
        chrome,
        setChrome,
        rows,
        production: production ? { title: production.title, versions: production.projectIds.length } : null,
        setLive: (id, live) => change(setViewLive(current, id, live)),
        setHidden: (id, hidden) => change(setViewHidden(current, id, hidden)),
        remove: (id) => change(removeView(current, id)),
        // camera: { position, target, fov } — the Studio camera as it stands
        addCamera: (camera, label) => {
            const { viewPresets, id } = addCameraView(current, { ...camera, label })
            change(viewPresets)
            return id
        }
    }
}
