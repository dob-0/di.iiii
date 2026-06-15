import { useRef, useState } from 'react'
import JSZip from 'jszip'
import {
    Box,
    Button,
    Card,
    Dialog,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    IconButton,
    InputAdornment,
    InputLabel,
    List,
    ListItemButton,
    ListItemText,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DownloadIcon from '@mui/icons-material/Download'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import ShareIcon from '@mui/icons-material/Share'
import SmartphoneIcon from '@mui/icons-material/Smartphone'
import ViewInArIcon from '@mui/icons-material/ViewInAr'
import { presentationStarterTemplates } from '../../utils/presentationTemplates.js'
import {
    bundleCodeFiles,
    fileLanguage,
    isSupportedFile,
    normalizeFileName,
    SUPPORTED_EXTENSIONS
} from '../../utils/codeFilesBundle.js'

const formatTimestamp = (value) => {
    if (!value) return 'Not yet'
    try {
        return new Date(value).toLocaleString()
    } catch {
        return String(value)
    }
}

const assetTypeLabel = (mimeType = '') => {
    const topLevel = mimeType.split('/')[0]
    if (!topLevel) return 'asset'
    return topLevel
}

export function PanelHeader({ title, onClose, action = null }) {
    return (
        <Stack
            direction="row"
            spacing={1}
            justifyContent="space-between"
            alignItems="center"
            sx={{ px: 2, py: 1.5 }}
        >
            <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
                {action}
                {onClose ? (
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                ) : null}
            </Stack>
        </Stack>
    )
}

export function LibraryPanel({ onCreateEntity, onAssetFilesSelected, canDeleteSelection, onDeleteSelected }) {
    const types = ['box', 'sphere', 'cone', 'cylinder', 'text']
    return (
        <Stack spacing={2} sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
                Add primitives, text, and media.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {types.map((type) => (
                    <Button key={type} variant="outlined" size="small" onClick={() => onCreateEntity(type)}>
                        {type}
                    </Button>
                ))}
            </Stack>
            <Button component="label" variant="contained" startIcon={<AddPhotoAlternateIcon />}>
                Import assets
                <input hidden type="file" multiple onChange={onAssetFilesSelected} />
            </Button>
            <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteOutlineIcon />}
                disabled={!canDeleteSelection}
                onClick={onDeleteSelected}
            >
                Delete selected
            </Button>
        </Stack>
    )
}

export function AssetsPanel({ assets = [], onAssetFilesSelected, onCreateFromAsset }) {
    return (
        <Stack spacing={1.5} sx={{ p: 2 }}>
            <Button component="label" variant="contained" startIcon={<AddPhotoAlternateIcon />}>
                Import assets
                <input hidden type="file" multiple onChange={onAssetFilesSelected} />
            </Button>
            <List dense disablePadding sx={{ display: 'grid', gap: 1 }}>
                {assets.length ? assets.map((asset) => (
                    <Paper key={asset.id} variant="outlined">
                        <ListItemButton onClick={() => onCreateFromAsset(asset)}>
                            <ListItemText
                                primary={asset.name}
                                secondary={`${assetTypeLabel(asset.mimeType)} • ${asset.mimeType}`}
                            />
                        </ListItemButton>
                    </Paper>
                )) : (
                    <Card variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                            No assets yet.
                        </Typography>
                    </Card>
                )}
            </List>
        </Stack>
    )
}

export function StructurePanel({ entities = [], selectedEntityId, onSelectEntity }) {
    return (
        <List dense disablePadding sx={{ p: 2, display: 'grid', gap: 1 }}>
            {entities.length ? entities.map((entity) => (
                <Paper key={entity.id} variant="outlined">
                    <ListItemButton
                        selected={entity.id === selectedEntityId}
                        onClick={() => onSelectEntity(entity.id)}
                    >
                        <ListItemText primary={entity.name} secondary={entity.type} />
                    </ListItemButton>
                </Paper>
            )) : (
                <Card variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        No entities yet.
                    </Typography>
                </Card>
            )}
        </List>
    )
}

export function ProjectPanel({
    document,
    displayName,
    onDisplayNameChange,
    onProjectMetaPatch,
    onWorldPatch,
    onOpenHub
}) {
    return (
        <Stack spacing={2} sx={{ p: 2 }}>
            <TextField
                label="Display name"
                size="small"
                value={displayName}
                onChange={(event) => onDisplayNameChange(event.target.value)}
            />
            <TextField
                label="Project title"
                size="small"
                value={document.projectMeta?.title || ''}
                onChange={(event) => onProjectMetaPatch({ title: event.target.value })}
            />
            <Stack direction="row" spacing={1.5} alignItems="center">
                <Typography variant="body2" color="text.secondary">Background</Typography>
                <TextField
                    size="small"
                    type="color"
                    value={document.worldState?.backgroundColor || '#0a1118'}
                    onChange={(event) => onWorldPatch({ backgroundColor: event.target.value })}
                    inputProps={{ 'aria-label': 'Background color' }}
                />
            </Stack>
            <FormControlLabel
                control={(
                    <Switch
                        checked={document.worldState?.gridVisible !== false}
                        onChange={(event) => onWorldPatch({ gridVisible: event.target.checked })}
                    />
                )}
                label="Grid visible"
            />
            <Button variant="text" color="inherit" onClick={onOpenHub}>
                Back to projects
            </Button>
        </Stack>
    )
}

export function ActivityPanel({ activity = [] }) {
    return (
        <Stack spacing={1.25} sx={{ p: 2 }}>
            {activity.length ? activity.map((entry) => (
                <Paper key={entry.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Typography variant="subtitle2" textTransform="capitalize">{entry.level}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {formatTimestamp(entry.timestamp)}
                        </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">{entry.message}</Typography>
                </Paper>
            )) : (
                <Card variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        No project activity yet.
                    </Typography>
                </Card>
            )}
        </Stack>
    )
}

export function PresentPanel({
    presentationState,
    onPresentationPatch,
    onSaveCurrentCamera,
    onUseCurrentCameraAsFixed
}) {
    const singleFileInputRef = useRef(null)
    const zipInputRef = useRef(null)
    const folderInputRef = useRef(null)
    const [activeFileName, setActiveFileName] = useState('index.html')
    const [showAddFile, setShowAddFile] = useState(false)
    const [newFileName, setNewFileName] = useState('')

    const isCodeMode = (presentationState.mode || 'scene') === 'code'
    const isUrlSource = (presentationState.codeSourceType || 'html') === 'url'
    const files = presentationState.codeFiles || []
    const codeUrl = presentationState.codeUrl || ''
    const hasLegacyHtml = Boolean(presentationState.codeHtml && files.length === 0)
    const activeFile = files.find((f) => f.name === activeFileName) || files[0] || null

    const setFiles = (nextFiles) => onPresentationPatch({ codeFiles: nextFiles })

    const updateActiveContent = (content) => {
        const name = activeFile?.name
        if (!name) return
        setFiles(files.map((f) => (f.name === name ? { ...f, content } : f)))
    }

    const addFile = () => {
        const name = newFileName.trim()
        if (!name || files.find((f) => f.name === name)) return
        setFiles([...files, { name, content: '' }])
        setActiveFileName(name)
        setNewFileName('')
        setShowAddFile(false)
    }

    const removeFile = (name) => {
        const next = files.filter((f) => f.name !== name)
        setFiles(next)
        if (activeFileName === name) setActiveFileName(next[0]?.name || '')
    }

    const handleImportSingle = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        const content = await file.text()
        const name = normalizeFileName(file.name)
        const existing = files.find((f) => f.name === name)
        if (existing) {
            setFiles(files.map((f) => (f.name === name ? { ...f, content } : f)))
        } else {
            setFiles([...files, { name, content }])
        }
        setActiveFileName(name)
    }

    const handleImportZip = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        try {
            const zip = await JSZip.loadAsync(file)
            const entries = []
            zip.forEach((relativePath, entry) => {
                if (!entry.dir && isSupportedFile(relativePath)) entries.push({ relativePath, entry })
            })
            const loaded = await Promise.all(
                entries.map(async ({ relativePath, entry }) => ({
                    name: normalizeFileName(relativePath),
                    content: await entry.async('text')
                }))
            )
            if (loaded.length > 0) {
                setFiles(loaded)
                const root = loaded.find((f) => f.name === 'index.html') || loaded[0]
                setActiveFileName(root.name)
            }
        } catch {
            // ignore malformed zips
        }
    }

    const handleImportFolder = async (event) => {
        const fileList = Array.from(event.target.files || [])
        event.target.value = ''
        if (!fileList.length) return
        const loaded = await Promise.all(
            fileList
                .filter((f) => isSupportedFile(f.name))
                .map(async (f) => ({
                    name: normalizeFileName(f.webkitRelativePath || f.name),
                    content: await f.text()
                }))
        )
        if (loaded.length > 0) {
            setFiles(loaded)
            const root = loaded.find((f) => f.name.endsWith('index.html')) || loaded[0]
            setActiveFileName(root.name)
        }
    }

    const handleExportZip = async () => {
        if (files.length === 0) return
        const zip = new JSZip()
        for (const f of files) zip.file(f.name, f.content)
        const blob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'project.zip'
        a.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    }

    const handleOpenPreview = () => {
        if (files.length === 0) return
        const bundled = bundleCodeFiles(files)
        if (!bundled) return
        const url = URL.createObjectURL(new Blob([bundled], { type: 'text/html' }))
        window.open(url, '_blank', 'noopener,noreferrer')
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }

    const handleMigrateLegacy = () => {
        const nextFiles = [{ name: 'index.html', content: presentationState.codeHtml }]
        onPresentationPatch({ codeFiles: nextFiles, codeHtml: '' })
        setActiveFileName('index.html')
    }

    const applyTemplate = (template) => {
        const nextFiles = [{ name: 'index.html', content: template.html }]
        onPresentationPatch({ codeFiles: nextFiles, codeSourceType: 'html' })
        setActiveFileName('index.html')
    }

    return (
        <Stack spacing={2} sx={{ p: 2 }}>
            <FormControl fullWidth size="small">
                <InputLabel>Studio preview</InputLabel>
                <Select
                    label="Studio preview"
                    value={presentationState.mode || 'scene'}
                    onChange={(event) => onPresentationPatch({ mode: event.target.value })}
                >
                    <MenuItem value="scene">3D scene</MenuItem>
                    <MenuItem value="fixed-camera">Fixed camera</MenuItem>
                    <MenuItem value="code">Code view</MenuItem>
                </Select>
            </FormControl>
            <FormControl fullWidth size="small">
                <InputLabel>Public entry view</InputLabel>
                <Select
                    label="Public entry view"
                    value={presentationState.entryView || 'scene'}
                    onChange={(event) => onPresentationPatch({ entryView: event.target.value })}
                >
                    <MenuItem value="scene">3D scene</MenuItem>
                    <MenuItem value="fixed-camera">Fixed camera</MenuItem>
                    <MenuItem value="code">Code view</MenuItem>
                </Select>
            </FormControl>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={onSaveCurrentCamera}>Save current view</Button>
                <Button variant="contained" onClick={onUseCurrentCameraAsFixed}>Use current camera</Button>
            </Stack>

            {isCodeMode && (
                <Stack spacing={1.5}>
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={isUrlSource ? 'url' : 'files'}
                        onChange={(_, value) => { if (value) onPresentationPatch({ codeSourceType: value === 'url' ? 'url' : 'html' }) }}
                    >
                        <ToggleButton value="files">Files</ToggleButton>
                        <ToggleButton value="url">Public Link</ToggleButton>
                    </ToggleButtonGroup>

                    {isUrlSource ? (
                        <TextField
                            size="small"
                            label="Preview URL"
                            placeholder="https://example.com"
                            type="url"
                            value={codeUrl}
                            onChange={(event) => onPresentationPatch({ codeUrl: event.target.value })}
                            helperText="Point the space at an external page, prototype, or published microsite."
                        />
                    ) : files.length === 0 ? (
                        <Stack spacing={1.5}>
                            {hasLegacyHtml && (
                                <Card variant="outlined" sx={{ p: 1.5 }}>
                                    <Stack spacing={1}>
                                        <Typography variant="body2">You have existing HTML — convert it to a file project?</Typography>
                                        <Button size="small" variant="contained" onClick={handleMigrateLegacy}>
                                            Convert to index.html
                                        </Button>
                                    </Stack>
                                </Card>
                            )}
                            <Typography variant="caption" color="text.secondary">Start from a template</Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1 }}>
                                {presentationStarterTemplates.map((template) => (
                                    <Paper
                                        key={template.id}
                                        variant="outlined"
                                        onClick={() => applyTemplate(template)}
                                        sx={{ p: 1, cursor: 'pointer', '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' } }}
                                    >
                                        <Typography variant="caption" color="text.secondary" display="block">{template.eyebrow}</Typography>
                                        <Typography variant="body2" fontWeight={600}>{template.name}</Typography>
                                    </Paper>
                                ))}
                            </Box>
                            <Typography variant="caption" color="text.secondary">Or import existing files</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Button size="small" variant="outlined" startIcon={<FileUploadIcon />} onClick={() => singleFileInputRef.current?.click()}>
                                    Import file
                                </Button>
                                <Button size="small" variant="outlined" startIcon={<FileUploadIcon />} onClick={() => zipInputRef.current?.click()}>
                                    Import .zip
                                </Button>
                                <Button size="small" variant="outlined" startIcon={<FolderOpenIcon />} onClick={() => folderInputRef.current?.click()}>
                                    Import folder
                                </Button>
                            </Stack>
                        </Stack>
                    ) : (
                        <Stack spacing={1}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                <Tabs
                                    value={activeFile?.name || false}
                                    onChange={(_, name) => setActiveFileName(name)}
                                    variant="scrollable"
                                    scrollButtons="auto"
                                    sx={{ flex: 1, minWidth: 0, '& .MuiTab-root': { minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.75rem' } }}
                                >
                                    {files.map((f) => (
                                        <Tab
                                            key={f.name}
                                            value={f.name}
                                            label={
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <span>{f.name}</span>
                                                    {files.length > 1 && (
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => { e.stopPropagation(); removeFile(f.name) }}
                                                            sx={{ p: 0, ml: 0.25 }}
                                                        >
                                                            <CloseIcon sx={{ fontSize: 12 }} />
                                                        </IconButton>
                                                    )}
                                                </Box>
                                            }
                                        />
                                    ))}
                                </Tabs>
                                <IconButton size="small" onClick={() => setShowAddFile(true)} title="Add file">
                                    <AddIcon fontSize="small" />
                                </IconButton>
                            </Box>

                            {showAddFile && (
                                <Stack direction="row" spacing={1}>
                                    <TextField
                                        size="small"
                                        placeholder="style.css"
                                        value={newFileName}
                                        onChange={(e) => setNewFileName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') addFile(); if (e.key === 'Escape') { setShowAddFile(false); setNewFileName('') } }}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <Typography variant="caption" color="text.secondary">
                                                        {fileLanguage(newFileName) || 'text'}
                                                    </Typography>
                                                </InputAdornment>
                                            )
                                        }}
                                        sx={{ flex: 1 }}
                                        helperText={`Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`}
                                    />
                                    <Button size="small" variant="contained" onClick={addFile} disabled={!newFileName.trim()}>Add</Button>
                                    <Button size="small" onClick={() => { setShowAddFile(false); setNewFileName('') }}>Cancel</Button>
                                </Stack>
                            )}

                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Button size="small" variant="outlined" startIcon={<FileUploadIcon />} onClick={() => singleFileInputRef.current?.click()}>
                                    Import file
                                </Button>
                                <Button size="small" variant="outlined" startIcon={<FileUploadIcon />} onClick={() => zipInputRef.current?.click()}>
                                    Import .zip
                                </Button>
                                <Button size="small" variant="outlined" startIcon={<FolderOpenIcon />} onClick={() => folderInputRef.current?.click()}>
                                    Import folder
                                </Button>
                                <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportZip}>
                                    Export .zip
                                </Button>
                                <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />} onClick={handleOpenPreview} disabled={!bundleCodeFiles(files)}>
                                    Preview
                                </Button>
                            </Stack>

                            {activeFile && (
                                <TextField
                                    key={activeFile.name}
                                    multiline
                                    minRows={12}
                                    label={activeFile.name}
                                    value={activeFile.content}
                                    onChange={(e) => updateActiveContent(e.target.value)}
                                    inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.78rem' } }}
                                />
                            )}
                        </Stack>
                    )}

                    <input ref={singleFileInputRef} type="file" accept={SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',')} aria-label="Import single file" style={{ display: 'none' }} onChange={handleImportSingle} />
                    <input ref={zipInputRef} type="file" accept=".zip,application/zip" aria-label="Import zip" style={{ display: 'none' }} onChange={handleImportZip} />
                    <input ref={folderInputRef} type="file" webkitdirectory="" aria-label="Import folder" style={{ display: 'none' }} onChange={handleImportFolder} />
                </Stack>
            )}
        </Stack>
    )
}

export function PublishPanel({
    document,
    publishState,
    liveProjectState,
    onPublishPatch,
    onSetLiveProject,
    onClearLiveProject,
    onCopyShareLink,
    onExportProject,
    onImportProjectFile,
    xrState,
    onEnterXr,
    onExitXr
}) {
    return (
        <Stack spacing={2} sx={{ p: 2 }}>
            <FormControlLabel
                control={(
                    <Switch
                        checked={Boolean(publishState.shareEnabled)}
                        onChange={(event) => onPublishPatch({ shareEnabled: event.target.checked })}
                    />
                )}
                label="Share enabled"
            />
            <Card variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1}>
                    <Typography variant="subtitle2">Live space route</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Public route: `/{liveProjectState?.spaceId || 'main'}`
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {liveProjectState?.isLiveProject
                            ? 'This project is currently live for the space viewer.'
                            : liveProjectState?.currentLiveProjectId
                                ? `Another project is currently live in this space: ${liveProjectState.currentLiveProjectId}`
                                : 'No live project is set for this space yet.'}
                    </Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                        <Button
                            variant={liveProjectState?.isLiveProject ? 'contained' : 'outlined'}
                            onClick={onSetLiveProject}
                            disabled={!publishState.shareEnabled || liveProjectState?.isUpdating || liveProjectState?.isLiveProject}
                        >
                            {liveProjectState?.isLiveProject ? 'Currently live' : 'Set as live project'}
                        </Button>
                        <Button
                            variant="text"
                            color="inherit"
                            onClick={onClearLiveProject}
                            disabled={!liveProjectState?.isLiveProject || liveProjectState?.isUpdating}
                        >
                            Clear live project
                        </Button>
                    </Stack>
                    {!publishState.shareEnabled ? (
                        <Typography variant="caption" color="warning.main">
                            Enable sharing before setting this project live for the public space route.
                        </Typography>
                    ) : null}
                </Stack>
            </Card>
            <FormControl fullWidth size="small">
                <InputLabel>XR default</InputLabel>
                <Select
                    label="XR default"
                    value={publishState.xrDefaultMode || 'none'}
                    onChange={(event) => onPublishPatch({ xrDefaultMode: event.target.value })}
                >
                    <MenuItem value="none">No XR default</MenuItem>
                    <MenuItem value="vr">VR</MenuItem>
                    <MenuItem value="ar">AR</MenuItem>
                </Select>
            </FormControl>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <Button variant="contained" startIcon={<ShareIcon />} onClick={onCopyShareLink}>
                    Copy share link
                </Button>
                <Button variant="outlined" startIcon={<RocketLaunchIcon />} onClick={onExportProject}>
                    Export project
                </Button>
                <Button component="label" variant="outlined">
                    Import project
                    <input
                        hidden
                        type="file"
                        accept=".json,application/json"
                        onChange={onImportProjectFile}
                    />
                </Button>
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <Button
                    variant="outlined"
                    startIcon={<ViewInArIcon />}
                    onClick={() => onEnterXr('vr')}
                    disabled={!xrState.supportedXrModes.vr || xrState.isXrPresenting}
                >
                    Enter VR
                </Button>
                <Button
                    variant="outlined"
                    startIcon={<SmartphoneIcon />}
                    onClick={() => onEnterXr('ar')}
                    disabled={!xrState.supportedXrModes.ar || xrState.isXrPresenting}
                >
                    Enter AR
                </Button>
                <Button
                    variant="text"
                    onClick={onExitXr}
                    disabled={!xrState.isXrPresenting}
                >
                    Exit XR
                </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
                XR support: VR {xrState.supportedXrModes.vr ? 'available' : 'unavailable'} • AR {xrState.supportedXrModes.ar ? 'available' : 'unavailable'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Last export: {formatTimestamp(document.publishState?.lastExportAt)}
            </Typography>
        </Stack>
    )
}

export function PopoutDialog({ title, open, onClose, children }) {
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle sx={{ pr: 6 }}>
                {title}
                <IconButton
                    aria-label="Close dialog"
                    onClick={onClose}
                    sx={{ position: 'absolute', right: 8, top: 8 }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
                {children}
            </DialogContent>
        </Dialog>
    )
}
