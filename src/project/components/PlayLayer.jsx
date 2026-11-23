import { Suspense, useLayoutEffect, useState } from 'react'
import PublicProjectSceneSurface from './PublicProjectSceneSurface.jsx'
import { makePlayCopy } from '../play/playCopy.js'
import { holdPlaying } from '../play/playingFlag.js'
import './playLayer.css'

// Height of the PLAYING bar: the touch target (44 px), so the walk's title line and exit start under it.
export const PLAY_BAR_CLEAR = 'var(--di-touch-target, 44px)'

// PLAY (Studio and Make): the project walked as a visitor walks it, over the editor, on a COPY of the document.
// It is the SAME walk as the view page: PublicProjectSceneSurface in navMode 'walk' (LiveProjectScene's walker, the project's
// node graph beside it through WalkGraphLayer / useWalkGraph — slice G). Nothing here is a second runtime.
//   start point  the walker appears where worldState.spawn says (LiveProjectScene, "Data-driven arrival"); none = its default.
//   on a copy    the document is cloned when Play starts (play/playCopy.js); the editor's own document is never handed in.
//   Fly          hidden in Play (walkModeControls false): a game is walked; Fly stays in the editor's own walk. Escape and Stop both end Play.
//   Stop         unmounts this layer. The editor under it was never unmounted, so its camera, selection and panels are as left.
// `words` (optional): { playing, stop } as { hy, en } — Make says both languages, Armenian first (make/makeVocabulary.js); Studio is English.
export default function PlayLayer({ document, onStop, words = null }) {
    const [copy] = useState(() => makePlayCopy(document))
    // The shared playing flag: the editor's key handlers stand down while this layer is mounted (play/playingFlag.js).
    useLayoutEffect(() => holdPlaying(), [])
    if (!copy) return null
    return (
        <div className="play-layer" data-play-layer>
            <div className="play-bar" role="status">
                <span className="play-bar-state">{words?.playing ? `${words.playing.hy} · ${words.playing.en}` : 'Playing'}</span>
                <span className="play-bar-note">Nothing you do while playing is saved. Esc or Stop ends it.</span>
                <button type="button" className="play-stop" onClick={onStop}>{words?.stop ? `${words.stop.hy} · ${words.stop.en} ■` : 'Stop ■'}</button>
            </div>
            <Suspense fallback={null}>
                <PublicProjectSceneSurface
                    projectId={copy.projectMeta?.id}
                    spaceId={copy.projectMeta?.spaceId || null}
                    document={copy}
                    walkDocument={copy}
                    title={copy.projectMeta?.title || ''}
                    entryView="scene"
                    navMode="walk"
                    walkLook="drag"
                    onNavModeChange={(mode) => { if (mode !== 'walk') onStop() }}
                    topClear={PLAY_BAR_CLEAR}
                    walkModeControls={false}
                    isPreview={false}
                />
            </Suspense>
        </div>
    )
}
