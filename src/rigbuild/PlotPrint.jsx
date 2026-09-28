import { useEffect, useMemo, useState } from 'react'
import PlotDrawing, { PAPER_SIZES } from './PlotDrawing.jsx'
import { SHEETS, chooseScale, scaleBar, sheetLayout } from './plotGeometry.js'
import { shapePath } from './plotSymbols.js'
import { titleTotals } from './plotModel.js'
import { buildPatchSheetPath } from './patchRouting.js'

// SHEET 1 — the plot on paper (docs/architecture/RIG_BUILD.md §10). One SVG in
// millimetres, the size of the sheet (ISO 216 A3 or A4, landscape): the drawing at a
// true ISO 5455 scale inside a 10 mm border, the key and the title block in the
// right-hand column, a scale bar and north. The browser prints it at 100% (@page
// size set, margins 0), so 1 mm in the SVG is 1 mm on paper and the scale bar can be
// checked with a ruler. Sheets 2 and 3 are the patch sheet and the power sheet at
// /{space}/patch/{project}.

const PRINT_CSS = (sheet) => `
html.rigplot-printing, html.rigplot-printing body, html.rigplot-printing #root { position: static; margin: 0; height: auto; min-height: 100%; overflow: visible; background: #e9e8e4; }
.rigplot-print { padding: 16px; }
.rigplot-print__bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 auto 12px; max-width: ${sheet.w}mm; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.rigplot-print__bar button, .rigplot-print__bar a { font: inherit; color: #111; background: #fff; border: 1px solid #111; padding: 6px 10px; min-height: 32px; cursor: pointer; text-decoration: none; }
.rigplot-print__bar button[aria-pressed="true"] { background: #111; color: #fff; }
.rigplot-print__paper { display: block; margin: 0 auto; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.18); width: min(100%, ${sheet.w}mm); height: auto; }
@media print {
  @page { size: ${sheet.id} landscape; margin: 0; }
  html.rigplot-printing, html.rigplot-printing body { background: #fff; }
  .rigplot-print { padding: 0; }
  .rigplot-print__bar, .mode-mark { display: none !important; }
  .rigplot-print__paper { box-shadow: none; width: ${sheet.w}mm; height: ${sheet.h}mm; }
}
`

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

function North({ x, y, north }) {
    if (!north) return null
    // Plan x right, z down the sheet: north's direction on paper is (nx, nz).
    const a = (Math.atan2(north[1], north[0]) * 180) / Math.PI + 90
    return (
        <g transform={`translate(${x} ${y}) rotate(${a})`}>
            <circle r="5" fill="none" stroke="#111" strokeWidth="0.25" />
            <path d="M0,-4.6 L2,3 L0,1.6 L-2,3 Z" fill="#111" />
            <text y="-6" fontSize="2.4" textAnchor="middle" fontFamily={MONO} transform="rotate(0)">N</text>
        </g>
    )
}

export default function PlotPrint({ model, title, spaceId, projectId, extent: rigExtent, viewExtent = null, desk, onClose, version }) {
    const [size, setSize] = useState('A3')
    // What the sheet frames: the whole rig (an overall plot), or what was on the screen
    // when Print was pressed (a detail sheet — the booth at 1:50, say).
    const [frame, setFrame] = useState('rig')
    const extent = frame === 'view' && viewExtent ? viewExtent : rigExtent
    const sheet = SHEETS[size]
    const L = useMemo(() => sheetLayout(sheet), [sheet])
    const n = useMemo(() => chooseScale([extent[2] - extent[0], extent[3] - extent[1]], [L.drawing.w, L.drawing.h]), [extent, L])
    const k = 1000 / n // mm per metre
    const cx = (extent[0] + extent[2]) / 2
    const cz = (extent[1] + extent[3]) / 2
    const viewW = L.drawing.w / k
    const viewH = L.drawing.h / k
    const view = [cx - viewW / 2, cz - viewH / 2, viewW, viewH]
    const bar = scaleBar(n, L.side.w - 16)
    const t = titleTotals(model.sheet)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const patchUrl = `${origin}${buildPatchSheetPath(spaceId, projectId)}`
    const date = new Date().toISOString().slice(0, 10)

    useEffect(() => {
        const root = document.documentElement
        root.classList.add('rigplot-printing')
        const prev = document.title
        document.title = `${title} — lighting plot, sheet 1`
        return () => { root.classList.remove('rigplot-printing'); document.title = prev }
    }, [title])

    const { side } = L
    const keyRows = model.key
    const keyTop = side.y + 6
    const rowH = 5.2
    const tbH = 62
    const tbY = side.y + side.h - tbH
    const hiddenNote = 'Labels that would collide are left out; sheet 2 lists every fixture.'

    return (
        <div className="rigplot-print">
            <style>{PRINT_CSS(sheet)}</style>
            <div className="rigplot-print__bar">
                <button type="button" onClick={onClose}>back to the plot</button>
                <button type="button" aria-pressed={frame === 'rig'} onClick={() => setFrame('rig')}>whole rig</button>
                {viewExtent ? <button type="button" aria-pressed={frame === 'view'} onClick={() => setFrame('view')}>the view on screen</button> : null}
                {Object.keys(SHEETS).map((id) => <button key={id} type="button" aria-pressed={size === id} onClick={() => setSize(id)}>{id} landscape</button>)}
                <button type="button" onClick={() => window.print()}>print</button>
                <a href={buildPatchSheetPath(spaceId, projectId)}>sheets 2 and 3</a>
                <span>print at 100% (no “fit to page”), or the scale is not 1:{n}</span>
            </div>
            <svg className="rigplot-print__paper" viewBox={`0 0 ${sheet.w} ${sheet.h}`} width={`${sheet.w}mm`} height={`${sheet.h}mm`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Lighting plot, sheet 1, scale 1:${n}`}>
                <defs>
                    <clipPath id="rigplot-clip"><rect x={L.drawing.x} y={L.drawing.y} width={L.drawing.w} height={L.drawing.h} /></clipPath>
                </defs>
                <rect x="0" y="0" width={sheet.w} height={sheet.h} fill="#fff" />
                <rect x={L.frame.x} y={L.frame.y} width={L.frame.w} height={L.frame.h} fill="none" stroke="#111" strokeWidth="0.5" />
                <line x1={side.x} y1={side.y} x2={side.x} y2={side.y + side.h} stroke="#111" strokeWidth="0.35" />
                <g clipPath="url(#rigplot-clip)">
                    <g transform={`translate(${L.drawing.x} ${L.drawing.y}) scale(${k}) translate(${-view[0]} ${-view[1]})`}>
                        <PlotDrawing model={model} u={1 / k} sizes={PAPER_SIZES} view={view} idPrefix="print" />
                    </g>
                </g>

                {/* the key */}
                <g fontFamily={MONO} fontSize="2.3" fill="#111">
                    <text x={side.x + 4} y={keyTop} fontSize="2.6" fontWeight="700" letterSpacing="0.3">KEY</text>
                    {keyRows.map((row, i) => {
                        const y = keyTop + 5 + i * rowH
                        return (
                            <g key={row.type}>
                                <path d={shapePath(row.shape, side.x + 6.5, y - 0.8, 1.6)} fill={row.shape === 'bar' ? '#111' : '#fff'} stroke="#111" strokeWidth="0.22" />
                                {row.letter ? <text x={side.x + 6.5} y={y - 0.35} fontSize="1.5" textAnchor="middle">{row.letter}</text> : null}
                                <text x={side.x + 10.5} y={y}>{`${row.code} ×${row.n} · ${row.mode}`}</text>
                            </g>
                        )
                    })}
                    {(() => {
                        const y = keyTop + 5 + keyRows.length * rowH
                        return (
                            <g fontSize="1.9" fill="#333">
                                <rect x={side.x + 4.5} y={y - 2.6} width="4" height="4" fill="none" stroke="#111" strokeWidth="0.22" strokeDasharray="0.8 0.5" />
                                <text x={side.x + 10.5} y={y}>! conflict (dashed): see sheet 2</text>
                                <text x={side.x + 4} y={y + 5}>#41 = console fixture #</text>
                                <text x={side.x + 4} y={y + 8}>2.145 = universe.address</text>
                                <text x={side.x + 4} y={y + 11}>inside = unit # on its position</text>
                                <text x={side.x + 4} y={y + 14}>symbol = the hanging point</text>
                                <text x={side.x + 4} y={y + 17}>- - - overhead · ▨ machinery</text>
                                {hiddenNote.split('; ').map((line, i) => <text key={i} x={side.x + 4} y={y + 22 + i * 2.6} fontSize="1.7">{line}{i === 0 ? ';' : ''}</text>)}
                            </g>
                        )
                    })()}
                </g>

                {/* scale bar and north, above the title block */}
                <g fontFamily={MONO} fontSize="1.9" fill="#111">
                    <g transform={`translate(${side.x + 6} ${tbY - 16})`}>
                        {bar.ticks.slice(0, -1).map((tk, i) => (
                            <rect key={i} x={tk.at} y="0" width={bar.ticks[i + 1].at - tk.at} height="1.6" fill={i % 2 ? '#fff' : '#111'} stroke="#111" strokeWidth="0.2" />
                        ))}
                        {bar.ticks.map((tk) => <text key={tk.at} x={tk.at} y="4.6" textAnchor="middle">{tk.label}</text>)}
                        <text x={bar.mm + 3} y="1.6">m</text>
                        <text x="0" y="-2">{`scale 1:${n} on ${sheet.id} · the bar is ${bar.mm} mm`}</text>
                    </g>
                    <North x={side.x + side.w - 10} y={tbY - 22} north={model.venue?.north} />
                </g>

                {/* the title block */}
                <g fontFamily={MONO} fill="#111">
                    <rect x={side.x} y={tbY} width={side.w} height={tbH} fill="#fff" stroke="#111" strokeWidth="0.45" />
                    {[10, 18, 27, 36, 45, 54].map((dy) => <line key={dy} x1={side.x} x2={side.x + side.w} y1={tbY + dy} y2={tbY + dy} stroke="#111" strokeWidth="0.25" />)}
                    <line x1={side.x + side.w / 2} x2={side.x + side.w / 2} y1={tbY + 18} y2={tbY + tbH} stroke="#111" strokeWidth="0.25" />
                    <text x={side.x + 3} y={tbY + 6.6} fontSize="3.2" fontWeight="700">{`${title}`.slice(0, 34)}</text>
                    <text x={side.x + 3} y={tbY + 15} fontSize="2.3">{`${(model.venue?.name || 'no venue plan').slice(0, 44)}`}</text>
                    {[
                        [`scale 1:${n} · ${sheet.id}`, 'sheet 1 / 3 · plot'],
                        [t.channels.slice(0, 26), t.power],
                        [t.fixtures, t.circuits],
                        // A title block is fields; with no desk (every hosted tier) they say where the
                        // desk lives rather than a bare "none" (rigToolAccess.js NO_DESK_SENTENCE).
                        desk?.here ? [`desk ${desk.output || 'here'}`, `console in: ${desk.consoleIn || '…'}`] : ['desk: a local di.iiii only', 'console in: at that desk'],
                        [`rev · ${date}`, `doc v${version ?? '?'}`]
                    ].map(([a, b], i) => (
                        <g key={i} fontSize="2">
                            <text x={side.x + 3} y={tbY + 24 + i * 9 - (i ? 0 : 0.6)}>{a}</text>
                            <text x={side.x + side.w / 2 + 3} y={tbY + 24 + i * 9 - (i ? 0 : 0.6)}>{b}</text>
                        </g>
                    ))}
                </g>

                {/* the foot: where it came from and what it is not */}
                <g fontFamily={MONO} fontSize="1.7" fill="#444">
                    <text x={L.frame.x + 2} y={L.frame.y + L.frame.h + 4.2}>{`sheets 2 (patch) and 3 (power): ${patchUrl}`}</text>
                    <text x={L.frame.x + L.frame.w} y={L.frame.y + L.frame.h + 4.2} textAnchor="end">{`${(model.venue?.warning || '').slice(0, 60)} · symbols after USITT RP-2 · no load calculation is made or implied`}</text>
                    <text x={L.frame.x + 2} y={L.frame.y - 3}>{`${title} · lighting plot · from the project document · venue: ${(model.venue?.source || '—').slice(0, 80)}`}</text>
                </g>
            </svg>
        </div>
    )
}
