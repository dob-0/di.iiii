import { useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Card,
    CardActionArea,
    CardContent,
    Chip,
    Container,
    Grid,
    Stack,
    TextField,
    Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import HistoryIcon from '@mui/icons-material/History'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { importLegacySceneFile } from '../../beta/import/importLegacyScene.js'
import {
    DEFAULT_BETA_SPACE_ID,
    createBetaProject,
    listBetaProjects,
    updateBetaProjectDocument,
    uploadBetaProjectAsset
} from '../../beta/services/projectsApi.js'
import { buildStudioProjectPath, navigateToStudioPath } from '../utils/studioRouting.js'

const detectEntityTypeFromMime = (mimeType = '') => {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.startsWith('model/')) return 'model'
    if (mimeType === 'application/octet-stream') return 'model'
    return null
}

export default function StudioHub() {
    const [projects, setProjects] = useState([])
    const [title, setTitle] = useState('Untitled Studio Project')
    const [status, setStatus] = useState('Loading projects...')
    const [isBusy, setIsBusy] = useState(false)
    const [importWarnings, setImportWarnings] = useState([])

    const mostRecentProject = useMemo(() => projects[0] || null, [projects])

    const loadProjects = async () => {
        setStatus('Loading projects...')
        try {
            const nextProjects = await listBetaProjects(DEFAULT_BETA_SPACE_ID)
            setProjects(nextProjects)
            setStatus(nextProjects.length ? '' : 'No projects yet.')
        } catch (error) {
            setStatus(error.message || 'Unable to load projects.')
        }
    }

    useEffect(() => {
        loadProjects()
    }, [])

    const openProject = (projectId) => {
        navigateToStudioPath(buildStudioProjectPath(projectId))
    }

    const handleCreate = async () => {
        setIsBusy(true)
        setStatus('Creating project...')
        try {
            const response = await createBetaProject(DEFAULT_BETA_SPACE_ID, {
                title,
                slug: title,
                source: 'studio-v3'
            })
            openProject(response.project.id)
        } catch (error) {
            setStatus(error.message || 'Unable to create project.')
        } finally {
            setIsBusy(false)
        }
    }

    const handleImportLegacy = async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        setIsBusy(true)
        setImportWarnings([])
        setStatus(`Importing ${file.name}...`)
        try {
            const { document, assetFiles, warnings } = await importLegacySceneFile(file)
            const response = await createBetaProject(DEFAULT_BETA_SPACE_ID, {
                title: document.projectMeta.title,
                slug: document.projectMeta.title,
                source: 'studio-v3'
            })
            const assetMap = new Map()
            for (const [assetId, assetFile] of assetFiles.entries()) {
                const uploaded = await uploadBetaProjectAsset(response.project.id, assetFile, { assetId })
                assetMap.set(assetId, uploaded)
            }
            const nextDocument = {
                ...document,
                projectMeta: {
                    ...document.projectMeta,
                    id: response.project.id,
                    spaceId: DEFAULT_BETA_SPACE_ID,
                    source: 'legacy-import-studio'
                },
                assets: document.assets.map((asset) => assetMap.get(asset.id) || asset),
                entities: document.entities.map((entity) => {
                    const uploaded = assetMap.get(entity.components?.media?.assetId)
                    if (!uploaded) return entity
                    const nextType = detectEntityTypeFromMime(uploaded.mimeType)
                    return {
                        ...entity,
                        type: nextType || entity.type
                    }
                })
            }
            await updateBetaProjectDocument(response.project.id, nextDocument)
            setImportWarnings(warnings)
            openProject(response.project.id)
        } catch (error) {
            setStatus(error.message || 'Unable to import legacy scene.')
        } finally {
            setIsBusy(false)
            event.target.value = ''
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
                        <Stack spacing={1.25} sx={{ maxWidth: 720 }}>
                            <Chip label="Studio V3" color="primary" sx={{ alignSelf: 'flex-start' }} />
                            <Typography variant="h3" fontWeight={800}>Projects</Typography>
                            <Typography variant="body1" color="text.secondary">
                                Create, reopen, import, and keep moving.
                            </Typography>
                        </Stack>
                        <Stack
                            spacing={1.5}
                            sx={{
                                width: { xs: '100%', lg: 420 },
                                p: 2,
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                                bgcolor: 'rgba(255,255,255,0.03)'
                            }}
                        >
                            <TextField
                                label="Project title"
                                size="small"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                            />
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                                <Button
                                    startIcon={<AddIcon />}
                                    variant="contained"
                                    onClick={handleCreate}
                                    disabled={isBusy}
                                >
                                    New project
                                </Button>
                                <Button
                                    component="label"
                                    startIcon={<UploadFileIcon />}
                                    variant="outlined"
                                    disabled={isBusy}
                                >
                                    Import legacy scene
                                    <input
                                        hidden
                                        type="file"
                                        accept=".zip,.json,application/zip,application/json"
                                        onChange={handleImportLegacy}
                                    />
                                </Button>
                            </Stack>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                                <Button
                                    variant="text"
                                    color="inherit"
                                    onClick={() => navigateToStudioPath(buildStudioProjectPath(mostRecentProject.id))}
                                    disabled={!mostRecentProject}
                                    startIcon={<HistoryIcon />}
                                >
                                    Reopen latest
                                </Button>
                                <Button
                                    variant="text"
                                    color="inherit"
                                    onClick={() => window.location.assign(buildAppSpacePath(DEFAULT_BETA_SPACE_ID))}
                                >
                                    Legacy editor
                                </Button>
                            </Stack>
                        </Stack>
                    </Stack>

                    {status ? <Alert severity={status.includes('Unable') ? 'error' : 'info'}>{status}</Alert> : null}
                    {importWarnings.length ? (
                        <Alert severity="warning">
                            {importWarnings.join(' ')}
                        </Alert>
                    ) : null}

                    <Grid container spacing={2}>
                        {projects.map((project) => (
                            <Grid key={project.id} size={{ xs: 12, md: 6, xl: 4 }}>
                                <Card sx={{ height: '100%' }}>
                                    <CardActionArea onClick={() => openProject(project.id)} sx={{ height: '100%' }}>
                                        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 190 }}>
                                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                                                <Typography variant="h6" fontWeight={700}>{project.title}</Typography>
                                                <ArrowForwardIcon color="primary" />
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                                                {project.id}
                                            </Typography>
                                            <Box sx={{ flex: 1 }} />
                                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                <Chip size="small" label={`Updated ${new Date(project.updatedAt || Date.now()).toLocaleDateString()}`} />
                                                <Chip size="small" variant="outlined" label={project.source || 'beta-v2'} />
                                            </Stack>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Stack>
            </Container>
        </Box>
    )
}
