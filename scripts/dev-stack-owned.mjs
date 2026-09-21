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

/** Parse `ps -eo pid=,args=` output into { pid, args }. */
export const parseListing = (text) => text.split('\n')
    .map((line) => line.trim())
    .filter((line) => STACK_LINE.test(line) && !NOT_A_PROCESS.test(line))
    .map((line) => ({ pid: Number(line.split(/\s+/)[0]), args: line.replace(/^\d+\s+/, '') }))
    .filter(({ pid }) => Number.isInteger(pid))

const under = (dir, root) => dir === root || dir.startsWith(root.endsWith('/') ? root : root + '/')

/**
 * Split the stack processes into ours (started under `repo`) and the rest.
 * `cwdOf(pid)` returns the process's working directory, or null when it cannot
 * be read — and null means "not ours", never "probably ours".
 */
export const ownedProcesses = (listing, repo, cwdOf, self = -1) => {
    const mine = []
    const others = []
    for (const entry of parseListing(listing)) {
        if (entry.pid === self) continue
        const cwd = cwdOf(entry.pid)
        const owned = typeof cwd === 'string' && under(cwd, repo)
        ;(owned ? mine : others).push({ ...entry, cwd })
    }
    return { mine, others }
}
