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
    // What a start prints. It used to be three lines — the address, six space
    // ids and how to stop — and everything else di.iiii can do was a thing you
    // had to already know: the tools room, the lighting desk, the wiki, and
    // above all that phones in the room need `--lan`. A person who has just
    // typed `di up` is exactly the person who does not know those, so they are
    // printed once, here, plainly.
    running: (url, spaces, { spaceCount = null, lan = false, prettyUrl = null, secure = false } = {}) => {
        const base = prettyUrl || url
        // The note column is measured, not guessed: a certificate makes every
        // address longer and a fixed width silently ran the two together.
        const width = Math.max(...['/tools', '/spaces', '/light/', '/wiki'].map(path => `${base}${path}`.length)) + 3
        const door = (word, path, note) => `  ${style.cyan(word.padEnd(8))}${`${base}${path}`.padEnd(width)}${style.dim(note)}`
        const spacesNote = spaceCount === null
            ? (spaces?.length ? spaces.join(', ') : 'your spaces')
            : `${spaceCount} ${spaceCount === 1 ? 'space' : 'spaces'}${spaces?.length ? ` — ${spaces.slice(0, 4).join(', ')}…` : ''}`
        return [
            `di.iiii is running.  ${style.cyan(prettyUrl || url)}`,
            prettyUrl && secure
                ? style.dim('  a real certificate — so the camera, the microphone, MIDI and XR all work.')
                : (prettyUrl ? style.dim(`  one address, here and on the phones. ${url} answers too.`) : null),
            '',
            door('tools', '/tools', 'every tool, in one room'),
            door('spaces', '/spaces', spacesNote),
            door('light', '/light/', 'the lighting desk — output off until you say so'),
            door('wiki', '/wiki', 'how all of it works'),
            '',
            lan ? null : style.dim(`phones in the room cannot reach this — ${CMD} down, then ${CMD} up --lan`),
            style.dim(`${CMD} help for the rest · ${CMD} down to stop`)
        ].filter(value => value !== null).join('\n')
    },

    alreadyRunning: (url, reach = null, wantedLan = false) => [
        `already running — ${style.cyan(url)}${reach ? style.dim(`  ${reach.lan ? 'on this network too' : 'this machine only'}`) : ''}`,
        wantedLan && reach && !reach.lan
            ? style.dim(`to let the room in: ${CMD} down, then ${CMD} up --lan`)
            : null
    ].filter(Boolean).join('\n'),

    // `--lan`. The room can open it, and with auth off the room can edit it —
    // said once, plainly, on every such start, because nothing writes the flag
    // down and nobody should inherit it by accident.
    // With a name published there is nothing left to say about addresses — the
    // card already printed the one everyone types. The numbers stay, dimmed,
    // for the phone whose resolver does not do mDNS.
    onThisNetwork: (urls, namedUrl = null, guests = false) => [
        urls.length
            ? [namedUrl ? style.dim('if a phone cannot find that name:') : 'on this network:',
                ...urls.map(({ url, iface }) => `  ${namedUrl ? style.dim(url) : style.cyan(url)}  ${style.dim(`(${iface})`)}`)].join('\n')
            : 'on this network:  no address yet — join a wifi or a hotspot and it answers there too.',
        guests
            ? ui.guestsOn()
            : style.yellow(`anyone on this network can open and edit it — auth is off. ${CMD} down when the room is done.`)
    ].filter(Boolean).join('\n'),

    lanNotInDocker: () => '--lan is not available in docker mode — that install answers on this machine only.',

    // ── one space, two installs ───────────────────────────────────────────
    // The words a person reads off one laptop and types into another. The key
    // is shown once and belongs to that space alone.
    invited: (spaceId, url, key) => [
        `${style.cyan(spaceId)} is open to one other di.iiii.`,
        '',
        'on their machine:',
        `  ${style.cyan(`${CMD} follow ${spaceId} --from ${url} --key ${key}`)}`,
        '',
        style.dim('or, to keep the key out of their shell history:'),
        style.dim(`  echo '${key}' | ${CMD} follow ${spaceId} --from ${url} --key -`),
        '',
        style.dim('that key opens this space and nothing else, and you can take it back:'),
        style.dim(`  ${CMD} invite ${spaceId} --revoke`)
    ].join('\n'),

    inviteRefused: (spaceId, reason) => [
        `could not open ${spaceId} to anyone.`,
        style.dim(reason ? String(reason) : 'the server refused, and said nothing about why.')
    ].join('\n'),

    noInvites: (spaceId) => `${spaceId} has no keys out. ${style.dim('nothing to take back.')}`,
    invitesRevoked: (spaceId, count) => [
        `took back ${count} ${count === 1 ? 'key' : 'keys'} for ${style.cyan(spaceId)}.`,
        style.dim('any di.iiii following it with one of those stops carrying now.')
    ].join('\n'),

    // A space of this name is already here. Wiring someone else's log into it
    // would merge two people's work with no way to tell afterwards which was
    // whose — `main` is the front room on every install, and ids are short
    // words that collide.
    followWouldMerge: (spaceId) => [
        `you already have a space called ${style.cyan(spaceId)}.`,
        style.dim('following would join the two, both ways, and nothing here would say which edits were whose.'),
        style.dim(`if that is what you want, say so: ${CMD} follow ${spaceId} --from … --key … --into ${spaceId}`)
    ].join('\n'),

    checkingFollow: () => style.dim('looking for that di.iiii…'),

    followRefused: (reason, where) => ({
        unreachable: `nothing answers at ${where} — check the address, and that both machines are on the same wifi.`,
        missing: 'that di.iiii has no space by that name.',
        denied: 'that key was refused — ask for a fresh one: di invite <space> on their machine.',
        'local-space': 'this install could not make room for it — is di.iiii running here?',
        itself: 'that address is this di.iiii — a space cannot follow itself.'
    }[reason] || `could not follow ${where}.`),

    following: (spaceId, remote, running) => [
        `following ${style.cyan(spaceId)} on ${remote.replace(/\/serverXR$/, '')}.`,
        style.dim('edits travel both ways — the room and every project in it. your copy stays on your disk.'),
        // Said plainly rather than discovered: images and models are not carried
        // yet, so a scene that leans on them will show their absence until they
        // are. Better a sentence now than a grey wall later.
        style.dim('images and models are not carried yet — they stay where they were added.'),
        running ? null : style.dim(`start it to begin: ${CMD} up`)
    ].filter(Boolean).join('\n'),

    followList: (follows, live) => {
        const ids = Object.keys(follows || {})
        if (!ids.length) return `this di.iiii follows nothing. ${style.dim(`${CMD} follow <space> --from <url> --key <key>`)}`
        const byId = new Map((live || []).map(entry => [entry.spaceId, entry]))
        return ids.map((id) => {
            const entry = follows[id]
            const state = byId.get(id)
            const where = String(entry.remote || '').replace(/\/serverXR$/, '')
            if (!state) return `  ${style.cyan(id.padEnd(18))}${where}  ${style.dim('(not running)')}`
            const moving = `${state.status} · in ${state.carriedIn} · out ${state.carriedOut}${state.streams > 1 ? ` · ${state.streams} logs` : ''}`
            return `  ${style.cyan(id.padEnd(18))}${where}  ${state.lastError ? style.yellow(state.lastError) : style.dim(moving)}`
        }).join('\n')
    },

    unfollowed: (spaceId) => `no longer following ${spaceId}. ${style.dim('your copy stays exactly as it is.')}`,
    notFollowing: (spaceId) => `this di.iiii was not following ${spaceId}.`,

    guestsWithoutLan: () => `--guests only matters with --lan: on a loopback start nobody else can reach this. Try: ${CMD} up --lan --guests`,

    // Said in place of the "anyone can edit it" warning, because it is the
    // opposite fact and the room deserves to hear which one is true tonight.
    guestsOn: () => [
        'visitors arrive as guests: their own room and the open space, and nothing of yours.',
        style.dim(`you, on this machine, stay the owner — no sign-in. ${CMD} down when the room is done.`)
    ].join('\n'),

    // What `status` and `where` say about the bind in force. Asked of the
    // running server, never remembered: `--lan` is per start.
    reach: ({ lan, urls }) => lan
        ? `this network — ${urls.length ? urls.join(', ') : 'no address yet'}`
        : 'this machine only',

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
    // The two reasons `open FILE` still stops a running di.iiii, said before
    // it happens: every tab on this machine is about to lose its connection.
    tooLargeForWire: (name) => style.dim(`${name} is more than the running di.iiii takes over the wire — stopping it to open the file directly.`),
    forceStops: () => style.dim('--force replaces a space that may be open in a browser — stopping di.iiii for it.'),
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

    // Says what is in the file and what is not. It used to say "your whole
    // di.iiii", and the light show was not in it; accounts still are not.
    backed: (file, size, { lightShow = false, agentChat = false } = {}) => [
        `saved ${file}${size ? ` (${size})` : ''}`,
        style.dim(`  inside: every space (scenes, projects, assets)${lightShow ? ', the light show' : ''}${agentChat ? ', the agent chat folder' : ''}, and this di.iiii's settings.`),
        style.dim('  not inside: accounts, sign-ins and the AI chat history — those stay with this machine.'),
        style.dim(`  read it back on any di.iiii with: ${CMD} restore FILE`)
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

    // `di mcp --help` and `di help mcp`. Printed instead of starting the
    // server, which is what --help used to do — silently, on stdin.
    mcpUsage: () => [
        style.bold(`${CMD} mcp`) + style.dim(' — hand this di.iiii to an agent that speaks MCP'),
        '',
        'not a server you leave running: the agent starts it, talks to it over stdin,',
        'and it ends with the conversation.',
        '',
        `  claude mcp add di -- ${CMD} mcp`,
        `  ${CMD} mcp --port N       talk to a di.iiii running somewhere other than 4000`,
        '',
        'reading and private moves just run. public moves — making a space public, minting',
        'an invite link, deleting a space — are refused unless the agent was started with',
        'DI_MCP_ALLOW_PUBLIC=1, and each one still has to carry confirm: true.'
    ].join('\n'),

    usageFor: (name) => ({ mcp: () => ui.mcpUsage() })[name]?.() || null,

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
        `  ${CMD} backup        every space and the light show, in one file`,
        `  ${CMD} restore FILE  read one back in`,
        `  ${CMD} restore --snapshot   the copies taken automatically before an update`,
        '',
        `  ${CMD} mcp           hand this di.iiii to Claude, or any agent that speaks MCP`,
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
        `  ${CMD} version       which di.iiii this is (also --version, -v)`,
        `  ${CMD} help mcp      more on one command (also ${CMD} mcp --help)`,
        '',
        style.dim('  --port N     run somewhere other than 4000'),
        style.dim('  --lan        answer on this wifi too, for phones in the room — anyone on it can edit'),
        style.dim('  --guests     with --lan: visitors get their own room, not yours'),
        style.dim('  --verbose    show the docker/npm/node underneath'),
        ''
    ].join('\n')
}
