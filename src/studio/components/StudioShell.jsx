import { useCallback, useMemo, useRef, useState } from 'react'
import {
    AppBar,
    Avatar,
    AvatarGroup,
    Box,
    BottomNavigation,
    BottomNavigationAction,
    Button,
    Chip,
    Divider,
    Drawer,
    IconButton,
    Menu,
    MenuItem,
    Paper,
    Stack,
    Tab,
    Tabs,
    Toolbar,
    Tooltip,
    Typography
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import ShareIcon from '@mui/icons-material/Share'
import SlideshowIcon from '@mui/icons-material/Slideshow'
import TuneIcon from '@mui/icons-material/Tune'
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import FolderIcon from '@mui/icons-material/Folder'
import InsightsIcon from '@mui/icons-material/Insights'
import LayersIcon from '@mui/icons-material/Layers'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import StudioInspector from './StudioInspector.jsx'
import StudioPresentationSurface from './StudioPresentationSurface.jsx'
import {
    ActivityPanel,
    AssetsPanel,
    LibraryPanel,
    PanelHeader,
    PopoutDialog,
    PresentPanel,
    ProjectPanel,
    PublishPanel,
    StructurePanel
} from './StudioShellPanels.jsx'

const APP_BAR_HEIGHT = 72
const MOBILE_BOTTOM_NAV_HEIGHT = 68

const LEFT_WIDTH_MIN = 220
const LEFT_WIDTH_MAX = 600
const RIGHT_WIDTH_MIN = 220
const RIGHT_WIDTH_MAX = 600
const BOTTOM_HEIGHT_MIN = 140
const BOTTOM_HEIGHT_MAX = 720

function ResizeHandle({ direction, onDrag, onStart, sx = {} }) {
    const isHorizontal = direction === 'left' || direction === 'right'
    const cursor = isHorizontal ? 'col-resize' : 'row-resize'
    const startRef = useRef(null)

    const handlePointerDown = useCallback((e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        startRef.current = { x: e.clientX, y: e.clientY }
        onStart?.()
    }, [onStart])

    const handlePointerMove = useCallback((e) => {
        if (!startRef.current) return
        onDrag(e.clientX - startRef.current.x, e.clientY - startRef.current.y)
    }, [onDrag])

    const handlePointerUp = useCallback((e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        startRef.current = null
    }, [])

    return (
        <Box
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            sx={{
                position: 'fixed',
                cursor,
                userSelect: 'none',
                touchAction: 'none',
                zIndex: (theme) => theme.zIndex.drawer + 2,
                '&::after': {
                    content: '""',
                    position: 'absolute',
                    bgcolor: 'transparent',
                    transition: 'background-color 0.15s',
                    ...(isHorizontal ? {
                        top: 0, bottom: 0,
                        left: '50%', transform: 'translateX(-50%)',
                        width: 2
                    } : {
                        left: 0, right: 0,
                        top: '50%', transform: 'translateY(-50%)',
                        height: 2
                    })
                },
                '&:hover::after': { bgcolor: 'primary.main' },
                ...sx
            }}
        />
    )
}

const getStatusChipColor = (streamState, presenceState) => {
    if (streamState === 'connected' && presenceState === 'connected') return 'success'
    if (streamState === 'degraded' || presenceState === 'degraded') return 'warning'
    if (streamState === 'idle' || presenceState === 'disconnected') return 'default'
    return 'info'
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
    onFireCue,
    isStreamingScene,
    onToggleSceneStream,
    onCopyShareLink,
    onExportProject,
    onImportProjectFile,
    onEnterXr,
    onExitXr,
    onBackToHub,
    onCameraViewChange,
    onTransformCommit
}) {
    const [utilityMenuAnchor, setUtilityMenuAnchor] = useState(null)
    const [viewportEditMode, setViewportEditMode] = useState('navigate')
    const [viewportGizmoMode, setViewportGizmoMode] = useState('translate')
    const leftTab = layout.leftTab || 'library'
    const bottomTab = layout.bottomTab || 'activity'
    const statusColor = getStatusChipColor(syncState.sceneStreamState, presence.presenceState)
    const bottomHeight = layout.bottomHeight || (isMobile ? 360 : 300)
    const bottomInset = layout.bottomOpen ? bottomHeight : (isMobile ? MOBILE_BOTTOM_NAV_HEIGHT : 0)

    const leftStartRef = useRef(null)
    const rightStartRef = useRef(null)
    const bottomStartRef = useRef(null)

    const onLeftDrag = useCallback((dx) => {
        if (leftStartRef.current === null) return
        updateLayout({ leftWidth: Math.min(LEFT_WIDTH_MAX, Math.max(LEFT_WIDTH_MIN, leftStartRef.current + dx)) })
    }, [updateLayout])

    const onRightDrag = useCallback((dx) => {
        if (rightStartRef.current === null) return
        updateLayout({ rightWidth: Math.min(RIGHT_WIDTH_MAX, Math.max(RIGHT_WIDTH_MIN, rightStartRef.current - dx)) })
    }, [updateLayout])

    const onBottomDrag = useCallback((_, dy) => {
        if (bottomStartRef.current === null) return
        updateLayout({ bottomHeight: Math.min(BOTTOM_HEIGHT_MAX, Math.max(BOTTOM_HEIGHT_MIN, bottomStartRef.current - dy)) })
    }, [updateLayout])
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
                    onFireCue={onFireCue}
                    isStreamingScene={isStreamingScene}
                    onToggleSceneStream={onToggleSceneStream}
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
        <Box className="studio-shell-root studio-editor-root" sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
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
                        height: `calc(100% - ${APP_BAR_HEIGHT}px)`
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
                        height: `calc(100% - ${APP_BAR_HEIGHT}px)`
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
                    editMode={viewportEditMode}
                    gizmoMode={viewportGizmoMode}
                    setEditMode={setViewportEditMode}
                    setGizmoMode={setViewportGizmoMode}
                    onTransformCommit={onTransformCommit}
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
                        left: 0,
                        right: 0,
                        zIndex: (theme) => theme.zIndex.drawer + 1
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

            {isDesktop && layout.leftOpen ? (
                <ResizeHandle
                    direction="right"
                    onStart={() => { leftStartRef.current = layout.leftWidth }}
                    onDrag={onLeftDrag}
                    sx={{ top: APP_BAR_HEIGHT, bottom: 0, left: layout.leftWidth - 3, width: 6 }}
                />
            ) : null}
            {isDesktop && layout.rightOpen ? (
                <ResizeHandle
                    direction="left"
                    onStart={() => { rightStartRef.current = layout.rightWidth }}
                    onDrag={onRightDrag}
                    sx={{ top: APP_BAR_HEIGHT, bottom: 0, right: layout.rightWidth - 3, width: 6 }}
                />
            ) : null}
            {layout.bottomOpen ? (
                <ResizeHandle
                    direction="top"
                    onStart={() => { bottomStartRef.current = bottomHeight }}
                    onDrag={onBottomDrag}
                    sx={{ left: 0, right: 0, bottom: bottomHeight - 3, height: 6 }}
                />
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
