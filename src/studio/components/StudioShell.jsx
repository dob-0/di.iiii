import { useMemo, useState } from 'react'
import {
    AppBar,
    Avatar,
    AvatarGroup,
    Box,
    BottomNavigation,
    BottomNavigationAction,
    Button,
    Card,
    Chip,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    Drawer,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    List,
    ListItemButton,
    ListItemText,
    Menu,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    Toolbar,
    Tooltip,
    Typography
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import CloseIcon from '@mui/icons-material/Close'
import ShareIcon from '@mui/icons-material/Share'
import SlideshowIcon from '@mui/icons-material/Slideshow'
import TuneIcon from '@mui/icons-material/Tune'
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import FolderIcon from '@mui/icons-material/Folder'
import InsightsIcon from '@mui/icons-material/Insights'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import LayersIcon from '@mui/icons-material/Layers'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import SmartphoneIcon from '@mui/icons-material/Smartphone'
import ViewInArIcon from '@mui/icons-material/ViewInAr'
import StudioInspector from './StudioInspector.jsx'
import StudioPresentationSurface from './StudioPresentationSurface.jsx'

const APP_BAR_HEIGHT = 72
const DESKTOP_BOTTOM_HEIGHT = 300
const MOBILE_BOTTOM_NAV_HEIGHT = 68

const formatTimestamp = (value) => {
    if (!value) return 'Not yet'
    try {
        return new Date(value).toLocaleString()
    } catch {
        return String(value)
    }
}

const getStatusChipColor = (streamState, presenceState) => {
    if (streamState === 'connected' && presenceState === 'connected') return 'success'
    if (streamState === 'degraded' || presenceState === 'degraded') return 'warning'
    if (streamState === 'idle' || presenceState === 'disconnected') return 'default'
    return 'info'
}

const assetTypeLabel = (mimeType = '') => {
    const topLevel = mimeType.split('/')[0]
    if (!topLevel) return 'asset'
    return topLevel
}

function PanelHeader({ title, onClose, action = null }) {
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

function LibraryPanel({ onCreateEntity, onAssetFilesSelected, canDeleteSelection, onDeleteSelected }) {
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

function AssetsPanel({ assets = [], onAssetFilesSelected, onCreateFromAsset }) {
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

function StructurePanel({ entities = [], selectedEntityId, onSelectEntity }) {
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

function ProjectPanel({
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

function ActivityPanel({ activity = [] }) {
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

function PresentPanel({
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

function PublishPanel({
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

function PopoutDialog({ title, open, onClose, children }) {
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

export default function StudioShell({
    document,
    loading,
    loadError,
    displayName,
    onDisplayNameChange,
    selectedEntity,
    selectedEntityId,
    entities,
    inspectorSections,
    inspectorValues,
    assetOptions,
    presence,
    syncState,
    layout,
    updateLayout,
    isDesktop,
    isMobile,
    cameraView,
    controlsRef,
    xrState,
    onCreateEntity,
    onCreateFromAsset,
    onAssetFilesSelected,
    onDeleteSelected,
    onSelectEntity,
    onInspectorChange,
    onWorldPatch,
    onProjectMetaPatch,
    onPresentationPatch,
    onPublishPatch,
    liveProjectState,
    onSetLiveProject,
    onClearLiveProject,
    onSaveCurrentCamera,
    onUseCurrentCameraAsFixed,
    onCopyShareLink,
    onExportProject,
    onImportProjectFile,
    onEnterXr,
    onExitXr,
    onBackToHub,
    onCameraViewChange
}) {
    const [utilityMenuAnchor, setUtilityMenuAnchor] = useState(null)
    const leftTab = layout.leftTab || 'library'
    const bottomTab = layout.bottomTab || 'activity'
    const statusColor = getStatusChipColor(syncState.sceneStreamState, presence.presenceState)
    const bottomHeight = isMobile ? 360 : DESKTOP_BOTTOM_HEIGHT
    const bottomInset = layout.bottomOpen ? bottomHeight : (isMobile ? MOBILE_BOTTOM_NAV_HEIGHT : 0)
    const viewportMargins = useMemo(() => ({
        ml: isDesktop && layout.leftOpen ? `${layout.leftWidth}px` : 0,
        mr: isDesktop && layout.rightOpen ? `${layout.rightWidth}px` : 0,
        pb: `${bottomInset}px`
    }), [bottomInset, isDesktop, layout.leftOpen, layout.leftWidth, layout.rightOpen, layout.rightWidth])

    const utilityPanels = [
        { key: 'assets', label: 'Assets' },
        { key: 'outliner', label: 'Structure' },
        { key: 'activity', label: 'Activity' },
        { key: 'publish', label: 'Publish' }
    ]

    const renderLeftContent = () => {
        if (leftTab === 'assets') {
            return (
                <AssetsPanel
                    assets={assetOptions}
                    onAssetFilesSelected={onAssetFilesSelected}
                    onCreateFromAsset={onCreateFromAsset}
                />
            )
        }
        if (leftTab === 'structure') {
            return (
                <StructurePanel
                    entities={entities}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={onSelectEntity}
                />
            )
        }
        if (leftTab === 'project') {
            return (
                <ProjectPanel
                    document={document}
                    displayName={displayName}
                    onDisplayNameChange={onDisplayNameChange}
                    onProjectMetaPatch={onProjectMetaPatch}
                    onWorldPatch={onWorldPatch}
                    onOpenHub={onBackToHub}
                />
            )
        }
        return (
            <LibraryPanel
                onCreateEntity={onCreateEntity}
                onAssetFilesSelected={onAssetFilesSelected}
                canDeleteSelection={Boolean(selectedEntity)}
                onDeleteSelected={onDeleteSelected}
            />
        )
    }

    const renderBottomContent = (tab = bottomTab) => {
        if (tab === 'present') {
            return (
                <PresentPanel
                    presentationState={document.presentationState}
                    onPresentationPatch={onPresentationPatch}
                    onSaveCurrentCamera={onSaveCurrentCamera}
                    onUseCurrentCameraAsFixed={onUseCurrentCameraAsFixed}
                />
            )
        }
        if (tab === 'publish') {
            return (
                <PublishPanel
                    document={document}
                    publishState={document.publishState}
                    liveProjectState={liveProjectState}
                    onPublishPatch={onPublishPatch}
                    onSetLiveProject={onSetLiveProject}
                    onClearLiveProject={onClearLiveProject}
                    onCopyShareLink={onCopyShareLink}
                    onExportProject={onExportProject}
                    onImportProjectFile={onImportProjectFile}
                    xrState={xrState}
                    onEnterXr={onEnterXr}
                    onExitXr={onExitXr}
                />
            )
        }
        return <ActivityPanel activity={syncState.activity} />
    }

    const inspectorFooter = (
        <Button
            variant="outlined"
            color="error"
            disabled={!selectedEntity}
            onClick={onDeleteSelected}
            startIcon={<DeleteOutlineIcon />}
        >
            Delete selected
        </Button>
    )

    return (
        <Box className="studio-shell-root studio-editor-root">
            <AppBar position="fixed" color="transparent" elevation={0} className="studio-appbar">
                <Toolbar sx={{ minHeight: `${APP_BAR_HEIGHT}px !important`, gap: 1.5 }}>
                    <IconButton color="inherit" onClick={() => updateLayout({ leftOpen: !layout.leftOpen })}>
                        <MenuIcon />
                    </IconButton>
                    <Stack spacing={0} sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">Studio</Typography>
                        <Typography variant="h6" noWrap>{document.projectMeta?.title || document.projectMeta?.id || 'Studio project'}</Typography>
                    </Stack>
                    {!isMobile ? (
                        <Chip
                            size="small"
                            color={statusColor}
                            label={`${syncState.sceneStreamState} · ${presence.presenceState}`}
                        />
                    ) : null}
                    {!isMobile ? (
                        <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 30, height: 30, fontSize: 12 } }}>
                            {presence.users.map((user) => (
                                <Tooltip key={user.socketId || user.userId} title={user.userName || user.userId}>
                                    <Avatar>{(user.userName || user.userId || '?').slice(0, 1).toUpperCase()}</Avatar>
                                </Tooltip>
                            ))}
                        </AvatarGroup>
                    ) : null}
                    {!isMobile ? (
                        <Button
                            color="inherit"
                            startIcon={<SlideshowIcon />}
                            onClick={() => updateLayout({ bottomOpen: true, bottomTab: 'present' })}
                        >
                            Present
                        </Button>
                    ) : null}
                    {!isMobile ? (
                        <Button
                            color="inherit"
                            startIcon={<ShareIcon />}
                            onClick={() => updateLayout({ bottomOpen: true, bottomTab: 'publish' })}
                        >
                            Share
                        </Button>
                    ) : null}
                    <Tooltip title="Inspector">
                        <IconButton color="inherit" onClick={() => updateLayout({ rightOpen: !layout.rightOpen })}>
                            <TuneIcon />
                        </IconButton>
                    </Tooltip>
                    <IconButton color="inherit" onClick={(event) => setUtilityMenuAnchor(event.currentTarget)}>
                        <MoreVertIcon />
                    </IconButton>
                </Toolbar>
            </AppBar>

            <Menu
                anchorEl={utilityMenuAnchor}
                open={Boolean(utilityMenuAnchor)}
                onClose={() => setUtilityMenuAnchor(null)}
            >
                {utilityPanels.map((panel) => (
                    <MenuItem
                        key={panel.key}
                        onClick={() => {
                            updateLayout((current) => ({
                                popouts: {
                                    ...current.popouts,
                                    [panel.key]: !current.popouts?.[panel.key]
                                }
                            }))
                            setUtilityMenuAnchor(null)
                        }}
                    >
                        {layout.popouts?.[panel.key] ? `Close ${panel.label}` : `Open ${panel.label}`}
                    </MenuItem>
                ))}
            </Menu>

            <Drawer
                anchor="left"
                open={layout.leftOpen}
                onClose={() => updateLayout({ leftOpen: false })}
                variant={isDesktop ? 'persistent' : 'temporary'}
                ModalProps={{ keepMounted: true }}
                PaperProps={{
                    sx: {
                        width: layout.leftWidth,
                        top: `${APP_BAR_HEIGHT}px`,
                        height: `calc(100% - ${APP_BAR_HEIGHT}px - ${bottomInset}px)`
                    }
                }}
            >
                <PanelHeader title="Workspace" onClose={!isDesktop ? () => updateLayout({ leftOpen: false }) : null} />
                <Divider />
                <Tabs
                    value={leftTab}
                    onChange={(_, value) => updateLayout({ leftTab: value })}
                    variant="fullWidth"
                >
                    <Tab value="library" icon={<LayersIcon />} iconPosition="start" label="Library" />
                    <Tab value="assets" icon={<Inventory2Icon />} iconPosition="start" label="Assets" />
                    <Tab value="structure" icon={<AccountTreeIcon />} iconPosition="start" label="Structure" />
                    <Tab value="project" icon={<FolderIcon />} iconPosition="start" label="Project" />
                </Tabs>
                <Divider />
                <Box sx={{ overflow: 'auto', flex: 1 }}>
                    {renderLeftContent()}
                </Box>
            </Drawer>

            <Drawer
                anchor="right"
                open={layout.rightOpen}
                onClose={() => updateLayout({ rightOpen: false })}
                variant={isDesktop ? 'persistent' : 'temporary'}
                ModalProps={{ keepMounted: true }}
                PaperProps={{
                    sx: {
                        width: layout.rightWidth,
                        top: `${APP_BAR_HEIGHT}px`,
                        height: `calc(100% - ${APP_BAR_HEIGHT}px - ${bottomInset}px)`
                    }
                }}
            >
                <PanelHeader title="Inspector" onClose={!isDesktop ? () => updateLayout({ rightOpen: false }) : null} />
                <Divider />
                <Box sx={{ overflow: 'auto', p: 2 }}>
                    <StudioInspector
                        title={selectedEntity ? selectedEntity.name : 'World'}
                        subtitle={selectedEntity ? selectedEntity.type : 'Project defaults'}
                        sections={inspectorSections}
                        values={inspectorValues}
                        assetOptions={assetOptions}
                        onSectionChange={onInspectorChange}
                        footer={inspectorFooter}
                    />
                </Box>
            </Drawer>

            <Box
                component="main"
                sx={{
                    position: 'relative',
                    height: '100%',
                    pt: `${APP_BAR_HEIGHT}px`,
                    ...viewportMargins
                }}
            >
                <StudioPresentationSurface
                    document={document}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={onSelectEntity}
                    cursors={presence.cursors}
                    onCursorMove={presence.emitCursor}
                    onCursorLeave={presence.clearCursor}
                    cameraView={cameraView}
                    controlsRef={controlsRef}
                    xrStore={xrState.xrStore}
                    onCameraChange={onCameraViewChange}
                />

                {loading ? (
                    <Paper className="studio-overlay-card">
                        <Typography variant="subtitle1">Loading project...</Typography>
                    </Paper>
                ) : null}
                {loadError ? (
                    <Paper className="studio-overlay-card studio-overlay-error">
                        <Typography variant="subtitle1">{loadError}</Typography>
                    </Paper>
                ) : null}
            </Box>

            <Drawer
                anchor="bottom"
                open={layout.bottomOpen}
                onClose={() => updateLayout({ bottomOpen: false })}
                variant={isDesktop ? 'persistent' : 'temporary'}
                ModalProps={{ keepMounted: true }}
                PaperProps={{
                    sx: {
                        height: bottomHeight,
                        left: isDesktop && layout.leftOpen ? `${layout.leftWidth}px` : 0,
                        right: isDesktop && layout.rightOpen ? `${layout.rightWidth}px` : 0
                    }
                }}
            >
                <PanelHeader title="Studio tools" onClose={() => updateLayout({ bottomOpen: false })} />
                <Divider />
                <Tabs
                    value={bottomTab}
                    onChange={(_, value) => updateLayout({ bottomTab: value })}
                    variant="fullWidth"
                >
                    <Tab value="activity" icon={<InsightsIcon />} iconPosition="start" label="Activity" />
                    <Tab value="present" icon={<SlideshowIcon />} iconPosition="start" label="Present" />
                    <Tab value="publish" icon={<ShareIcon />} iconPosition="start" label="Publish" />
                </Tabs>
                <Divider />
                <Box sx={{ overflow: 'auto', flex: 1 }}>
                    {renderBottomContent()}
                </Box>
            </Drawer>

            {isMobile ? (
                <Paper
                    elevation={6}
                    sx={{
                        position: 'fixed',
                        left: 12,
                        right: 12,
                        bottom: 12,
                        borderRadius: 2,
                        overflow: 'hidden',
                        zIndex: (theme) => theme.zIndex.appBar + 1
                    }}
                >
                    <BottomNavigation
                        value={layout.bottomOpen ? bottomTab : 'library'}
                        onChange={(_, value) => {
                            if (value === 'library') {
                                updateLayout({ leftOpen: true, leftTab: 'library' })
                                return
                            }
                            if (value === 'inspector') {
                                updateLayout({ rightOpen: true })
                                return
                            }
                            updateLayout({ bottomOpen: true, bottomTab: value })
                        }}
                        showLabels
                    >
                        <BottomNavigationAction value="library" label="Library" icon={<ViewSidebarIcon />} />
                        <BottomNavigationAction value="inspector" label="Inspector" icon={<TuneIcon />} />
                        <BottomNavigationAction value="activity" label="Activity" icon={<InsightsIcon />} />
                        <BottomNavigationAction value="present" label="Present" icon={<SlideshowIcon />} />
                        <BottomNavigationAction value="publish" label="Publish" icon={<ShareIcon />} />
                    </BottomNavigation>
                </Paper>
            ) : null}

            <PopoutDialog
                title="Assets"
                open={Boolean(isDesktop && layout.popouts?.assets)}
                onClose={() => updateLayout((current) => ({ popouts: { ...current.popouts, assets: false } }))}
            >
                <AssetsPanel
                    assets={assetOptions}
                    onAssetFilesSelected={onAssetFilesSelected}
                    onCreateFromAsset={onCreateFromAsset}
                />
            </PopoutDialog>
            <PopoutDialog
                title="Structure"
                open={Boolean(isDesktop && layout.popouts?.outliner)}
                onClose={() => updateLayout((current) => ({ popouts: { ...current.popouts, outliner: false } }))}
            >
                <StructurePanel
                    entities={entities}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={onSelectEntity}
                />
            </PopoutDialog>
            <PopoutDialog
                title="Activity"
                open={Boolean(isDesktop && layout.popouts?.activity)}
                onClose={() => updateLayout((current) => ({ popouts: { ...current.popouts, activity: false } }))}
            >
                <ActivityPanel activity={syncState.activity} />
            </PopoutDialog>
            <PopoutDialog
                title="Publish"
                open={Boolean(isDesktop && layout.popouts?.publish)}
                onClose={() => updateLayout((current) => ({ popouts: { ...current.popouts, publish: false } }))}
            >
                <PublishPanel
                    document={document}
                    publishState={document.publishState}
                    liveProjectState={liveProjectState}
                    onPublishPatch={onPublishPatch}
                    onSetLiveProject={onSetLiveProject}
                    onClearLiveProject={onClearLiveProject}
                    onCopyShareLink={onCopyShareLink}
                    onExportProject={onExportProject}
                    onImportProjectFile={onImportProjectFile}
                    xrState={xrState}
                    onEnterXr={onEnterXr}
                    onExitXr={onExitXr}
                />
            </PopoutDialog>
        </Box>
    )
}
