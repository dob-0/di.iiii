/**
 * Every string an artist reads, in one file.
 *
 * Voice, from the brand guide: spec-sheet, not sales copy. Short fragments.
 * Lowercase headlines, no exclamation. In practice that means an imperative or
 * a plain statement, and `state — next action` joined by an em dash. No Docker
 * or npm words unless --verbose. Nobody is congratulated for installing
 * software.
 */

import process from 'node:process'

const canColor = () => {
    if (process.env.NO_COLOR) return false
    if (process.env.DI_NO_COLOR) return false
    return Boolean(process.stdout.isTTY)
}

const ESC = String.fromCharCode(27)
const wrap = (code) => (text) => (canColor() ? `${ESC}[${code}m${text}${ESC}[0m` : text)

export const style = {
    cyan: wrap('36'),
    dim: wrap('2'),
    bold: wrap('1'),
    red: wrap('31'),
    yellow: wrap('33')
}

/**
 * What the artist actually types. The installer falls back to `dii` when a
 * foreign `di` already exists on the machine, so a message hardcoding "di down"
 * would send them to somebody else's binary. The shim exports its own basename.
 */
export const CMD = (() => {
    const name = String(process.env.DI_COMMAND || '').trim()
    return /^[A-Za-z0-9_.-]+$/.test(name) ? name : 'di'
})()

export const say = (message = '') => { process.stdout.write(`${message}\n`) }
export const warn = (message = '') => { process.stderr.write(`${style.yellow(message)}\n`) }
export const fail = (message = '') => { process.stderr.write(`${style.red(message)}\n`) }

export const ui = {
    running: (url, spaces) => [
        `di.iiii is running.  ${style.cyan(url)}`,
        spaces?.length ? style.dim(`your spaces: ${spaces.join(', ')}`) : null,
        style.dim(`stop it with: ${CMD} down`)
    ].filter(Boolean).join('\n'),

    alreadyRunning: (url) => `already running — ${style.cyan(url)}`,

    stopped: (dataDir) => `stopped. your work is safe in ${dataDir}`,
    notRunning: () => 'not running.',

    starting: () => style.dim('starting…'),
    installing: (version) => style.dim(`installing ${version}…`),

    updated: (from, to) => `${from} → ${to}. your work was not touched.`,
    upToDate: (version) => `${version} — already the newest.`,
    updateAvailable: (current, next) => style.dim(`${current} → ${next} available — ${CMD} update`),
    rolledBack: (to) => `back on ${to}. your work was not touched.`,
    noPrevious: () => 'nothing to roll back to — only one version is installed.',
    updateFailed: (version) => `update failed, still on ${version}. your work was not touched.`,

    backed: (file, size) => [
        `saved ${file}${size ? ` (${size})` : ''}`,
        style.dim('this one file is your whole di.iiii — copy it anywhere.')
    ].join('\n'),

    restoreWarning: (dataDir) => [
        `this replaces what is in ${dataDir}.`,
        style.dim('back it up first with: di backup')
    ].join('\n'),

    notInstalled: () => [
        'di.iiii is not installed here.',
        style.dim('install it with:  curl -fsSL https://di-studio.xyz/get | sh')
    ].join('\n'),

    // The one screen an artist is asked to read when something is wrong. It
    // names the two ways forward and does not rank them by what a developer
    // would prefer.
    noRuntime: () => [
        'di.iiii could not start on this machine.',
        '',
        '  docker    not found',
        '  node.js   not found, and nodejs.org could not be reached',
        '',
        'you need one of these. pick whichever sounds easier:',
        '',
        `  docker desktop  ${style.cyan('https://docker.com/products/docker-desktop')}`,
        `                  install it, open it once, then run:  ${CMD} up`,
        `  node.js 22      ${style.cyan('https://nodejs.org')}`,
        `                  the big green LTS button, then run:  ${CMD} up`,
        '',
        'nothing was installed. full report:  di doctor'
    ].join('\n'),

    nodeTooOld: (found, needed) => [
        `node ${found} is too old — di.iiii needs ${needed} or newer.`,
        style.dim('di can download its own copy, or update yours from nodejs.org')
    ].join('\n'),

    pathHint: (binDir) => [
        style.dim('open a new terminal, or run:'),
        `  export PATH="${binDir}:$PATH"`
    ].join('\n'),

    // Printed even when the installer's own PATH already resolves: the shell
    // the artist ran curl|sh from predates the rc-file change and won't see
    // the command until a fresh one.
    freshTerminal: (cmd) => style.dim(`open a new terminal first — that puts ${cmd} on your PATH.`),

    pathHintWindows: () => style.dim('open a new terminal — PATH was updated for your user.'),

    nameTaken: (existing) => [
        `${existing} already exists on this machine and is not di.iiii.`,
        style.dim('installing as `dii` instead, so nothing of yours is shadowed.')
    ].join('\n'),

    uninstalled: (dataDir) => [
        'removed di.iiii.',
        style.dim(`your work is still at ${dataDir} — delete it yourself, or run: ${CMD} uninstall --with-data`)
    ].join('\n'),

    help: () => [
        style.bold(CMD) + style.dim(' — di.iiii on your own machine'),
        '',
        `  ${CMD} up            start it, and open it`,
        `  ${CMD} down          stop it`,
        `  ${CMD} status        what is running, where, and how big`,
        `  ${CMD} open          open it in your browser`,
        '',
        `  ${CMD} backup        write your whole di.iiii to one file`,
        `  ${CMD} restore FILE  read one back in`,
        '',
        `  ${CMD} update        get the newest version — never touches your work`,
        `  ${CMD} logs [-f]     what the server is saying`,
        `  ${CMD} doctor        what this machine can and cannot do`,
        `  ${CMD} where         the three paths that matter`,
        `  ${CMD} uninstall     remove it, keep your work`,
        '',
        style.dim('  --port N     run somewhere other than 4000'),
        style.dim('  --verbose    show the docker/npm/node underneath'),
        ''
    ].join('\n')
}
