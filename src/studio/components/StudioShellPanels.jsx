import {
    Button,
    Card,
    Dialog,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    List,
    ListItemButton,
    ListItemText,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    TextField,
    Typography
} from '@mui/material'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import ShareIcon from '@mui/icons-material/Share'
import SmartphoneIcon from '@mui/icons-material/Smartphone'
import ViewInArIcon from '@mui/icons-material/ViewInAr'

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
            <TextField
                multiline
                minRows={8}
                label="Code preview HTML"
                value={presentationState.codeHtml || ''}
                onChange={(event) => onPresentationPatch({ codeHtml: event.target.value })}
            />
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
