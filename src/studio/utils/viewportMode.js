// What the Studio viewport shows: the Scene (3D room) or the project's Code page.
//
// The stored `presentationState.mode` defaults to 'scene' for every document, so a
// project that is a web page opened the empty 3D grid in Studio while the public
// view (shared/openingView.js, #1153) already opened its page. Studio now decides
// the same way. Rules, in order:
//   1. a stored mode other than 'scene' ('code', 'fixed-camera') is kept as stored;
//   2. a choice the person made with the Code window's toggle this session is kept
//      (a stored 'scene' cannot be told from the default, so the choice is held here);
//   3. the project opens as code when resolveOpeningView says code, or when the
//      address asked for the Code window (?open=files, the "Write code" door) and the
//      project holds no scene;
//   4. otherwise the scene, as before.
import { useSyncExternalStore } from 'react'
import { holdsScene, resolveOpeningView } from '../../shared/openingView.js'
import { panelFromAddress } from '../hooks/useStudioPanelState.js'

export const resolveViewportMode = (document, { choice = null, asked = null } = {}) => {
    const stored = document?.presentationState?.mode
    if (stored && stored !== 'scene') return stored
    if (choice === 'scene' || choice === 'code') return choice
    if (resolveOpeningView(document) === 'code') return 'code'
    if (asked === 'files' && !holdsScene(document)) return 'code'
    return 'scene'
}

// The person's own toggle choice, per project, for this page. Not saved anywhere.
const choices = new Map()
const listeners = new Set()
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

export const setViewportChoice = (projectId, mode) => {
    if (!projectId) return
    if (choices.get(projectId) === mode) return
    choices.set(projectId, mode)
    listeners.forEach((fn) => fn())
}

export const clearViewportChoices = () => {
    choices.clear()
    listeners.forEach((fn) => fn())
}

export function useViewportMode(document) {
    const projectId = document?.projectMeta?.id
    const choice = useSyncExternalStore(subscribe, () => choices.get(projectId) ?? null, () => null)
    const asked = typeof window !== 'undefined' ? panelFromAddress(window.location.search) : null
    return resolveViewportMode(document, { choice, asked })
}
