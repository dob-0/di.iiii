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
import CloseIcon from '@mui/icons-material/Close'
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
    const primitives = ['box', 'sphere', 'cone', 'cylinder', 'text']
    const lights = [
        { type: 'pointLight', label: 'Point' },
        { type: 'spotLight', label: 'Spot' },
        { type: 'directionalLight', label: 'Directional' },
        { type: 'ambientLight', label: 'Ambient' },
    ]
    return (
        <>
            <div className="scc-section">
                <div className="scc-section-label">Primitives</div>
                <div className="scc-buttons">
                    {primitives.map((type) => (
                        <button key={type} className="scc-btn" onClick={() => onCreateEntity(type)}>
                            {type}
                        </button>
                    ))}
                </div>
            </div>
            <div className="scc-section">
                <div className="scc-section-label">Lights</div>
                <div className="scc-buttons">
                    {lights.map(({ type, label }) => (
                        <button key={type} className="scc-btn" onClick={() => onCreateEntity(type)}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="scc-section">
                <div className="scc-section-label">Actions</div>
                <div className="spa-actions">
                    <label className="scc-btn spa-btn-wide" style={{ cursor: 'pointer' }}>
                        ↑ Import assets
                        <input type="file" multiple onChange={onAssetFilesSelected} style={{ display: 'none' }} />
                    </label>
                    <button className="scc-btn spa-btn-wide" disabled={!canDeleteSelection} onClick={onDeleteSelected}>
                        × Delete selected
                    </button>
                </div>
            </div>
        </>
    )
}

function SpaceAssetDrawer({ spaceAssets }) {
    const [copied, setCopied] = useState(null)
    const [open, setOpen] = useState(false)
    const copyUrl = (asset) => {
        navigator.clipboard.writeText(`/serverXR${asset.url}`).catch(() => {})
        setCopied(asset.id)
        setTimeout(() => setCopied(null), 1500)
    }
    return (
        <Box sx={{ mt: 1 }}>
            <Button size="small" variant="text" onClick={() => setOpen((v) => !v)} sx={{ fontSize: '0.7rem', color: 'text.secondary', p: 0 }}>
                {open ? '▾' : '▸'} Space assets ({spaceAssets.length})
            </Button>
            {open && (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 0.75, mt: 0.75 }}>
                    {spaceAssets.map((asset) => (
                        <Paper
                            key={asset.id}
                            variant="outlined"
                            onClick={() => copyUrl(asset)}
                            title={`${asset.name}\nClick to copy URL`}
                            sx={{ p: 0.5, cursor: 'pointer', overflow: 'hidden', '&:hover': { borderColor: 'primary.light' } }}
                        >
                            {asset.mimeType?.startsWith('image/') ? (
                                <Box
                                    component="img"
                                    src={`/serverXR${asset.url}`}
                                    alt=""
                                    sx={{ width: '100%', height: 56, objectFit: 'cover', display: 'block', mb: 0.5 }}
                                />
                            ) : (
                                <Box sx={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled', fontSize: '0.7rem' }}>
                                    {(asset.mimeType || '').split('/')[0] || 'file'}
                                </Box>
                            )}
                            <Typography variant="caption" noWrap display="block" sx={{ fontSize: '0.65rem', color: copied === asset.id ? 'success.main' : 'text.secondary' }}>
                                {copied === asset.id ? 'copied!' : asset.name}
                            </Typography>
                        </Paper>
                    ))}
                </Box>
            )}
        </Box>
    )
}

export function AssetsPanel({ assets = [], spaceAssets = [], onAssetFilesSelected, onCreateFromAsset }) {
    const [copied, setCopied] = useState(null)
    const copyUrl = (asset) => {
        navigator.clipboard.writeText(`/serverXR${asset.url}`).catch(() => {})
        setCopied(asset.id)
        setTimeout(() => setCopied(null), 1500)
    }
    return (
        <>
            <div className="scc-section">
                <label className="scc-btn spa-btn-wide" style={{ cursor: 'pointer' }}>
                    ↑ Import assets
                    <input type="file" multiple onChange={onAssetFilesSelected} style={{ display: 'none' }} />
                </label>
            </div>
            {spaceAssets.length > 0 && (
                <div className="scc-section">
                    <div className="scc-section-label">Space files ({spaceAssets.length})</div>
                    <div className="spa-list">
                        {spaceAssets.map((asset) => (
                            <div key={asset.id} className="spa-item spa-item--space">
                                {asset.mimeType?.startsWith('image/') && (
                                    <img
                                        src={`/serverXR${asset.url}`}
                                        alt=""
                                        className="spa-thumb"
                                    />
                                )}
                                <span className="spa-name" title={asset.name}>{asset.name}</span>
                                <button
                                    className="spa-copy-btn"
                                    onClick={() => copyUrl(asset)}
                                    title="Copy URL"
                                >
                                    {copied === asset.id ? '✓' : 'URL'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="scc-section">
                <div className="scc-section-label">Scene assets ({assets.length})</div>
                {assets.length === 0 ? (
                    <p className="sfp-empty">No assets yet.</p>
                ) : (
                    <div className="spa-list">
                        {assets.map((asset) => (
                            <button key={asset.id} className="spa-item" onClick={() => onCreateFromAsset?.(asset)}>
                                <span className="spa-name">{asset.name}</span>
                                <span className="spa-type">{assetTypeLabel(asset.mimeType)}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </>
    )
}

export function StructurePanel({ entities = [], selectedEntityId, onSelectEntity }) {
    return (
        <div className="scc-section">
            <div className="scc-section-label">Entities ({entities.length})</div>
            {entities.length === 0 ? (
                <p className="sfp-empty">No entities yet.</p>
            ) : (
                <div className="spa-list">
                    {entities.map((entity) => (
                        <button
                            key={entity.id}
                            className={`spa-item${entity.id === selectedEntityId ? ' active' : ''}`}
                            onClick={() => onSelectEntity(entity.id)}
                        >
                            <span className="spa-name">{entity.name || entity.id}</span>
                            <span className="spa-type">{entity.type}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
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
        <div className="scc-section">
            <div className="scc-section-label">Recent activity</div>
            {activity.length === 0 ? (
                <p className="sfp-empty">No project activity yet.</p>
            ) : (
                <div className="spa-activity">
                    {[...activity].reverse().map((entry) => (
                        <div key={entry.id} className="spa-activity-entry">
                            <div className="spa-activity-header">
                                <span className={`spa-activity-level spa-activity-level--${entry.level || 'info'}`}>
                                    {entry.level || 'info'}
                                </span>
                                <span className="spa-activity-time">{formatTimestamp(entry.timestamp)}</span>
                            </div>
                            <p className="spa-activity-msg">{entry.message}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

const resolveAssetUrl = (asset) => {
    if (!asset?.url) return ''
    try {
        return new URL(asset.url, window.location.origin).href
    } catch {
        return asset.url
    }
}

const generateAssetTemplate = (asset) => {
    const url = resolveAssetUrl(asset)
    const topLevel = (asset.mimeType || '').split('/')[0]
    const base = `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { width: 100vw; height: 100vh; overflow: hidden; background: #000; }`
    if (topLevel === 'video') {
        return `<!doctype html>\n<html><head>\n<meta charset="UTF-8">\n<style>\n${base}\nvideo { width: 100%; height: 100%; object-fit: cover; display: block; }\n</style>\n</head><body>\n<video src="${url}" autoplay loop muted playsinline></video>\n</body></html>`
    }
    if (topLevel === 'image') {
        return `<!doctype html>\n<html><head>\n<meta charset="UTF-8">\n<style>\n${base}\nimg { width: 100%; height: 100%; object-fit: cover; display: block; }\n</style>\n</head><body>\n<img src="${url}" alt="${asset.name}">\n</body></html>`
    }
    if (topLevel === 'audio') {
        return `<!doctype html>\n<html><head>\n<meta charset="UTF-8">\n<style>\n${base}\nbody { display: flex; align-items: center; justify-content: center; color: #fff; font-family: system-ui; }\naudio { width: min(480px, 90vw); }\n</style>\n</head><body>\n<audio src="${url}" controls autoplay></audio>\n</body></html>`
    }
    return `<!doctype html>\n<html><head><meta charset="UTF-8"></head><body style="background:#000;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh">\n<a href="${url}" style="color:#6ee7ff">${asset.name}</a>\n</body></html>`
}

export function FilesPanel({
    presentationState,
    onPresentationPatch,
    spaceAssets = []
}) {
    const singleFileInputRef = useRef(null)
    const zipInputRef = useRef(null)
    const folderInputRef = useRef(null)
    const [activeFileName, setActiveFileName] = useState('index.html')
    const [showAddFile, setShowAddFile] = useState(false)
    const [newFileName, setNewFileName] = useState('')
    const [copied, setCopied] = useState(null)
    const [assetsOpen, setAssetsOpen] = useState(true)

    const files = presentationState?.codeFiles || []
    const hasLegacyHtml = Boolean(presentationState?.codeHtml && files.length === 0)
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
        } catch { /* ignore malformed zips */ }
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
        a.href = url; a.download = 'project.zip'; a.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    }

    const copyAssetUrl = (asset) => {
        navigator.clipboard.writeText(`/serverXR${asset.url}`).catch(() => {})
        setCopied(asset.id)
        setTimeout(() => setCopied(null), 1500)
    }

    return (
        <Stack spacing={0} sx={{ p: 0, height: '100%' }}>
            {/* ── file tabs ── */}
            {files.length > 0 ? (
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pt: 0.5 }}>
                        <Tabs
                            value={activeFile?.name || false}
                            onChange={(_, name) => setActiveFileName(name)}
                            variant="scrollable"
                            scrollButtons="auto"
                            sx={{ flex: 1, minWidth: 0, '& .MuiTab-root': { minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.72rem' } }}
                        >
                            {files.map((f) => (
                                <Tab
                                    key={f.name}
                                    value={f.name}
                                    label={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <span>{f.name}</span>
                                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); removeFile(f.name) }} sx={{ p: 0, ml: 0.25 }}>
                                                <CloseIcon sx={{ fontSize: 11 }} />
                                            </IconButton>
                                        </Box>
                                    }
                                />
                            ))}
                        </Tabs>
                        <IconButton size="small" onClick={() => setShowAddFile((v) => !v)} title="New file">
                            <AddIcon fontSize="small" />
                        </IconButton>
                    </Box>
                    {showAddFile && (
                        <Stack direction="row" spacing={1} sx={{ px: 1, pb: 1 }}>
                            <TextField
                                inputRef={el => el?.focus()} size="small" placeholder="style.css"
                                value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addFile(); if (e.key === 'Escape') { setShowAddFile(false); setNewFileName('') } }}
                                sx={{ flex: 1 }}
                            />
                            <Button size="small" variant="contained" onClick={addFile} disabled={!newFileName.trim()}>Add</Button>
                        </Stack>
                    )}
                </Box>
            ) : (
                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                    {hasLegacyHtml && (
                        <Button size="small" variant="outlined" fullWidth sx={{ mb: 1 }}
                            onClick={() => { onPresentationPatch({ codeFiles: [{ name: 'index.html', content: presentationState.codeHtml }], codeHtml: '' }); setActiveFileName('index.html') }}
                        >Convert legacy HTML → index.html</Button>
                    )}
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>No code files yet</Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        <Button size="small" variant="outlined" onClick={() => singleFileInputRef.current?.click()}>+ File</Button>
                        <Button size="small" variant="outlined" onClick={() => zipInputRef.current?.click()}>+ .zip</Button>
                        <Button size="small" variant="outlined" onClick={() => folderInputRef.current?.click()}>+ folder</Button>
                        <Button size="small" variant="outlined" onClick={() => { setFiles([{ name: 'index.html', content: '' }]); setActiveFileName('index.html') }}>blank index.html</Button>
                    </Stack>
                </Box>
            )}

            {/* ── code editor ── */}
            {activeFile && (
                <Box sx={{ px: 1, pt: 1, flex: 1 }}>
                    <TextField
                        key={activeFile.name}
                        multiline fullWidth
                        minRows={14}
                        value={activeFile.content}
                        onChange={(e) => updateActiveContent(e.target.value)}
                        inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.76rem', lineHeight: 1.5 } }}
                        sx={{ '& .MuiInputBase-root': { p: 1 } }}
                    />
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75, mb: 1 }}>
                        <Button size="small" variant="outlined" onClick={() => singleFileInputRef.current?.click()}>↑ Import</Button>
                        <Button size="small" variant="outlined" onClick={() => zipInputRef.current?.click()}>↑ .zip</Button>
                        <Button size="small" variant="outlined" onClick={() => folderInputRef.current?.click()}>↑ folder</Button>
                        <Button size="small" variant="outlined" onClick={handleExportZip}>↓ Export</Button>
                    </Stack>
                </Box>
            )}

            {/* ── space assets ── */}
            {spaceAssets.length > 0 && (
                <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
                    <Button size="small" variant="text" onClick={() => setAssetsOpen((v) => !v)}
                        sx={{ fontSize: '0.7rem', color: 'text.secondary', p: 0, mb: 0.5 }}>
                        {assetsOpen ? '▾' : '▸'} Space assets ({spaceAssets.length})
                    </Button>
                    {assetsOpen && (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 0.75 }}>
                            {spaceAssets.map((asset) => (
                                <Paper key={asset.id} variant="outlined" onClick={() => copyAssetUrl(asset)}
                                    title={`${asset.name}\nClick to copy URL`}
                                    sx={{ p: 0.5, cursor: 'pointer', overflow: 'hidden', '&:hover': { borderColor: 'primary.light' } }}>
                                    {asset.mimeType?.startsWith('image/') ? (
                                        <Box component="img" src={`/serverXR${asset.url}`} alt=""
                                            sx={{ width: '100%', height: 48, objectFit: 'cover', display: 'block', mb: 0.25 }} />
                                    ) : (
                                        <Box sx={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled', fontSize: '0.65rem' }}>
                                            {(asset.mimeType || '').split('/')[0] || 'file'}
                                        </Box>
                                    )}
                                    <Typography variant="caption" noWrap display="block"
                                        sx={{ fontSize: '0.6rem', color: copied === asset.id ? 'success.main' : 'text.secondary' }}>
                                        {copied === asset.id ? 'copied!' : asset.name}
                                    </Typography>
                                </Paper>
                            ))}
                        </Box>
                    )}
                </Box>
            )}

            <input ref={singleFileInputRef} type="file" accept={SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',')} aria-label="Import single file" style={{ display: 'none' }} onChange={handleImportSingle} />
            <input ref={zipInputRef} type="file" accept=".zip,application/zip" aria-label="Import zip" style={{ display: 'none' }} onChange={handleImportZip} />
            <input ref={folderInputRef} type="file" webkitdirectory="" aria-label="Import folder" style={{ display: 'none' }} onChange={handleImportFolder} />
        </Stack>
    )
}

export function PresentPanel({
    presentationState,
    onPresentationPatch,
    onSaveCurrentCamera,
    assets = [],
    spaceAssets = []
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

    const applyAsset = (asset) => {
        const nextFiles = [{ name: 'index.html', content: generateAssetTemplate(asset) }]
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
                    <MenuItem value="code">Code view</MenuItem>
                </Select>
            </FormControl>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={onSaveCurrentCamera}>Save current view</Button>
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
                            {assets.length > 0 && (
                                <>
                                    <Typography variant="caption" color="text.secondary">From space assets</Typography>
                                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1 }}>
                                        {assets.map((asset) => {
                                            const topLevel = (asset.mimeType || '').split('/')[0]
                                            return (
                                                <Paper
                                                    key={asset.id}
                                                    variant="outlined"
                                                    onClick={() => applyAsset(asset)}
                                                    sx={{ p: 1, cursor: 'pointer', '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' } }}
                                                >
                                                    <Typography variant="caption" color="text.secondary" display="block">{topLevel || 'file'}</Typography>
                                                    <Typography variant="body2" fontWeight={600} noWrap title={asset.name}>{asset.name}</Typography>
                                                </Paper>
                                            )
                                        })}
                                    </Box>
                                </>
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
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => { e.stopPropagation(); removeFile(f.name) }}
                                                        sx={{ p: 0, ml: 0.25 }}
                                                    >
                                                        <CloseIcon sx={{ fontSize: 12 }} />
                                                    </IconButton>
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
                            {spaceAssets.length > 0 && (
                                <SpaceAssetDrawer spaceAssets={spaceAssets} />
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
