// Which dev-stack processes belong to THIS checkout.
//
// `npm run dev` is several processes — scripts/dev-stack.mjs, a `node --watch`
// supervisor, the serverXR it respawns (`node ... src/index.js`), vite — and
// none of their command lines name the repo they were started from. An
// INSTALLED di.iiii's live server is `node src/index.js` too, started the same
// way, and so are the stacks of other checkouts on the same machine. The only
// thing that separates them is the working directory each was started in, so
// that is what decides. A process whose directory cannot be read is NOT ours:
// refusing to kill an unknown process is the safe side (2026-09-21: a stop by
// pattern killed the installed di.iiii serving a stage, for the third time).

const STACK_LINE = /dev-stack\.mjs|watch-path=src|node_modules\/\.bin\/vite|[ /]src\/index\.js/
const NOT_A_PROCESS = /\bps -eo\b|bash -c/

/** Parse `ps -eo pid=,pgid=,args=` output into { pid, pgid, args }. */
export const parseListing = (text) => text.split('\n')
    .map((line) => line.trim())
    .filter((line) => STACK_LINE.test(line) && !NOT_A_PROCESS.test(line))
    .map((line) => {
        const [pid, pgid, ...rest] = line.split(/\s+/)
        return { pid: Number(pid), pgid: Number(pgid), args: rest.join(' ') }
    })
    .filter(({ pid }) => Number.isInteger(pid))

// The second signal, for a directory that cannot be read: `npm run dev` puts
// dev-stack, the watch supervisor, the server and vite in ONE process group,
// and the vite line names this checkout's node_modules in full. A process in
// the same group as this checkout's vite is ours. An installed di.iiii has no
// vite and its own group. (Found by a peer agent whose sibling sandbox hid
// /proc/<pid>/cwd from it, 2026-09-21.)
const viteGroups = (entries, repo) => new Set(entries
    .filter(({ args }) => args.includes(`${repo}/node_modules/.bin/vite`))
    .map(({ pgid }) => pgid)
    .filter(Number.isInteger))

const under = (dir, root) => dir === root || dir.startsWith(root.endsWith('/') ? root : root + '/')

/**
 * Split the stack processes into ours (started under `repo`, or in the process
 * group of this checkout's vite) and the rest. `cwdOf(pid)` returns the
 * process's working directory, or null when it cannot be read — and null on
 * its own means "not ours", never "probably ours".
 */
export const ownedProcesses = (listing, repo, cwdOf, self = -1) => {
    const mine = []
    const others = []
    const entries = parseListing(listing)
    const groups = viteGroups(entries, repo)
    for (const entry of entries) {
        if (entry.pid === self) continue
        const cwd = cwdOf(entry.pid)
        const owned = (typeof cwd === 'string' && under(cwd, repo)) || groups.has(entry.pgid)
        ;(owned ? mine : others).push({ ...entry, cwd })
    }
    return { mine, others }
}
