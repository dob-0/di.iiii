import { useCallback, useEffect, useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Container,
    Grid,
    Stack,
    TextField,
    Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import {
    listServerSpaces,
    createServerSpace,
    deleteServerSpace
} from '../../services/serverSpaces.js'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { buildStudioHubPath, navigateToStudioPath } from '../utils/studioRouting.js'
import { appNavigate } from '../../utils/appNavigate.js'

const formatRelativeTime = (ts) => {
    if (!ts) return '—'
    const diff = Date.now() - new Date(ts).getTime()
    const min = 60 * 1000
    const hr = 60 * min
    const day = 24 * hr
    if (diff < min) return 'just now'
    if (diff < hr) return `${Math.floor(diff / min)} min ago`
    if (diff < day) return `${Math.floor(diff / hr)} h ago`
    return `${Math.floor(diff / day)} d ago`
}

export default function StudioSpacesHub() {
    const [spaces, setSpaces] = useState([])
    const [status, setStatus] = useState('Loading spaces...')
    const [isBusy, setIsBusy] = useState(false)
    const [newLabel, setNewLabel] = useState('')
    const [isPermanent, setIsPermanent] = useState(false)

    const loadSpaces = useCallback(async () => {
        setStatus('Loading spaces...')
        try {
            const list = await listServerSpaces()
            setSpaces(list)
            setStatus(list.length ? '' : 'No spaces yet.')
        } catch (err) {
            setStatus(err.message || 'Unable to load spaces.')
        }
    }, [])

    useEffect(() => { loadSpaces() }, [loadSpaces])

    const handleCreate = async () => {
        const label = newLabel.trim() || 'Untitled Space'
        setIsBusy(true)
        setStatus('Creating space...')
        try {
            const space = await createServerSpace({ label, slug: label, isPermanent })
            setNewLabel('')
            await loadSpaces()
            navigateToStudioPath(buildStudioHubPath(space.id))
        } catch (err) {
            setStatus(err.message || 'Unable to create space.')
        } finally {
            setIsBusy(false)
        }
    }

    const handleDelete = async (space) => {
        const confirmed = window.confirm(`Delete space "${space.label || space.id}"? This cannot be undone.`)
        if (!confirmed) return
        setIsBusy(true)
        setStatus(`Deleting ${space.label || space.id}...`)
        try {
            await deleteServerSpace(space.id)
            await loadSpaces()
            setStatus('Space deleted.')
        } catch (err) {
            setStatus(err.message || 'Unable to delete space.')
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <Box className="studio-shell-root studio-hub-root">
            <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
                <Stack spacing={3}>
                    <Stack
                        direction={{ xs: 'column', lg: 'row' }}
                        spacing={3}
                        justifyContent="space-between"
                        alignItems={{ xs: 'stretch', lg: 'flex-start' }}
                    >
                        <Stack spacing={1.25} sx={{ maxWidth: 560 }}>
                            <Chip label="All Spaces" color="primary" sx={{ alignSelf: 'flex-start' }} />
                            <Typography variant="h3" fontWeight={800}>Spaces</Typography>
                            <Typography variant="body1" color="text.secondary">
                                Each space is an isolated 3D scene with its own assets, projects, and public URL. Open a space in Studio to edit its content, or view it publicly.
                            </Typography>
                        </Stack>

                        <Stack
                            spacing={1.5}
                            sx={{
                                width: { xs: '100%', lg: 380 },
                                p: 2,
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                                bgcolor: 'rgba(255,255,255,0.03)'
                            }}
                        >
                            <Typography variant="subtitle2" color="text.secondary">New space</Typography>
                            <TextField
                                label="Space name"
                                size="small"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !isBusy) handleCreate() }}
                            />
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Button
                                    startIcon={<AddIcon />}
                                    variant="contained"
                                    onClick={handleCreate}
                                    disabled={isBusy}
                                    size="small"
                                >
                                    Create
                                </Button>
                                <Button
                                    variant={isPermanent ? 'outlined' : 'text'}
                                    color={isPermanent ? 'primary' : 'inherit'}
                                    size="small"
                                    onClick={() => setIsPermanent(p => !p)}
                                    title="Permanent spaces never expire. Temporary spaces are cleaned up after inactivity."
                                >
                                    {isPermanent ? 'Permanent' : 'Temporary'}
                                </Button>
                            </Stack>
                        </Stack>
                    </Stack>

                    {status ? (
                        <Alert severity={status.includes('Unable') ? 'error' : 'info'}>{status}</Alert>
                    ) : null}

                    <Grid container spacing={2}>
                        {spaces.map((space) => (
                            <Grid key={space.id} size={{ xs: 12, sm: 6, xl: 4 }}>
                                <Card
                                    sx={{
                                        height: '100%',
                                        cursor: 'pointer',
                                        transition: 'border-color 0.15s',
                                        '&:hover': { borderColor: 'primary.main' }
                                    }}
                                    variant="outlined"
                                    onClick={() => navigateToStudioPath(buildStudioHubPath(space.id))}
                                >
                                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minHeight: 180 }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                            <Typography variant="h6" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
                                                {space.label || space.id}
                                            </Typography>
                                            <ArrowForwardIcon color="primary" sx={{ flexShrink: 0, mt: 0.5 }} />
                                        </Stack>

                                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                            {space.id}
                                        </Typography>

                                        <Box sx={{ flex: 1 }} />

                                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                            <Chip
                                                size="small"
                                                label={space.permanent ? 'Permanent' : 'Temporary'}
                                                color={space.permanent ? 'default' : 'warning'}
                                                variant={space.permanent ? 'outlined' : 'filled'}
                                            />
                                            {space.publishedProjectId ? (
                                                <Chip size="small" label="Published" color="success" variant="filled" />
                                            ) : (
                                                <Chip size="small" label="No project" variant="outlined" />
                                            )}
                                            <Chip
                                                size="small"
                                                label={`Updated ${formatRelativeTime(space.updatedAt)}`}
                                                variant="outlined"
                                            />
                                        </Stack>

                                        <Stack direction="row" spacing={1} onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                size="small"
                                                variant="contained"
                                                onClick={() => navigateToStudioPath(buildStudioHubPath(space.id))}
                                            >
                                                Open Studio
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                endIcon={<OpenInNewIcon fontSize="small" />}
                                                onClick={() => appNavigate(buildAppSpacePath(space.id))}
                                            >
                                                View public
                                            </Button>
                                            {!space.permanent && (
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    color="error"
                                                    disabled={isBusy}
                                                    onClick={() => handleDelete(space)}
                                                >
                                                    Delete
                                                </Button>
                                            )}
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Stack>
            </Container>
        </Box>
    )
}
