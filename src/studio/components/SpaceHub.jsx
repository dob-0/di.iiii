import { useCallback, useEffect, useState } from 'react'
import { Box, Container } from '@mui/material'
import useAuthSession from '../../hooks/useAuthSession.js'
import {
    listServerSpaces,
    createServerSpace,
    updateServerSpace,
    deleteServerSpace,
    getServerConfig,
    patchServerConfig
} from '../../services/serverSpaces.js'
import { buildStudioHubPath, navigateToStudioPath } from '../utils/studioRouting.js'
import '../styles/studio-space-hub.css'

export default function SpaceHub() {
    const { authenticated, login } = useAuthSession()
    const [spaces, setSpaces] = useState([])
    const [status, setStatus] = useState('loading...')
    const [creatingTitle, setCreatingTitle] = useState(null)
    const [isBusy, setIsBusy] = useState(false)
    const [defaultSpaceId, setDefaultSpaceId] = useState(null)

    const loadSpaces = useCallback(async () => {
        setStatus('loading...')
        try {
            const [list, cfg] = await Promise.all([listServerSpaces(), getServerConfig()])
            setSpaces(list)
            setDefaultSpaceId(cfg.defaultSpaceId || null)
            setStatus('')
        } catch (e) {
            setStatus(e.message || 'error loading spaces')
        }
    }, [])

    useEffect(() => { loadSpaces() }, [loadSpaces])

    const openSpace = (spaceId) =>
        navigateToStudioPath(buildStudioHubPath(spaceId))

    const submitCreate = async (title) => {
        const name = title.trim()
        if (!name) return
        setCreatingTitle(null)
        setIsBusy(true)
        setStatus('creating...')
        try {
            const space = await createServerSpace({ label: name, isPermanent: true })
            await loadSpaces()
            navigateToStudioPath(buildStudioHubPath(space.id))
        } catch (e) {
            setStatus(e.message || 'error creating space')
            setIsBusy(false)
        }
    }

    const handleRename = useCallback(async (space, e) => {
        e.stopPropagation()
        const next = window.prompt('Rename space:', space.label || space.id)?.trim()
        if (!next || next === space.label) return
        try {
            await updateServerSpace(space.id, { label: next })
            await loadSpaces()
        } catch (err) {
            alert(err.message || 'Could not rename space.')
        }
    }, [loadSpaces])

    const handleDelete = useCallback(async (space, e) => {
        e.stopPropagation()
        if (!window.confirm(`Delete "${space.label || space.id}"? This cannot be undone.`)) return
        try {
            await deleteServerSpace(space.id)
            await loadSpaces()
        } catch (err) {
            alert(err.message || 'Could not delete space.')
        }
    }, [loadSpaces])

    const handleTogglePublic = useCallback(async (space, e) => {
        e.stopPropagation()
        try {
            await updateServerSpace(space.id, { isPublic: !space.isPublic })
            await loadSpaces()
        } catch (err) {
            alert(err.message || 'Could not update space.')
        }
    }, [loadSpaces])

    const handleSetMain = useCallback(async (space, e) => {
        e.stopPropagation()
        try {
            await patchServerConfig({ defaultSpaceId: space.id })
            setDefaultSpaceId(space.id)
        } catch (err) {
            alert(err.message || 'Could not set main space.')
        }
    }, [])

    return (
        <Box className="studio-shell-root ssh-root">
            <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
                <div className="ssh-top-row">
                    <div>
                        <p className="ssh-eyebrow">di.iiii</p>
                        <h1 className="ssh-title">Spaces</h1>
                    </div>
                    <div className="ssh-actions">
                        {authenticated ? (
                            creatingTitle === null ? (
                                <button
                                    className="ssh-btn-create"
                                    onClick={() => setCreatingTitle('')}
                                    disabled={isBusy}
                                >
                                    + Create
                                </button>
                            ) : (
                                <form
                                    className="ssh-new-form"
                                    onSubmit={e => { e.preventDefault(); submitCreate(creatingTitle) }}
                                >
                                    <input
                                        className="ssh-new-input"
                                        ref={el => el?.focus()}
                                        placeholder="Space name"
                                        value={creatingTitle}
                                        onChange={e => setCreatingTitle(e.target.value)}
                                        onKeyDown={e => e.key === 'Escape' && setCreatingTitle(null)}
                                    />
                                    <button className="ssh-btn-create" type="submit">Create</button>
                                    <button className="ssh-btn-cancel" type="button" onClick={() => setCreatingTitle(null)}>✕</button>
                                </form>
                            )
                        ) : (
                            <button className="ssh-btn-signin" onClick={login}>
                                Sign in to create
                            </button>
                        )}
                    </div>
                </div>

                {status && (
                    <p className={`ssh-status${status.includes('error') ? ' ssh-status-error' : ''}`}>
                        {status}
                    </p>
                )}

                {spaces.length > 0 && (
                    <div className="ssh-spaces-grid">
                        {spaces.map((space) => {
                            const isMain = space.id === defaultSpaceId
                            return (
                                <div
                                    key={space.id}
                                    className="ssh-space-card"
                                    onClick={() => openSpace(space.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => e.key === 'Enter' && openSpace(space.id)}
                                >
                                    <div className="ssh-card-header">
                                        <span className="ssh-space-id">{space.id}</span>
                                        {isMain && <span className="ssh-badge-main">Main</span>}
                                        {space.isPublic && !isMain && (
                                            <span className="ssh-badge-live">Live</span>
                                        )}
                                        {space.isPublic && isMain && (
                                            <span className="ssh-badge-live">Live</span>
                                        )}
                                    </div>
                                    <p className="ssh-space-label">{space.label || space.id}</p>

                                    {authenticated && (
                                        <div className="ssh-card-actions" onClick={e => e.stopPropagation()}>
                                            <button
                                                className="ssh-card-btn"
                                                title="Rename"
                                                onClick={e => handleRename(space, e)}
                                            >
                                                Rename
                                            </button>
                                            <button
                                                className={`ssh-card-btn${space.isPublic ? ' ssh-card-btn--active' : ''}`}
                                                title={space.isPublic ? 'Make private' : 'Make public'}
                                                onClick={e => handleTogglePublic(space, e)}
                                            >
                                                {space.isPublic ? 'Public' : 'Private'}
                                            </button>
                                            {!isMain && (
                                                <button
                                                    className="ssh-card-btn"
                                                    title="Set as main entry space"
                                                    onClick={e => handleSetMain(space, e)}
                                                >
                                                    Set main
                                                </button>
                                            )}
                                            <button
                                                className="ssh-card-btn ssh-card-btn--danger"
                                                title="Delete space"
                                                onClick={e => handleDelete(space, e)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </Container>
        </Box>
    )
}
