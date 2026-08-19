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

    // The file menu. A space bundle is one file holding everything a piece of
    // work is made of; these are the four sentences that make it feel like one.
    made: (id, url) => `made ${id}.\n  ${url}`,
    saved: (id, file, size) => `${id} → ${file}${size ? ` (${size})` : ''}\n`
        + `  one file, everything in it. open it on any di.iiii with: ${CMD} open ${file}`,
    opened: (id, url) => `opened ${id}.\n  ${url}`,
    openedNothing: (name) => `${name} was not opened — see above. Your di.iiii is unchanged.`,
    spacesHere: (ids) => ['in this di.iiii:', ...ids.map((id) => `  ${id}`)].join('\n'),
    noSpacesYet: () => `nothing here yet. make one with: ${CMD} new "my show"`,

    updated: (from, to) => `${from} → ${to}. your work was not touched.`,
    upToDate: (version) => `${version} — already the newest.`,
    updateAvailable: (current, next) => style.dim(`${current} → ${next} available — ${CMD} update`),
    rolledBack: (to) => `back on ${to}. your work was not touched.`,
    noPrevious: () => 'nothing to roll back to — only one version is installed.',
    updateFailed: (version) => `update failed, still on ${version}. your work was not touched.`,

    // An update opens a copy of your work before it commits to anything. This
    // line is what that second or two is.
    rehearsing: () => style.dim('  checking it can open your work…'),

    snapshotTaken: (dir) => style.dim(`  this update changes how your work is stored — copy kept at ${dir}`),

    // "Not the same version" is not "newer". A machine installed from a file,
    // or running an rc, is ahead of the feed and must not be walked backwards.
    aheadOfRelease: (mine, theirs) =>
        `${mine} is newer than the published ${theirs} — nothing to update to.\n`
        + `  install it anyway with:  ${CMD} update --force`,

    // The one an update cannot undo by itself: the app goes back, the data
    // does not. Said BEFORE anything moves.
    rollbackCrossesSchema: (dataSchema, targetSchema, snapshot) =>
        `that version is older than your work.\n`
        + `  your work is stored in shape ${dataSchema}; that version reads ${targetSchema}\n\n`
        + `Rolling back would give you an app that misreads your own spaces rather\n`
        + `than one that fails — so nothing has been moved.\n`
        + (snapshot
            ? `  the copy taken before that update:  ${CMD} restore --snapshot ${snapshot}\n`
            : `  no snapshot was taken before that update\n`)
        + `  or, if you know the difference and accept it:  DI_ALLOW_OLDER_CODE=1`,

    snapshotList: (snapshots) => snapshots.length
        ? ['copies of your work, newest first:', ...snapshots.map((s) => `  ${s.name}`)].join('\n')
        : 'no snapshots yet — one is taken automatically before an update that changes how your work is stored.',

    snapshotRestored: (name) => `restored ${name}. what was there was moved aside, not deleted.`,

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

    askForKey: () => 'paste the sync key for this space (minted in its settings online): ',
    checkingKey: () => style.dim('checking the key against the remote…'),

    linkRefused: (reason, spaceId) => ({
        unreachable: 'that address is not answering — check the url, and that you are online.',
        denied: 'the remote refused this key — mint a fresh one in the space settings online.',
        missing: `the remote answers, but has no space called ${spaceId}.`,
        'no-verbatim': 'that server is too old to read from safely — update it first.'
    })[reason] || `could not link: ${reason}`,

    linked: (spaceId, base) => [
        `${spaceId} is linked to ${style.cyan(base)}`,
        style.dim(`see where they stand with:  ${CMD} sync ${spaceId}`)
    ].join('\n'),

    notLinked: (spaceId) => [
        `${spaceId} is not linked to anything.`,
        style.dim(`link it with:  ${CMD} link ${spaceId} --remote <url>`)
    ].join('\n'),

    // The whole point of this report is what it refuses to claim: version
    // numbers are per-install counters and cannot be compared across sides,
    // so "in sync" is only ever said relative to a recorded baseline.
    syncReport: ({ spaceId, remote, local, remote_: online, audit }) => {
        const sideLine = (side) => !side?.reachable ? style.red('not answering')
            : !side.exists ? style.dim('no such space')
            : side.denied ? style.red('access refused')
            : [
                `v${side.version}`,
                `${side.objectCount} object${side.objectCount === 1 ? '' : 's'}`,
                `${side.assetIds.length} asset${side.assetIds.length === 1 ? '' : 's'}${side.missingAssetIds.length ? style.yellow(` (${side.missingAssetIds.length} missing here)`) : ''}`
            ].join(style.dim(' · '))
        const relationLine = {
            'unknown': 'unknown — nothing proves these two share history yet',
            'in-sync-as-of-last-sync': 'neither side has changed since the last sync',
            'local-ahead': 'this machine has changes the remote has not seen',
            'remote-ahead': 'the remote has changes this machine has not seen',
            'diverged': style.yellow('both sides changed since the last sync — they have diverged')
        }[audit.relation]
        const counts = (only, label) => only.length ? `${only.length} only ${label}` : null
        const direction = (name, d) => d.allowed
            ? `${name} — possible`
            : `${name} — refused: ${d.reasons[0] || 'unknown'}`
        return [
            `${style.bold(spaceId)}  ${style.dim(remote)}`,
            `  here    ${sideLine(local)}`,
            `  online  ${sideLine(online)}`,
            '',
            `  ${relationLine}`,
            [counts(audit.assets.onlyLocal, 'here'), counts(audit.assets.onlyRemote, 'online')].filter(Boolean).length
                ? `  assets: ${[counts(audit.assets.onlyLocal, 'here'), counts(audit.assets.onlyRemote, 'online')].filter(Boolean).join(style.dim(' · '))}`
                : null,
            [counts(audit.projects.onlyLocal, 'here'), counts(audit.projects.onlyRemote, 'online')].filter(Boolean).length
                ? `  projects: ${[`${audit.projects.common.length} shared`, counts(audit.projects.onlyLocal, 'here'), counts(audit.projects.onlyRemote, 'online')].filter(Boolean).join(style.dim(' · '))}`
                : null,
            '',
            `  ${style.dim(direction('push', audit.push))}`,
            `  ${style.dim(direction('pull', audit.pull))}`,
            '',
            style.dim('  nothing was written — this command only looks.')
        ].filter((line) => line !== null).join('\n')
    },

    help: () => [
        style.bold(CMD) + style.dim(' — di.iiii on your own machine'),
        '',
        `  ${CMD} up            start it, and open it`,
        `  ${CMD} down          stop it`,
        `  ${CMD} status        what is running, where, and how big`,
        `  ${CMD} open          open it in your browser`,
        '',
        `  ${CMD} new NAME      start a new space`,
        `  ${CMD} save SPACE    save it as one file you can carry anywhere`,
        `  ${CMD} open FILE     open a file someone saved (or ${CMD} open, for di.iiii itself)`,
        `  ${CMD} spaces        what is in this di.iiii`,
        `  ${CMD} backup        write your whole di.iiii to one file`,
        `  ${CMD} restore FILE  read one back in`,
        `  ${CMD} restore --snapshot   the copies taken automatically before an update`,
        '',
        `  ${CMD} link SPACE --remote URL   connect one space to an online di.iiii`,
        `  ${CMD} sync SPACE    compare it with its online copy — writes nothing`,
        '',
        `  ${CMD} update        get the newest version — never touches your work`,
        `  ${CMD} update --from FILE   update from an artifact on this machine (no network)`,
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
