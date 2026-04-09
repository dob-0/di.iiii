import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { buildPreferencesPath } from '../../utils/spaceRouting.js'
import { buildBetaHubPath } from '../../beta/utils/betaRouting.js'
import { importLegacySceneFile } from '../../project/import/importLegacyScene.js'
import {
    DEFAULT_PROJECT_SPACE_ID,
    createProject,
    listProjects,
    updateProjectDocument,
    uploadProjectAsset
} from '../../project/services/projectsApi.js'
import { buildStudioProjectPath, navigateToStudioPath } from '../utils/studioRouting.js'

const detectEntityTypeFromMime = (mimeType = '') => {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.startsWith('model/')) return 'model'
    if (mimeType === 'application/octet-stream') return 'model'
    return null
}

const formatProjectSourceLabel = (source = '') => {
    switch (source) {
        case 'studio-v3':
            return 'Studio V3'
        case 'legacy-import-studio':
            return 'Studio import'
        case 'beta-v2':
            return 'Beta V2'
        case 'legacy-import':
            return 'Legacy import'
        case 'project':
        case '':
            return 'Project'
        default:
            return source
    }
}

export default function StudioHub({ spaceId = DEFAULT_PROJECT_SPACE_ID }) {
    const [projects, setProjects] = useState([])
    const [title, setTitle] = useState('Untitled Project')
    const [status, setStatus] = useState('Loading projects...')
    const [isBusy, setIsBusy] = useState(false)
    const [importWarnings, setImportWarnings] = useState([])

    const mostRecentProject = useMemo(() => projects[0] || null, [projects])

    const loadProjects = useCallback(async () => {
        setStatus('Loading projects...')
        try {
            const nextProjects = await listProjects(spaceId)
            setProjects(nextProjects)
            setStatus(nextProjects.length ? '' : 'No projects yet.')
        } catch (error) {
            setStatus(error.message || 'Unable to load projects.')
        }
    }, [spaceId])

    useEffect(() => {
        loadProjects()
    }, [loadProjects])

    const openProject = (projectId) => {
        navigateToStudioPath(buildStudioProjectPath(projectId, spaceId))
    }

    const handleCreate = async () => {
        setIsBusy(true)
        setStatus('Creating project...')
        try {
            const response = await createProject(spaceId, {
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
            const response = await createProject(spaceId, {
                title: document.projectMeta.title,
                slug: document.projectMeta.title,
                source: 'studio-v3'
            })
            const assetMap = new Map()
            for (const [assetId, assetFile] of assetFiles.entries()) {
                const uploaded = await uploadProjectAsset(response.project.id, assetFile, { assetId })
                assetMap.set(assetId, uploaded)
            }
            const nextDocument = {
                ...document,
                projectMeta: {
                    ...document.projectMeta,
                    id: response.project.id,
                    spaceId,
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
            await updateProjectDocument(response.project.id, nextDocument)
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
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip label="Main Studio" color="primary" sx={{ alignSelf: 'flex-start' }} />
                                <Chip label={`Space ${spaceId}`} variant="outlined" sx={{ alignSelf: 'flex-start' }} />
                            </Stack>
                            <Typography variant="h3" fontWeight={800}>Studio Projects</Typography>
                            <Typography variant="body1" color="text.secondary">
                                Studio is the main authoring workspace for this space. Use it for project-based work, imports, and the primary long-term workflow.
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
                                    onClick={() => navigateToStudioPath(buildStudioProjectPath(mostRecentProject.id, spaceId))}
                                    disabled={!mostRecentProject}
                                    startIcon={<HistoryIcon />}
                                >
                                    Reopen latest
                                </Button>
                                <Button
                                    variant="text"
                                    color="inherit"
                                    onClick={() => window.location.assign(buildAppSpacePath(spaceId))}
                                >
                                    Open public route
                                </Button>
                                <Button
                                    variant="text"
                                    color="inherit"
                                    onClick={() => window.location.assign(buildBetaHubPath(spaceId))}
                                >
                                    Open beta workspace
                                </Button>
                                <Button
                                    variant="text"
                                    color="inherit"
                                    onClick={() => window.location.assign(buildPreferencesPath(spaceId))}
                                >
                                    Open admin
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
                                                <Chip size="small" variant="outlined" label={formatProjectSourceLabel(project.source)} />
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
