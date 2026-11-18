// browserApp — which Flatpak browser the di tools launch. ONE setting, read the same way by
// every launcher here and by di-atlas's di-browser (the file is the interface, no shelling out):
//
//   1. env DI_BROWSER_APP                      (a short name or an app id; empty = not set)
//   2. ${XDG_CONFIG_HOME:-$HOME/.config}/di/browser.conf   line `app=<short name | app id>`
//   3. org.chromium.Chromium                   (today's browser; nothing changes until a value is set)
//
// Short names: `chromium` = org.chromium.Chromium, `ungoogled` = io.github.ungoogled_software.ungoogled_chromium.
// A value that is set but not one of these is refused with ONE line (never a silent fallback).
// A missing, empty or unreadable file is the default. The shell twin is scripts/lib/browser-app.sh.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const CHROMIUM = 'org.chromium.Chromium'
export const UNGOOGLED = 'io.github.ungoogled_software.ungoogled_chromium'
export const SHORT_NAMES = { chromium: CHROMIUM, ungoogled: UNGOOGLED }
const KNOWN = new Set(Object.values(SHORT_NAMES))

export const browserConfPath = (env = process.env, home = os.homedir()) =>
    path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'di', 'browser.conf')

/** The `app=` value of browser.conf ('' when the file or the key is missing). The last app= line wins. */
export const readBrowserConf = (env = process.env, home = os.homedir(), readFile = fs.readFileSync) => {
    let text
    try { text = readFile(browserConfPath(env, home), 'utf8') } catch { return '' }
    let app = ''
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const eq = line.indexOf('=')
        if (eq < 0) continue
        if (line.slice(0, eq).trim() === 'app') app = line.slice(eq + 1).trim()
    }
    return app
}

/** The app id of THE browser. Throws a one-line Error for a set but unknown value. */
export const browserApp = ({ env = process.env, home = os.homedir(), readFile = fs.readFileSync } = {}) => {
    const fromEnv = (env.DI_BROWSER_APP || '').trim()
    const value = fromEnv || readBrowserConf(env, home, readFile)
    if (!value) return CHROMIUM
    if (Object.hasOwn(SHORT_NAMES, value)) return SHORT_NAMES[value]
    if (KNOWN.has(value)) return value
    const where = fromEnv ? 'DI_BROWSER_APP' : browserConfPath(env, home)
    throw new Error(`browser: unknown app "${value}" in ${where} (use: chromium, ungoogled, ${CHROMIUM}, ${UNGOOGLED})`)
}

/** Chromium keeps every path it has today; any other app gets its own (never share a profile across versions). */
export const isChromium = (app) => app === CHROMIUM

/** The Flatpak's own data dir for an app: ~/.var/app/<app>/<sub> (Chromium's paths are today's paths). */
export const flatpakVar = (app, sub, home = os.homedir()) => path.join(home, '.var/app', app, sub)

/** dev-stack (DEV_BROWSER): the command that opens the dev page on a wiped dev profile. */
export const devBrowserCommand = (url, opts = {}) => {
    const app = browserApp(opts)
    const profile = flatpakVar(app, 'data/dev-profile', opts.home)
    return { app, profile, command: 'flatpak', args: ['run', app, `--user-data-dir=${profile}`, url] }
}

/** rig-links: the throwaway debugging browser (profile inside the Flatpak's own cache). */
export const rigLinksBrowserCommand = (port, pid, opts = {}) => {
    const app = browserApp(opts)
    const profile = path.join(flatpakVar(app, 'cache', opts.home), `rig-links-${pid}`)
    return {
        app, profile, command: 'flatpak',
        args: ['run', app, `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
    }
}
