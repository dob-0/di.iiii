import { useCallback, useEffect, useState } from 'react'
import { Box, Container } from '@mui/material'
import useAuthSession from '../../hooks/useAuthSession.js'
import { listServerSpaces, createServerSpace } from '../../services/serverSpaces.js'
import { buildStudioHubPath, navigateToStudioPath } from '../utils/studioRouting.js'
import '../styles/studio-space-hub.css'

const DEMO_SPACE_ID = 'main'

export default function SpaceHub() {
    const { authenticated, login } = useAuthSession()
    const [spaces, setSpaces] = useState([])
    const [status, setStatus] = useState('loading...')
    const [creatingTitle, setCreatingTitle] = useState(null)
    const [isBusy, setIsBusy] = useState(false)

    const loadSpaces = useCallback(async () => {
        setStatus('loading...')
        try {
            const list = await listServerSpaces()
            setSpaces(list)
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
                        {spaces.map((space) => (
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
                                    {space.id === DEMO_SPACE_ID && (
                                        <span className="ssh-badge-demo">Demo</span>
                                    )}
                                    {space.isPublic && space.id !== DEMO_SPACE_ID && (
                                        <span className="ssh-badge-live">Live</span>
                                    )}
                                </div>
                                <p className="ssh-space-label">{space.label || space.id}</p>
                                {space.id === DEMO_SPACE_ID && (
                                    <p className="ssh-space-desc">Explore to see how it works</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Container>
        </Box>
    )
}
