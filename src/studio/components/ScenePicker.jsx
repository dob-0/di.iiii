import { scenesOf } from '../utils/scenesOf.js'
import { laserUnitsOf } from '../utils/laserTest.js'
import { Fragment, useState } from 'react'
import SceneEditor from './SceneEditor.jsx'
import { newSceneOps, duplicateSceneOps, deleteSceneOps, moveSceneOps } from '../utils/sceneEdit.js'
import useRememberedOpen from '../../utils/rememberedOpen.js'

// SCENES in the Studio, open by default (a work tool the owner asked for open; the visitors' view page starts clear, owner 2026-10-13
// 20:21) and a fold is remembered for this viewer only (rememberedOpen.js). Owner 2026-10-13 15:5x: "by default make that I can select in
// edit mode — I can't select a light show and understand how the light will be"). Until now the Studio
// followed the show clock and offered no choice. A click shows that scene's light in the viewport while
// you edit (StudioViewport `rigLook` → useRigLookEntities explicit); "Follow the show" goes back to the
// clock, "Work light" draws no look. Each row: the scene's name and, under it, one line that says what
// it is from the floor (the rig look's intent).
//
// In the Studio's own chrome (owner 2026-10-13 16:3x: "make it suit the Studio style"): it is drawn
// with the classes of the Objects window, no inline styles — the shell, header, title and fold button
// (sfp-*, scc-collapse-btn), the cluster's buttons (scc-btn) and the Objects list's rows (spa-list /
// spa-item). Only its geometry is its own (.scene-picker in studio.css): docked bottom-left above the
// 44 px strip that holds the view label, the mode chip and the tree chip. Rectangles; targets ≥ 32 px.
//
// LASER TEST (owner 2026-10-13 20:5x), a work tool beside the scenes, shown when the project has laser lines: while on, every
// laser unit draws its whole scan field as a square on the real surfaces, labelled with its metres (LaserTest.jsx). A
// button of the Studio's own (scc-btn), nothing written to the project.
//
// EDIT (2026-10-15, SceneEditor.jsx): where `onApplyOps` is given, each row has an Edit button that opens the scene's editor under it,
// and the header offers New / Duplicate / Delete / ↑ / ↓ for the scene being edited (the cue list order).
export default function ScenePicker({ document, current, onPick, laserTest = false, onLaserTest = null, onApplyOps = null, onPlay = null }) {
    const [open, toggleOpen] = useRememberedOpen('studio-scenes', true)
    const [editing, setEditing] = useState(null)
    const scenes = scenesOf(document)
    const hasLasers = Boolean(onLaserTest) && laserUnitsOf(document?.entities).size > 0
    if (!scenes.length && !hasLasers) return null
    const following = current === undefined
    const workLight = current === ''
    return (
        <div role="region" aria-label="Scenes" data-testid="studio-scene-picker" className={`sfp-shell scene-picker${editing ? ' scene-picker--editing' : ''}${onApplyOps ? ' scene-picker--editable' : ''}`}>
            <div className="sfp-header">
                <span className="sfp-title">SCENES · {scenes.length}</span>
                <button
                    type="button"
                    className="scc-collapse-btn"
                    aria-expanded={open}
                    aria-label={open ? 'fold' : 'open'}
                    title={open ? 'Fold the scene list' : 'Open the scene list'}
                    onClick={toggleOpen}
                >
                    {open ? '▾' : '▸'}
                </button>
            </div>
            {open && (
                <div className="sfp-content">
                    <div className="scc-section">
                        <div className="scc-buttons">
                            <button
                                type="button"
                                className={`scc-btn ${following ? 'active' : ''}`}
                                aria-pressed={following}
                                title="The light changes with the show's clock, as visitors see it"
                                onClick={() => onPick?.(undefined)}
                            >
                                Follow the show
                            </button>
                            <button
                                type="button"
                                className={`scc-btn ${workLight ? 'active' : ''}`}
                                aria-pressed={workLight}
                                title="No scene: plain light to work by"
                                onClick={() => onPick?.('')}
                            >
                                Work light
                            </button>
                            {onApplyOps && (
                                <button type="button" className="scc-btn" title="A new, dark scene at the end of the list" onClick={() => {
                                    const made = newSceneOps(document)
                                    onApplyOps(made.ops)
                                    if (made.lookId) setEditing(`cue-${made.lookId}`)
                                }}>New scene</button>
                            )}
                            {onApplyOps && editing && (<>
                                <button type="button" className="scc-btn" onClick={() => { const made = duplicateSceneOps(document, editing); onApplyOps(made.ops); if (made.lookId) setEditing(made.ops[1]?.payload?.cue?.id || null) }}>Duplicate</button>
                                <button type="button" className="scc-btn" onClick={() => { onApplyOps(deleteSceneOps(document, editing)); setEditing(null) }}>Delete</button>
                                <button type="button" className="scc-btn" aria-label="Move up" onClick={() => onApplyOps(moveSceneOps(document, editing, -1))}>↑</button>
                                <button type="button" className="scc-btn" aria-label="Move down" onClick={() => onApplyOps(moveSceneOps(document, editing, 1))}>↓</button>
                            </>)}
                            {hasLasers && (
                                <button
                                    type="button"
                                    className={`scc-btn ${laserTest ? 'active' : ''}`}
                                    aria-pressed={laserTest}
                                    title="Draw each laser's whole scan field as a square on the walls, with its width, height and distance in metres. Nothing is saved"
                                    onClick={() => onLaserTest(!laserTest)}
                                >
                                    Laser test
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="scc-section">
                        <div className="spa-list">
                            {scenes.map((s) => {
                                const active = current === s.lookId
                                return (
                                    <Fragment key={s.cueId}>
                                        <button
                                            type="button"
                                            className={`spa-item ${active ? 'active' : ''}`}
                                            aria-pressed={active}
                                            title={s.title}
                                            onClick={() => onPick?.(s.lookId)}
                                        >
                                            <span className="scene-picker__text">
                                                <span className="spa-name">{s.name}</span>
                                                {s.intent && <span className="scene-picker__intent">{s.intent}</span>}
                                            </span>
                                        </button>
                                        {onApplyOps && (
                                            <button type="button" className={`scc-btn ${editing === s.cueId ? 'active' : ''}`} aria-expanded={editing === s.cueId} aria-label={`Edit ${s.name}`} onClick={() => setEditing(editing === s.cueId ? null : s.cueId)}>Edit</button>
                                        )}
                                        {onApplyOps && editing === s.cueId && (
                                            <SceneEditor document={document} scene={s} onApplyOps={onApplyOps} onPlay={onPlay} onClose={() => setEditing(null)} />
                                        )}
                                    </Fragment>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
