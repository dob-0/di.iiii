import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { injectHead, stripEmitter, HEAD_BEGIN } from './inject.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const html = fs.readFileSync(path.join(HERE, 'lava-friends.html'), 'utf8')
const src = html.split('<script id="logic">')[1].split('</script>')[0]
const sandbox = { module: { exports: {} } }
vm.runInNewContext(src, sandbox)
const { Round, FR, mulberry32 } = sandbox.module.exports
const mk = (consts) => new Round({ cols: 10, rows: 10, rng: mulberry32(7), consts })
const run = (g, sec, dt = 0.05) => { for (let t = 0; t < sec; t += dt) g.update(dt) }
const names = (g) => g.drain().map((e) => e.event)

describe('friends logic', () => {
    it('first finger starts a countdown, then play; lava is warned before it burns', () => {
        const g = mk(); g.down(1, 2.5, 2.5)
        expect(g.phase).toBe('count'); run(g, 3.2); expect(g.phase).toBe('play')
        expect(names(g)).toContain('start')
        run(g, 3)
        expect(g.tiles.some((t) => t.s === 1)).toBe(true)
    })
    it('3 fingers, one burns, last finger wins', () => {
        const g = mk({ FOCUS: 0 }); g.down(1, 1.5, 1.5); g.down(2, 5.5, 5.5); g.down(3, 8.5, 8.5)
        run(g, 3.1); g.drain(); expect(g.total).toBe(3)
        g.cell(8, 8).s = 2; g.cell(8, 8).t = 9; g.move(3, 8.6, 8.6); g.update(0.05)   // finger 3 stands on lava
        expect(g.alive()).toBe(2); expect(names(g)).toContain('burn')
        g.up(1); run(g, 0.7); expect(g.alive()).toBe(1)           // finger 1 lifted past grace
        expect(g.phase).toBe('over'); expect(g.result).toBe('win'); expect(g.winner.num).toBe(2)
        expect(g.hearts()).toBe(2)
    })
    it('a lifted finger put back within 0.5 s stays in; late is out', () => {
        const g = mk({ FOCUS: 0 }); g.down(1, 1.5, 1.5); g.down(2, 7.5, 7.5); run(g, 3.1)
        g.up(1); run(g, 0.3); g.down(9, 2.0, 1.5); expect(g.alive()).toBe(2); expect(g.players.get(9).num).toBe(1)
        g.up(9); run(g, 0.6); expect(g.alive()).toBe(1)
    })
    it('solo ends with dead and the seconds; auto restart after OVER_SEC; touch restarts', () => {
        const g = mk({ FOCUS: 0 }); g.down(1, 1.5, 1.5); run(g, 3.1); g.up(1); run(g, 0.7)
        expect(g.phase).toBe('over'); expect(g.result).toBe('solo'); expect(names(g)).toContain('dead')
        run(g, 5.1); expect(g.phase).toBe('ready'); expect(names(g)).toContain('restart')
        g.down(5, 1, 1); run(g, 3.1); g.up(5); run(g, 0.7); expect(g.phase).toBe('over')
        run(g, 1.1); g.down(6, 1, 1); expect(g.phase).toBe('count')
    })
    it('pace ramps: round lasts 30-90 s for a player who keeps moving; flood ends it by FLOOD_SEC', () => {
        const g = mk(); g.down(1, 5, 5); run(g, 3.1)
        expect(g.hearts()).toBe(5)
        const lvl0 = g.level(); g.time += 40; expect(g.level()).toBeGreaterThan(lvl0); g.time = 1000; expect(g.level()).toBe(1)
        const f = mk({ FOCUS: 0 }); f.down(1, 5, 5); run(f, 3.1)
        // still: the flood ends the round within FLOOD_SEC + warning
        f.drain(); run(f, FR.FLOOD_SEC + 3); expect(names(f)).toContain('dead')
    })
    it('hub values stay in range', () => {
        const g = mk(); g.down(1, 1, 1); g.down(2, 5, 5); g.down(3, 8, 8); run(g, 20)
        expect(g.level()).toBeGreaterThanOrEqual(0); expect(g.level()).toBeLessThanOrEqual(1)
        expect(g.hearts()).toBeGreaterThanOrEqual(0); expect(g.hearts()).toBeLessThanOrEqual(5)
    })
    it('head injection adds the hub client and strips back', () => {
        const out = injectHead(html); expect(out).toContain(HEAD_BEGIN); expect(stripEmitter(out)).toBe(html)
    })
})
