'use strict'

const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, Menu, session, shell, desktopCapturer, dialog } = require('electron')
const { resolveTarget, resolveCdpPort } = require('./policy')
const { createPermissionHandlers, createDisplayMediaHandler, attachNavigationGuards } = require('./handlers')
const { buildMenuTemplate } = require('./menu')

const argv = process.argv.slice(app.isPackaged ? 1 : 2)
const target = resolveTarget(argv, process.env)
const cdp = resolveCdpPort(process.env)

const fail = (message) => {
    process.stderr.write(`di.iiii: ${message}\n`)
    app.exit(2)
}

// A test double for the system browser: when set, links that would leave di
// are appended to this file instead of opening a browser.
const openExternal = (url) => {
    const log = process.env.DI_DESKTOP_EXTERNAL_LOG
    if (log) {
        fs.appendFileSync(log, `${url}\n`)
        return
    }
    shell.openExternal(url)
}

if (target.error) {
    fail(target.error)
} else if (cdp && cdp.error) {
    fail(cdp.error)
} else {
    // One profile per channel: prod, dev, local and each custom address keep
    // their own sign-ins and storage.
    const dataBase = process.env.DI_DESKTOP_DATA_DIR || app.getPath('appData')
    app.setPath('userData', path.join(dataBase, `di-desktop-${target.channel}`))

    // WebGPU: Windows and macOS need nothing. No page of the pinned Electron's
    // docs names a WebGPU switch for Linux, so these two Chromium switches are
    // a measured choice, not a documented one; DI_DESKTOP_GPU=default drops them.
    if (process.platform === 'linux' && process.env.DI_DESKTOP_GPU !== 'default') {
        app.commandLine.appendSwitch('enable-unsafe-webgpu')
        app.commandLine.appendSwitch('enable-features', 'Vulkan')
    }
    if (cdp && cdp.port) {
        app.commandLine.appendSwitch('remote-debugging-port', String(cdp.port))
        app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
    }

    const lock = app.requestSingleInstanceLock()
    if (!lock) {
        app.quit()
    } else {
        let mainWindow = null
        app.on('second-instance', () => {
            if (!mainWindow) return
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        })

        app.on('web-contents-created', (event, contents) => {
            attachNavigationGuards(contents, { allowed: target.allowed, openExternal })
        })

        const showOffline = (win, code) => {
            win.loadFile(path.join(__dirname, 'offline.html'), { query: { target: target.url, code: String(code) } })
        }

        const chooseSource = async (sources) => {
            const shown = sources.slice(0, 8)
            const { response } = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                title: 'di.iiii',
                message: 'Share a screen or window',
                buttons: [...shown.map((source) => source.name.slice(0, 60)), 'Cancel'],
                cancelId: shown.length,
                defaultId: 0
            })
            return response < shown.length ? shown[response] : null
        }

        app.whenReady().then(() => {
            const permissions = createPermissionHandlers(target.allowed)
            const ses = session.defaultSession
            ses.setPermissionRequestHandler(permissions.request)
            ses.setPermissionCheckHandler(permissions.check)
            ses.setDisplayMediaRequestHandler(
                createDisplayMediaHandler({
                    allowed: target.allowed,
                    getSources: (options) => desktopCapturer.getSources(options),
                    choose: chooseSource
                }),
                { useSystemPicker: true }
            )

            Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate({ isMac: process.platform === 'darwin' })))

            mainWindow = new BrowserWindow({
                width: 1440,
                height: 900,
                minWidth: 480,
                minHeight: 360,
                title: 'di.iiii',
                backgroundColor: '#000000',
                show: false,
                webPreferences: {
                    contextIsolation: true,
                    sandbox: true,
                    nodeIntegration: false
                }
            })
            mainWindow.once('ready-to-show', () => mainWindow.show())
            // The window is called di.iiii whatever page it shows.
            mainWindow.on('page-title-updated', (event) => event.preventDefault())
            mainWindow.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
                // -3 is a load that was cancelled by a newer one.
                if (isMainFrame && code !== -3) showOffline(mainWindow, code)
            })
            mainWindow.on('closed', () => { mainWindow = null })
            mainWindow.loadURL(target.url)
        })

        app.on('window-all-closed', () => app.quit())
    }
}
