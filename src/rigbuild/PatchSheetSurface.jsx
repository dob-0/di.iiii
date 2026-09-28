import { useEffect, useMemo, useState } from 'react'
import { getProjectDocument } from '../project/services/projectsApi.js'
import { lightingApiUrl, probeLightingDesk } from '../map/lightingLink.js'
import { TYPE_LIBRARY } from './types/index.js'
import { libraryWithShow } from './rental.js'
import { SHEET_CSS, patchCsv, powerCsv, renderSheetBody, sheetModel } from './sheet.js'
import { buildPlotPath } from './plotRouting.js'

// THE PATCH SHEET PAGE — /{space}/patch/{projectId}. docs/architecture/RIG_BUILD.md §3.
//
// What the light engineers are handed: the patch by universe and address, the fixture
// types, the power by circuit and the flags, read from the project document alone —
// so the link works on every tier and needs no desk. Where a desk IS here (a local
// install), its rig is read too and any fixture it holds differently is flagged.
//
// Prints to A4 (the print CSS lives with the markup in sheet.js — the terminal's
// standalone file is the same markup), and each table downloads as CSV. No colour:
// a flag is a word and a mark.

const download = (name, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// The app pins html/body/#root (position: fixed, 100% high) for its full-screen
// surfaces; a document must flow, or the browser prints its first page only (seen:
// a 4-page sheet printed as one). Scoped to this page by a class on <html>, and the
// tier mark stays on screen but not on paper.
const PAGE_CSS = `
html.rigsheet-page, html.rigsheet-page body, html.rigsheet-page #root { position: static; margin: 0; height: auto; min-height: 100%; overflow: visible; background: #fff; }
@media print { html.rigsheet-page .mode-mark { display: none !important; } }
`

const readDeskRig = async (projectId) => {
    try {
        if (!(await probeLightingDesk())) return null
        const response = await fetch(lightingApiUrl(`api/rig?project=${encodeURIComponent(projectId)}`))
        if (!response.ok) return null
        return (await response.json()).fixtures || null
    } catch {
        return null
    }
}

export default function PatchSheetSurface({ spaceId, projectId, library: baseLibrary = TYPE_LIBRARY, loadDocument = getProjectDocument, loadDesk = readDeskRig }) {
    const [state, setState] = useState({ status: 'loading', document: null, version: null, desk: null, error: '' })

    useEffect(() => {
        let alive = true
        Promise.all([loadDocument(projectId), loadDesk(projectId)])
            .then(([response, desk]) => {
                if (!alive) return
                setState({ status: 'ready', document: response?.document || null, version: response?.version ?? null, desk, error: '' })
            })
            .catch((error) => {
                if (!alive) return
                const status = Number(error?.status)
                const message = status === 401 || status === 403
                    ? 'This sheet belongs to a private space. Sign in, or ask for an invite to it.'
                    : status === 404 ? 'There is no project here.' : `The sheet could not be read (${error?.message || 'no answer'}).`
                setState({ status: 'error', document: null, version: null, desk: null, error: message })
            })
        return () => { alive = false }
    }, [projectId, loadDocument, loadDesk])

    const model = useMemo(() => (state.document
        ? sheetModel({ entities: state.document.entities || [], library: libraryWithShow(baseLibrary, state.document.entities || []), desk: state.desk, projectId })
        : null), [state.document, state.desk, baseLibrary, projectId])

    useEffect(() => {
        const root = document.documentElement
        root.classList.add('rigsheet-page')
        return () => root.classList.remove('rigsheet-page')
    }, [])

    const title = state.document?.projectMeta?.title || projectId
    useEffect(() => {
        const previous = document.title
        document.title = `Patch sheet — ${title}`
        return () => { document.title = previous }
    }, [title])

    const body = useMemo(() => (model ? renderSheetBody(model, {
        title: `${title} — patch sheet`,
        space: spaceId,
        project: projectId,
        version: state.version,
        generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
        source: state.desk ? 'The desk on this machine was read and compared.' : 'No desk on this machine: the sheet is the document\'s patch only.'
    }) : ''), [model, title, spaceId, projectId, state.version, state.desk])

    return (
        <div style={{ minHeight: '100vh', background: '#fff' }}>
            <style>{PAGE_CSS + SHEET_CSS}</style>
            <main className="rigsheet" aria-busy={state.status === 'loading'}>
                {state.status === 'loading' ? <p>Reading the rig…</p> : null}
                {state.status === 'error' ? <p role="alert">{state.error}</p> : null}
                {model ? (
                    <>
                        <div className="actions">
                            <a href={buildPlotPath(spaceId, projectId)}>Sheet 1 · the plot</a>
                            <button type="button" onClick={() => window.print()}>Print</button>
                            <button type="button" onClick={() => download(`${projectId}-patch.csv`, patchCsv(model))}>Patch CSV</button>
                            <button type="button" onClick={() => download(`${projectId}-power.csv`, powerCsv(model))}>Power CSV</button>
                        </div>
                        {model.totals.lamps === 0 ? <p>No lamp in this project has a fixture type yet.</p> : null}
                        {/* renderSheetBody escapes every value it writes (sheet.js `esc`). */}
                        <div dangerouslySetInnerHTML={{ __html: body }} />
                    </>
                ) : null}
            </main>
        </div>
    )
}
