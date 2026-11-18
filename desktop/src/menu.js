'use strict'

const buildMenuTemplate = ({ isMac, onForgetMedia }) => [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
        label: 'File',
        submenu: [
            { label: 'Forget camera and microphone answers', click: () => onForgetMedia && onForgetMedia() },
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

module.exports = { buildMenuTemplate }
