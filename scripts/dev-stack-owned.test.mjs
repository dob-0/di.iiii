// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { ownedProcesses, parseListing } from './dev-stack-owned.mjs'

const REPO = '/home/me/work/di.iiii-x'
// pid, process group, command line — as `ps -eo pid=,pgid=,args=` prints them.
const listing = [
    ' 100 100 node scripts/dev-stack.mjs',
    ' 101 100 node --watch-path=src --watch-path=.env src/index.js',
    ' 102 100 node /home/me/work/di.iiii-x/node_modules/.bin/vite --port 5372',
    ' 200 200 node src/index.js',                       // the INSTALLED di.iiii
    ' 300 300 node scripts/dev-stack.mjs',              // another checkout's stack
    ' 301 300 node --watch-path=src src/index.js',
    ' 302 300 node /home/me/work/di.iiii-y/node_modules/.bin/vite --port 5373',
    ' 400 400 bash -c "node scripts/dev-stack.mjs"',    // a shell line, never a target
    ' 500 500 ps -eo pid=,pgid=,args=',
].join('\n')
const cwds = {
    100: REPO, 101: REPO + '/serverXR', 102: REPO,
    200: '/home/me/.local/share/di.iiii/app',
    300: '/home/me/work/di.iiii-y', 301: '/home/me/work/di.iiii-y/serverXR', 302: '/home/me/work/di.iiii-y',
}
const cwdOf = (pid) => cwds[pid] ?? null

describe('which dev-stack processes are mine', () => {
    it('lists only stack processes, never the shell or ps lines', () => {
        expect(parseListing(listing).map((p) => p.pid)).toEqual([100, 101, 102, 200, 300, 301, 302])
    })
    it('keeps the ones started under this checkout, serverXR subdir included', () => {
        const { mine } = ownedProcesses(listing, REPO, cwdOf)
        expect(mine.map((p) => p.pid)).toEqual([100, 101, 102])
    })
    it('leaves the installed di.iiii and every other checkout alone', () => {
        const { others } = ownedProcesses(listing, REPO, cwdOf)
        expect(others.map((p) => p.pid)).toEqual([200, 300, 301, 302])
    })
    it('claims a process by process group when a sandbox hides its directory but this checkout\'s vite shares the group', () => {
        const { mine, others } = ownedProcesses(listing, REPO, () => null)
        expect(mine.map((p) => p.pid)).toEqual([100, 101, 102])
        expect(others.map((p) => p.pid)).toEqual([200, 300, 301, 302])
    })
    it('with no vite of ours running, an unreadable directory is NOT mine', () => {
        const noVite = listing.split('\n').filter((l) => !l.includes('di.iiii-x/node_modules')).join('\n')
        const { mine, others } = ownedProcesses(noVite, REPO, () => null)
        expect(mine).toEqual([])
        expect(others).toHaveLength(6)
    })
    it('does not confuse a sibling checkout with a shared prefix', () => {
        const { mine } = ownedProcesses(listing, REPO, (pid) => (pid === 300 ? REPO + 'y' : cwdOf(pid)))
        expect(mine.map((p) => p.pid)).toEqual([100, 101, 102])
    })
    it('never kills itself', () => {
        const { mine } = ownedProcesses(listing, REPO, cwdOf, 100)
        expect(mine.map((p) => p.pid)).toEqual([101, 102])
    })
})
