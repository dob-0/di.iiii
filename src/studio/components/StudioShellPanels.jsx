import { useRef, useState } from 'react'
import JSZip from 'jszip'
import {
    Box,
    Button,
    Card,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Slider,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import ShareIcon from '@mui/icons-material/Share'
import SmartphoneIcon from '@mui/icons-material/Smartphone'
import ViewInArIcon from '@mui/icons-material/ViewInAr'
import { presentationStarterTemplates } from '../../utils/presentationTemplates.js'
import { defaultRenderSettings, defaultWorldState } from '../../shared/projectSchema.js'
import {
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

function NumberField({ label, value, onChange, min, max, step = 1, sx }) {
    return (
        <TextField
            label={label}
            size="small"
            type="number"
            value={value}
            onChange={(event) => {
                const next = Number(event.target.value)
                if (Number.isFinite(next)) onChange(next)
            }}
            inputProps={{ min, max, step }}
            sx={sx}
        />
    )
}

const AXIS_COLORS = ['#ff6b6b', '#4ae3a5', '#4db2ff']

function MiniBox({ label, value, onChange, min, max, step = 1, color }) {
    return (
        <Box sx={{
            flex: 1,
            minWidth: 0,
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 1,
            bgcolor: 'rgba(255,255,255,0.02)',
            p: '4px 6px'
        }}>
            <Typography sx={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                color: color || 'text.secondary', textAlign: 'center', display: 'block', mb: 0.25
            }}>
                {label}
            </Typography>
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isFinite(next)) onChange(next)
                }}
                style={{
                    width: '100%', boxSizing: 'border-box', textAlign: 'center',
                    background: 'rgba(2,4,9,0.45)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 4, color: 'inherit', fontSize: 11, padding: '3px 4px'
                }}
            />
        </Box>
    )
}

function MiniRow({ fields }) {
    return (
        <Stack direction="row" spacing={0.75}>
            {fields.map((field, index) => (
                <MiniBox key={field.label} {...field} color={field.color ?? (field.axis ? AXIS_COLORS[index] : undefined)} />
            ))}
        </Stack>
    )
}

function SliderField({ label, value, onChange, min, max, step }) {
    return (
        <Box>
            <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">{label}</Typography>
                <Typography variant="body2" color="text.secondary">{value}</Typography>
            </Stack>
            <Slider size="small" value={value} min={min} max={max} step={step} onChange={(_, next) => onChange(next)} />
        </Box>
    )
}

function ColorField({ label, value, onChange }) {
    return (
        <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{label}</Typography>
            <TextField size="small" type="color" value={value} onChange={(event) => onChange(event.target.value)} inputProps={{ 'aria-label': label }} />
        </Stack>
    )
}

export function ProjectPanel({
    document,
    displayName,
    onDisplayNameChange,
    onProjectMetaPatch,
    onWorldPatch,
    onRenderSettingsPatch,
    onOpenHub
}) {
    const world = document.worldState || defaultWorldState
    const render = document.renderSettings || defaultRenderSettings

    return (
        <Stack spacing={2} sx={{ p: 2, maxHeight: '70vh', overflowY: 'auto' }}>
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

            <Divider />
            <Typography variant="subtitle2">World</Typography>
            <ColorField label="Background" value={world.backgroundColor} onChange={(v) => onWorldPatch({ backgroundColor: v })} />
            <FormControlLabel
                control={<Switch checked={world.gridVisible !== false} onChange={(event) => onWorldPatch({ gridVisible: event.target.checked })} />}
                label="Grid visible"
            />
            <NumberField label="Grid Size" value={world.gridSize} min={1} step={1} onChange={(v) => onWorldPatch({ gridSize: v })} />
            <MiniRow fields={[
                { label: 'Cell Size', value: world.gridCellSize, min: 0.05, step: 0.05, onChange: (v) => onWorldPatch({ gridCellSize: v }) },
                { label: 'Cell Thick.', value: world.gridCellThickness, min: 0, step: 0.05, onChange: (v) => onWorldPatch({ gridCellThickness: v }) }
            ]} />
            <MiniRow fields={[
                { label: 'Section Size', value: world.gridSectionSize, min: 0.5, step: 0.5, onChange: (v) => onWorldPatch({ gridSectionSize: v }) },
                { label: 'Section Thick.', value: world.gridSectionThickness, min: 0, step: 0.05, onChange: (v) => onWorldPatch({ gridSectionThickness: v }) }
            ]} />
            <MiniRow fields={[
                { label: 'Fade Dist.', value: world.gridFadeDistance, min: 0, step: 1, onChange: (v) => onWorldPatch({ gridFadeDistance: v }) },
                { label: 'Fade Strength', value: world.gridFadeStrength, min: 0, step: 0.05, onChange: (v) => onWorldPatch({ gridFadeStrength: v }) }
            ]} />
            <ColorField label="Grid cell color" value={world.gridCellColor} onChange={(v) => onWorldPatch({ gridCellColor: v })} />
            <ColorField label="Grid section color" value={world.gridSectionColor} onChange={(v) => onWorldPatch({ gridSectionColor: v })} />

            <Divider />
            <Typography variant="subtitle2">Lighting</Typography>
            <ColorField label="Ambient color" value={world.ambientLight?.color} onChange={(v) => onWorldPatch({ ambientLight: { color: v } })} />
            <SliderField label="Ambient intensity" value={world.ambientLight?.intensity ?? 0.85} min={0} max={2} step={0.05} onChange={(v) => onWorldPatch({ ambientLight: { intensity: v } })} />
            <ColorField label="Sun color" value={world.directionalLight?.color} onChange={(v) => onWorldPatch({ directionalLight: { color: v } })} />
            <SliderField label="Sun intensity" value={world.directionalLight?.intensity ?? 1.15} min={0} max={3} step={0.05} onChange={(v) => onWorldPatch({ directionalLight: { intensity: v } })} />
            <MiniRow fields={[0, 1, 2].map((axisIndex) => ({
                label: ['X', 'Y', 'Z'][axisIndex],
                axis: true,
                value: world.directionalLight?.position?.[axisIndex] ?? [8, 12, 4][axisIndex],
                min: -50, step: 0.5,
                onChange: (v) => {
                    const next = [...(world.directionalLight?.position || [8, 12, 4])]
                    next[axisIndex] = v
                    onWorldPatch({ directionalLight: { position: next } })
                }
            }))} />

            <Divider />
            <Typography variant="subtitle2">Default camera</Typography>
            <MiniRow fields={[
                { label: 'FOV', value: world.savedView?.fov ?? 50, min: 1, max: 170, step: 1, onChange: (v) => onWorldPatch({ savedView: { fov: v } }) },
                { label: 'Zoom', value: world.savedView?.zoom ?? 1, min: 0.01, step: 0.1, onChange: (v) => onWorldPatch({ savedView: { zoom: v } }) }
            ]} />
            <MiniRow fields={[
                { label: 'Near', value: world.savedView?.near ?? 0.1, min: 0.001, step: 0.01, onChange: (v) => onWorldPatch({ savedView: { near: v } }) },
                { label: 'Far', value: world.savedView?.far ?? 1000, min: 0.01, step: 10, onChange: (v) => onWorldPatch({ savedView: { far: v } }) }
            ]} />

            <Divider />
            <Typography variant="subtitle2">Render</Typography>
            <FormControlLabel
                control={<Switch checked={render.shadows !== false} onChange={(event) => onRenderSettingsPatch({ shadows: event.target.checked })} />}
                label="Shadows"
            />
            <FormControlLabel
                control={<Switch checked={render.antialias !== false} onChange={(event) => onRenderSettingsPatch({ antialias: event.target.checked })} />}
                label="Antialias"
            />
            <FormControl fullWidth size="small">
                <InputLabel>Tone mapping</InputLabel>
                <Select label="Tone mapping" value={render.toneMapping || 'ACESFilmic'} onChange={(event) => onRenderSettingsPatch({ toneMapping: event.target.value })}>
                    <MenuItem value="ACESFilmic">ACES Filmic</MenuItem>
                    <MenuItem value="none">None</MenuItem>
                </Select>
            </FormControl>
            <SliderField label="Exposure" value={render.toneMappingExposure ?? 1} min={0} max={3} step={0.05} onChange={(v) => onRenderSettingsPatch({ toneMappingExposure: v })} />
            <MiniRow fields={[
                { label: 'Min DPR', value: render.dprMin ?? 1, min: 0.5, max: 4, step: 0.25, onChange: (v) => onRenderSettingsPatch({ dprMin: v }) },
                { label: 'Max DPR', value: render.dprMax ?? 2, min: 0.5, max: 4, step: 0.25, onChange: (v) => onRenderSettingsPatch({ dprMax: v }) }
            ]} />

            <Button
                variant="text"
                color="inherit"
                onClick={() => {
                    onWorldPatch(defaultWorldState)
                    onRenderSettingsPatch(defaultRenderSettings)
                }}
            >
                Reset world &amp; render settings
            </Button>
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

    const applyTemplate = (template) => {
        setFiles([{ name: 'index.html', content: template.html }])
        setActiveFileName('index.html')
        onPresentationPatch({ codeSourceType: 'html' })
    }

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
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1, mb: 1.5 }}>
                        {presentationStarterTemplates.map((template) => (
                            <Paper key={template.id} variant="outlined" onClick={() => applyTemplate(template)}
                                sx={{ p: 1, cursor: 'pointer', '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' } }}>
                                <Typography variant="caption" color="text.secondary" display="block">{template.eyebrow}</Typography>
                                <Typography variant="body2" fontWeight={600}>{template.name}</Typography>
                            </Paper>
                        ))}
                    </Box>
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
}) {
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
