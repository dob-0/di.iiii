'use strict'

const FORGET_MEDIA_LABEL = 'Forget camera and microphone answers'

const buildMenuTemplate = ({ isMac, onForgetMedia }) => [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
        label: 'File',
        submenu: [
            { label: FORGET_MEDIA_LABEL, click: () => onForgetMedia && onForgetMedia() },
            { type: 'separator' },
            isMac ? { role: 'close' } : { role: 'quit' }
        ]
    },
    { role: 'editMenu' },
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    },
    {
        label: 'Go',
        submenu: [
            { label: 'Back', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: (item, win) => win && win.webContents.navigationHistory.goBack() },
            { label: 'Forward', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: (item, win) => win && win.webContents.navigationHistory.goForward() }
        ]
    },
    { role: 'windowMenu' }
]

// The dialog's second line names the real place of the item: the top menu and
// the item's label, read from the template of that system (File on macOS too).
const mediaDialogDetail = (isMac) => {
    const menu = buildMenuTemplate({ isMac }).find((top) => top.submenu && top.submenu.some((item) => item.label === FORGET_MEDIA_LABEL))
    return `Your answer is remembered for this address. To be asked again: ${menu.label} > ${FORGET_MEDIA_LABEL}.`
}

module.exports = { buildMenuTemplate, mediaDialogDetail, FORGET_MEDIA_LABEL }
