import { useMemo, useReducer } from 'react'
import { applyProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'

export const createProjectStoreState = ({
    document = null,
    version = 0
} = {}) => ({
    document: normalizeProjectDocument(document || {}),
    version: Number(version) || 0,
    selectedEntityId: null,
    selectedEntityIds: [],
    loading: false,
    loadError: null,
    activity: [],
    presenceState: 'disconnected',
    sceneStreamState: 'idle',
    sceneStreamError: null
})

export function projectStoreReducer(state, action) {
    switch (action.type) {
        case 'load-start':
            return {
                ...state,
                loading: true,
                loadError: null
            }
        case 'load-success':
            return {
                ...state,
                loading: false,
                loadError: null,
                version: Number(action.version) || 0,
                document: normalizeProjectDocument(action.document || {}),
                selectedEntityId: null,
                selectedEntityIds: []
            }
        case 'load-error':
            return {
                ...state,
                loading: false,
                loadError: action.error || 'Failed to load project.'
            }
        case 'apply-ops':
            return {
                ...state,
                version: Number.isFinite(action.version) ? action.version : state.version,
                document: applyProjectOps(state.document, action.ops || [])
            }
        case 'replace-document':
            return {
                ...state,
                version: Number.isFinite(action.version) ? action.version : state.version,
                document: normalizeProjectDocument(action.document || {})
            }
        case 'set-version':
            return {
                ...state,
                version: Number.isFinite(action.version) ? action.version : state.version
            }
        case 'select-entity':
            return {
                ...state,
                selectedEntityId: action.entityId || null,
                selectedEntityIds: action.entityId ? [action.entityId] : []
            }
        case 'toggle-entity-selection': {
            const id = action.entityId
            if (!id) return state
            const exists = state.selectedEntityIds.includes(id)
            const nextIds = exists
                ? state.selectedEntityIds.filter((entityId) => entityId !== id)
                : [...state.selectedEntityIds, id]
            return {
                ...state,
                selectedEntityIds: nextIds,
                selectedEntityId: exists ? (nextIds.at(-1) || null) : id
            }
        }
        case 'select-entities': {
            const nextIds = Array.isArray(action.entityIds) ? action.entityIds.filter(Boolean) : []
            return {
                ...state,
                selectedEntityIds: nextIds,
                selectedEntityId: nextIds.at(-1) || null
            }
        }
        case 'append-activity': {
            const nextEntry = {
                id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                level: action.level || 'info',
                message: action.message || '',
                timestamp: action.timestamp || Date.now()
            }
            return {
                ...state,
                activity: [nextEntry, ...state.activity].slice(0, 40)
            }
        }
        case 'presence-state':
            return {
                ...state,
                presenceState: action.value || 'disconnected'
            }
        case 'scene-stream-state':
            return {
                ...state,
                sceneStreamState: action.value || 'idle',
                sceneStreamError: action.error || null
            }
        default:
            return state
    }
}

export function useProjectStore(initialState) {
    const [state, dispatch] = useReducer(projectStoreReducer, initialState, createProjectStoreState)

    return useMemo(() => ({
        state,
        dispatch
    }), [state])
}
