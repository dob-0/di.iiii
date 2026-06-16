import { useCallback, useEffect, useMemo, useState } from 'react'
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
import UploadFileIcon from '@mui/icons-material/UploadFile'
import HistoryIcon from '@mui/icons-material/History'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { appNavigate } from '../../utils/appNavigate.js'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { buildPreferencesPath } from '../../utils/spaceRouting.js'
import { buildBetaHubPath } from '../../beta/utils/betaRouting.js'
import { importLegacySceneFile } from '../../project/import/importLegacyScene.js'
import {
    DEFAULT_PROJECT_SPACE_ID,
    createProject,
    deleteProject,
    listProjects,
    updateProjectDocument,
    uploadProjectAsset
} from '../../project/services/projectsApi.js'
import { getServerSpace, updateServerSpace } from '../../services/serverSpaces.js'
import { buildStudioProjectPath, buildStudioSpacesPath, navigateToStudioPath } from '../utils/studioRouting.js'

const formatProjectSourceLabel = (source = '') => {
    switch (source) {
        case 'studio-v3':
            return 'Studio Main'
        case 'legacy-import-studio':
            return 'Studio import'
        case 'beta-v2':
            return 'V2 Beta'
        case 'legacy-import':
            return 'Legacy import'
        case 'project':
        case '':
            return 'Project'
        default:
            return source
    }
}

const studioWorkflowSteps = [
    {
        title: 'Create or open a space',
        body: 'Use the spaces panel or admin route to create the server-backed space shell.'
    },
    {
        title: 'Develop in Studio',
        body: 'Create projects here, import legacy scenes, and keep the main working copy in this lane.'
    },
    {
        title: 'Promote when ready',
        body: 'Set the live project for the space and send viewers to the public route.'
    },
    {
        title: 'Use Beta for experiments',
        body: 'Hand off node-first or research changes to Beta before they become the stable path.'
    }
]

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
                source: 'legacy-import-studio'
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
                }
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

    const handleDeleteProject = async (project) => {
        if (!project?.id) return
        const confirmed = window.confirm(`Delete project "${project.title || project.id}"? This cannot be undone.`)
        if (!confirmed) return
        setIsBusy(true)
        setStatus(`Deleting ${project.title || project.id}...`)
        try {
            const spaceMeta = await getServerSpace(spaceId).catch(() => null)
            if (spaceMeta?.publishedProjectId === project.id) {
                await updateServerSpace(spaceId, { publishedProjectId: null })
            }
            await deleteProject(project.id)
            await loadProjects()
            setStatus('Project deleted.')
        } catch (error) {
            setStatus(error.message || 'Unable to delete project.')
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <Box className="studio-shell-root studio-hub-root">
            <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
                <Stack spacing={3}>
                    <Box>
                        <Button
                            size="small"
                            variant="text"
                            color="inherit"
                            sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                            onClick={() => navigateToStudioPath(buildStudioSpacesPath())}
                        >
                            ← All Spaces
                        </Button>
                    </Box>
                    <Stack
                        direction={{ xs: 'column', lg: 'row' }}
                        spacing={3}
                        justifyContent="space-between"
                        alignItems={{ xs: 'stretch', lg: 'flex-start' }}
                    >
                        <Stack spacing={1.25} sx={{ maxWidth: 720 }}>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip label="Stable Studio" color="primary" sx={{ alignSelf: 'flex-start' }} />
                                <Chip label={`Space ${spaceId}`} variant="outlined" sx={{ alignSelf: 'flex-start' }} />
                            </Stack>
                            <Typography variant="h3" fontWeight={800}>Studio Projects</Typography>
                            <Typography variant="body1" color="text.secondary">
                                Studio is the stable main authoring workspace for this space. Use it for project-based work, imports, publishing, and the primary long-term workflow.
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
                                    onClick={() => appNavigate(buildAppSpacePath(spaceId))}
                                >
                                    Open public route
                                </Button>
                                <Button
                                    variant="text"
                                    color="inherit"
                                    onClick={() => appNavigate(buildBetaHubPath(spaceId))}
                                >
                                    Open beta experimental
                                </Button>
                                <Button
                                    variant="text"
                                    color="inherit"
                                    onClick={() => appNavigate(buildPreferencesPath(spaceId))}
                                >
                                    Open admin
                                </Button>
                            </Stack>
                        </Stack>
                    </Stack>

                    <Card variant="outlined" sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                        <CardContent>
                            <Stack spacing={2}>
                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                                    <Typography variant="overline" color="text.secondary">Workflow</Typography>
                                    <Chip label="Space → Studio → Public" size="small" variant="outlined" />
                                </Stack>
                                <Grid container spacing={1.5}>
                                    {studioWorkflowSteps.map((step, index) => (
                                        <Grid key={step.title} size={{ xs: 12, md: 6, xl: 3 }}>
                                            <Stack
                                                spacing={1}
                                                sx={{
                                                    height: '100%',
                                                    p: 1.5,
                                                    border: '1px solid',
                                                    borderColor: 'divider',
                                                    borderRadius: 2,
                                                    bgcolor: index === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
                                                }}
                                            >
                                                <Typography variant="subtitle2" fontWeight={700}>{step.title}</Typography>
                                                <Typography variant="body2" color="text.secondary">{step.body}</Typography>
                                            </Stack>
                                        </Grid>
                                    ))}
                                </Grid>
                            </Stack>
                        </CardContent>
                    </Card>

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
                                        <Stack direction="row" spacing={1}>
                                            <Button
                                                size="small"
                                                variant="contained"
                                                onClick={() => openProject(project.id)}
                                            >
                                                Open
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                color="error"
                                                onClick={() => handleDeleteProject(project)}
                                            >
                                                Delete
                                            </Button>
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
