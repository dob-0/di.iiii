import { describe, expect, it } from 'vitest'
import { FRAME_MAX_POINTS, normaliseFramePoints } from '../../../shared/laserFrame.js'
import { LASER_SHAPES, generateShape, parseLaserColour } from './laserShapes.js'
import * as twin from '../../../shared/laserShapes.js'

// The shapes live in shared/laserShapes.cjs since the laser desk draws them on the server (2026-10-29); this file is
// the node's old import path and must hand out the twin's own functions.
describe('the node\'s import path', () => {
    it('gives the same functions as the generated twin', () => {
        expect(generateShape).toBe(twin.generateShape)
        expect(LASER_SHAPES).toBe(twin.LASER_SHAPES)
    })
})

describe('parseLaserColour', () => {
    it('reads hex, short hex, and falls back to green', () => {
        expect(parseLaserColour('#ff0000')).toEqual([1, 0, 0])
        expect(parseLaserColour('#0f0')).toEqual([0, 1, 0])
        expect(parseLaserColour('nonsense')).toEqual([0, 1, 64 / 255])
    })
})

describe('generateShape', () => {
    it('makes every named shape a valid frame, with nothing dropped', () => {
        for (const shape of LASER_SHAPES) {
            const points = generateShape({ shape, size: 1, rotation: 0.13, points: 150 })
            expect(points.length, shape).toBeGreaterThan(8)
            expect(normaliseFramePoints(points).dropped, shape).toBe(0)
            expect(points.some((p) => p[2] + p[3] + p[4] > 0), shape).toBe(true)
        }
    })

    it('closes the loops', () => {
        for (const shape of ['circle', 'square', 'triangle', 'star']) {
            const p = generateShape({ shape, size: 1, points: 100 })
            expect(p[0][0]).toBeCloseTo(p[p.length - 1][0], 6)
            expect(p[0][1]).toBeCloseTo(p[p.length - 1][1], 6)
        }
    })

    it('puts blank moves between the fan lines and none in the star', () => {
        const blanks = (shape) => generateShape({ shape, points: 100 }).filter((p) => p[2] + p[3] + p[4] === 0).length
        expect(blanks('fan')).toBe(4)
        expect(blanks('star')).toBe(0)
    })

    it('stays inside -1..1 and the point cap, whatever it is asked', () => {
        const p = generateShape({ shape: 'square', size: 9, rotation: 0.125, points: 1e9 })
        expect(p.length).toBeLessThanOrEqual(FRAME_MAX_POINTS)
        for (const [x, y] of p) { expect(Math.abs(x)).toBeLessThanOrEqual(1); expect(Math.abs(y)).toBeLessThanOrEqual(1) }
    })

    it('scales the colour by level, and level 0 is dark', () => {
        const [, , r, g, b] = generateShape({ colour: '#ff8000', level: 0.5 })[1]
        expect(r).toBeCloseTo(0.5, 5)
        expect(g).toBeCloseTo(0.25, 1)
        expect(b).toBe(0)
        expect(generateShape({ level: 0 }).every((p) => p[2] + p[3] + p[4] === 0)).toBe(true)
    })

    it('turns with rotation, and spin advances it with time', () => {
        const base = generateShape({ shape: 'line', size: 1, points: 8 })
        expect(base[0][0]).toBeCloseTo(-1, 6)
        const quarter = generateShape({ shape: 'line', size: 1, points: 8, rotation: 0.25 })
        expect(quarter[0][0]).toBeCloseTo(0, 6)
        expect(quarter[0][1]).toBeCloseTo(-1, 6)
        const spun = generateShape({ shape: 'line', size: 1, points: 8, spin: 0.25, time: 1 })
        spun.forEach((p, i) => p.forEach((v, j) => expect(v).toBeCloseTo(quarter[i][j], 6)))
    })

    it('size 0 collapses to the centre; an unknown shape is a circle', () => {
        expect(generateShape({ size: 0 }).every((p) => p[0] === 0 && p[1] === 0)).toBe(true)
        expect(generateShape({ shape: 'blob' })).toEqual(generateShape({ shape: 'circle' }))
    })
})

describe('the TouchDesigner scenes (2026-10-17)', () => {
    const blanks = (points) => points.filter((p) => p[2] + p[3] + p[4] === 0).length

    it('galaxy draws `copies` golden spirals, each reached by a blank move, the biggest radius 1', () => {
        const six = generateShape({ shape: 'galaxy', size: 1, points: 300 })
        expect(blanks(six)).toBe(5)
        const two = generateShape({ shape: 'galaxy', size: 1, points: 300, copies: 2 })
        expect(blanks(two)).toBe(1)
        expect(Math.max(...two.map((p) => Math.hypot(p[0], p[1])))).toBeCloseTo(1, 6)
        expect(normaliseFramePoints(six).dropped).toBe(0)
    })

    it('sunflower is one lit line through the seeds along their spiral arms: 13 arms at 120 points, 21 from 300 seeds on, never a dot', () => {
        // every arm crosses the half radius once, out or in: the crossings count the arms
        const arms = (pts) => pts.slice(1).filter((p, i) => (Math.hypot(p[0], p[1]) > 0.5) !== (Math.hypot(pts[i][0], pts[i][1]) > 0.5)).length
        const flower = generateShape({ shape: 'sunflower', size: 1, points: 120 })
        expect(blanks(flower)).toBe(0)
        expect(flower.length).toBe(120)
        expect(arms(flower)).toBe(13)
        for (let i = 1; i < flower.length; i += 1) expect(flower[i].slice(0, 2)).not.toEqual(flower[i - 1].slice(0, 2))
        const radii = flower.map((p) => Math.hypot(p[0], p[1]))
        expect(Math.max(...radii)).toBeGreaterThan(0.95)
        expect(Math.min(...radii)).toBeLessThan(0.1)
        // the points sit evenly along the line: no step longer than a quarter radius, so the guards add none
        const steps = flower.slice(1).map((p, i) => Math.hypot(p[0] - flower[i][0], p[1] - flower[i][1]))
        expect(Math.max(...steps)).toBeLessThan(0.35)
        // more points draw the same line more smoothly: the head keeps at most 300 seeds (21 arms), because a line
        // through more seeds is longer than a cube draws in one frame
        const head = generateShape({ shape: 'sunflower', size: 1, points: 1992 })
        expect(head.length).toBe(1992)
        expect(arms(head)).toBe(21)
        // `copies` picks the nearest Fibonacci number of arms
        expect(arms(generateShape({ shape: 'sunflower', size: 1, points: 120, copies: 10 }))).toBe(8)
    })

    it('noisy is nested rings that change with time and stay inside the circle', () => {
        const a = generateShape({ shape: 'noisy', size: 1, points: 300, time: 0 })
        const b = generateShape({ shape: 'noisy', size: 1, points: 300, time: 2 })
        expect(blanks(a)).toBe(2)
        expect(a).not.toEqual(b)
        expect(Math.max(...a.map((p) => Math.hypot(p[0], p[1])))).toBeLessThanOrEqual(1 + 1e-9)
        expect(blanks(generateShape({ shape: 'noisy', points: 300, copies: 5 }))).toBe(4)
    })

    it('grid is the whole square, the cross and both diagonals: five strokes, corners at ±1', () => {
        const g = generateShape({ shape: 'grid', size: 1, points: 200 })
        expect(blanks(g)).toBe(4)
        const xs = g.map((p) => p[0]), ys = g.map((p) => p[1])
        expect(Math.min(...xs)).toBe(-1); expect(Math.max(...xs)).toBe(1)
        expect(Math.min(...ys)).toBe(-1); expect(Math.max(...ys)).toBe(1)
        expect(g.some((p) => Math.abs(p[0]) < 1e-9 && Math.abs(Math.abs(p[1]) - 0.5) < 0.2)).toBe(true)
    })

    it('rainbow runs the hue along the path, scaled by level, and drifts with time', () => {
        const r = generateShape({ shape: 'circle', points: 120, rainbow: true, level: 0.5 })
        const lit = r.filter((p) => p[2] + p[3] + p[4] > 0)
        expect(new Set(lit.map((p) => p.slice(2).join(','))).size).toBeGreaterThan(20)
        expect(Math.max(...lit.flatMap((p) => p.slice(2)))).toBeCloseTo(0.5, 6)
        expect(generateShape({ shape: 'circle', points: 120, rainbow: true, time: 4 })[1]).not.toEqual(r[1])
    })

    it('a comma list with a cycle plays the shapes in turn; without a cycle the first', () => {
        const list = 'square,circle'
        expect(generateShape({ shape: list, cycle: 2, time: 1 })).toEqual(generateShape({ shape: 'square', time: 1 }))
        expect(generateShape({ shape: list, cycle: 2, time: 3 })).toEqual(generateShape({ shape: 'circle', time: 3 }))
        expect(generateShape({ shape: list, cycle: 2, time: 4.5 })).toEqual(generateShape({ shape: 'square', time: 4.5 }))
        expect(generateShape({ shape: list, time: 3 })).toEqual(generateShape({ shape: 'square', time: 3 }))
    })
})

describe('the minimal figures and the sparkles (2026-10-29)', () => {
    const blanks = (points) => points.filter((p) => p[2] + p[3] + p[4] === 0).length
    const has = (points, x, y) => points.some((p) => Math.abs(p[0] - x) < 1e-9 && Math.abs(p[1] - y) < 1e-9)
    // The ✦ marks of a frame: the strokes between blank moves, each as its centre (the mean of its four tips).
    const marks = (points) => {
        const out = [[]]
        for (const p of points) { if (p[2] + p[3] + p[4] === 0) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((m) => m.length).map((m) => [0, 1].map((k) => +((Math.max(...m.map((p) => p[k])) + Math.min(...m.map((p) => p[k]))) / 2).toFixed(9)))
    }

    it('the figures are one or a few strokes: arc, chevron and glint one; cross two; bars and rings `copies`; corners four', () => {
        const at = (shape, copies = 0) => blanks(generateShape({ shape, size: 1, points: 200, copies }))
        expect([at('arc'), at('chevron'), at('glint'), at('cross'), at('corners')]).toEqual([0, 0, 0, 1, 3])
        expect([at('bars'), at('bars', 5), at('rings'), at('rings', 4)]).toEqual([1, 4, 1, 3])
    })

    it('corners, chevron and the glint\'s tips are points of their own, never cut', () => {
        const corners = generateShape({ shape: 'corners', size: 1, points: 200 })
        for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) expect(has(corners, x, y), `${x},${y}`).toBe(true)
        expect(has(generateShape({ shape: 'chevron', size: 1, points: 101 }), 0, -0.5)).toBe(true)
        const glint = generateShape({ shape: 'glint', size: 1, points: 120 })
        for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) expect(has(glint, x, y), `${x},${y}`).toBe(true)
    })

    it('sparkle: on every half beat one mark, in turn, jumps; within a half beat nothing moves', () => {
        const at = (beat) => marks(generateShape({ shape: 'sparkle', size: 1, points: 300, beat }))
        expect(at(0)).toHaveLength(5)
        expect(at(0.1)).toEqual(at(0.4))
        for (let half = 0; half < 12; half += 1) {
            const before = at(half / 2)
            const after = at(half / 2 + 0.5)
            expect(after.filter((m, i) => m.join() !== before[i].join()), `half beat ${half + 1}`).toHaveLength(1)
        }
        expect(marks(generateShape({ shape: 'sparkle', points: 300, copies: 8 }))).toHaveLength(8)
    })

    it('twinkle: the marks keep their places and half of them are lit, a new half each half beat', () => {
        const at = (beat) => marks(generateShape({ shape: 'twinkle', size: 1, points: 300, beat })).map((m) => m.join())
        const seen = new Set()
        for (let beat = 0; beat < 20; beat += 0.5) {
            expect(at(beat)).toHaveLength(5)
            at(beat).forEach((m) => seen.add(m))
        }
        expect(seen.size).toBe(9)
        expect(at(0)).toEqual(at(0.3))
        expect(Array.from({ length: 8 }, (_, i) => at(i / 2).join('|')).some((m, i, all) => m !== all[0])).toBe(true)
    })

    // A ✦ of radius r lies inside its circle of radius r: two marks whose circles do not meet never cross.
    it('no two marks ever touch: sparkle with 1 to 12 marks at 200 half beats, twinkle with 1 to 10', () => {
        const circles = (points) => {
            const out = [[]]
            for (const p of points) { if (p[2] + p[3] + p[4] === 0) out.push([]); else out[out.length - 1].push(p) }
            return out.filter((m) => m.length).map((m) => {
                const x = (Math.max(...m.map((p) => p[0])) + Math.min(...m.map((p) => p[0]))) / 2
                const y = (Math.max(...m.map((p) => p[1])) + Math.min(...m.map((p) => p[1]))) / 2
                return { x, y, r: Math.max(...m.map((p) => Math.hypot(p[0] - x, p[1] - y))) }
            })
        }
        for (const [shape, most] of [['sparkle', 12], ['twinkle', 10], ['spots', 16]]) {
            for (let copies = 1; copies <= most; copies += 1) {
                for (let half = 0; half < 200; half += 1) {
                    const m = circles(generateShape({ shape, size: 1, points: 300, copies, beat: half / 2 }))
                    for (let i = 0; i < m.length; i += 1) {
                        expect(Math.hypot(m[i].x, m[i].y) + m[i].r, `${shape} ×${copies} half beat ${half}: inside`).toBeLessThanOrEqual(1 + 1e-9)
                        for (let j = i + 1; j < m.length; j += 1) {
                            expect(Math.hypot(m[i].x - m[j].x, m[i].y - m[j].y), `${shape} ×${copies} half beat ${half}: marks ${i}, ${j}`).toBeGreaterThan(m[i].r + m[j].r)
                        }
                    }
                }
            }
        }
    })

    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (p[2] + p[3] + p[4] === 0) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }

    it('lines: five upright lines that swing in their lanes, never crossing, a swing every two beats', () => {
        const at = (beat) => strokes(generateShape({ shape: 'lines', size: 1, points: 300, beat }))
        for (let beat = 0; beat < 4; beat += 0.125) {
            const lines = at(beat)
            expect(lines).toHaveLength(5)
            for (const line of lines) expect(new Set(line.map((p) => p[0].toFixed(9))).size).toBe(1)
            const xs = lines.map((line) => line[0][0])
            xs.slice(1).forEach((x, i) => expect(x - xs[i], `beat ${beat}`).toBeGreaterThan(0.15))
        }
        expect(at(0.5)).not.toEqual(at(0))
        const later = generateShape({ shape: 'lines', points: 300, beat: 2.75 })
        generateShape({ shape: 'lines', points: 300, beat: 0.75 }).forEach((p, i) => p.forEach((v, k) => expect(later[i][k]).toBeCloseTo(v, 9)))
        expect(strokes(generateShape({ shape: 'lines', points: 300, copies: 8 }))).toHaveLength(8)
    })

    it('spots: ten rings that glide to new places in the first half of each beat and rest in the second', () => {
        const at = (beat) => marks(generateShape({ shape: 'spots', size: 1, points: 300, beat }))
        expect(at(0)).toHaveLength(10)
        // At rest a spot keeps more than half a spot (0.12) from the next.
        const rest = at(5.75)
        rest.forEach((m, i) => rest.slice(i + 1).forEach((o) => expect(Math.hypot(m[0] - o[0], m[1] - o[1])).toBeGreaterThan(0.24 + 0.11)))
        expect(at(3.6)).toEqual(at(3.95))
        expect(at(3.25)).not.toEqual(at(3))
        expect(at(3.25)).not.toEqual(at(3.5))
        // No jump at the beat: where a glide ends is where the next starts.
        at(3.999).forEach((m, i) => { expect(m[0]).toBeCloseTo(at(4)[i][0], 9); expect(m[1]).toBeCloseTo(at(4)[i][1], 9) })
        expect(at(4.5)).not.toEqual(at(4))
    })

    it('wobble: three lines held at their ends, the wave running along them, never reaching the next line', () => {
        const at = (beat) => strokes(generateShape({ shape: 'wobble', size: 1, points: 300, beat }))
        for (let beat = 0; beat < 4; beat += 0.25) {
            const lines = at(beat).map((line, i) => (i % 2 ? [...line].reverse() : line))
            expect(lines).toHaveLength(3)
            lines.forEach((line, i) => {
                expect(line[0][1]).toBeCloseTo(0.5 - 0.5 * i, 9)
                expect(line[line.length - 1][1]).toBeCloseTo(0.5 - 0.5 * i, 9)
            })
            for (let j = 0; j < lines[0].length; j += 1) {
                expect(lines[0][j][1]).toBeGreaterThan(lines[1][j][1])
                expect(lines[1][j][1]).toBeGreaterThan(lines[2][j][1])
            }
        }
        expect(at(0.5)).not.toEqual(at(0))
    })

    it('without a beat the sparkles run on time at 120 BPM', () => {
        for (const shape of ['sparkle', 'twinkle', 'spots', 'lines', 'wobble']) {
            expect(generateShape({ shape, time: 3.3 })).toEqual(generateShape({ shape, beat: 6.6 }))
        }
    })
})

describe('the scenes: lines, circles and dots (2026-10-30)', () => {
    const SCENES = ['planets', 'pendulum', 'bounce', 'radar', 'constellation', 'clock', 'horizon', 'morse']
    const isLit = (p) => p[2] + p[3] + p[4] > 0
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    // The dots drawn as strokes of their own (bounce, radar, the stars, morse): closed rings 0.24 across at size 1.
    const dots = (points) => strokes(points)
        .filter((s) => Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]) < 1e-9)
        .map((s) => {
            const x = (Math.max(...s.map((p) => p[0])) + Math.min(...s.map((p) => p[0]))) / 2
            const y = (Math.max(...s.map((p) => p[1])) + Math.min(...s.map((p) => p[1]))) / 2
            return { x, y, r: Math.max(...s.map((p) => Math.hypot(p[0] - x, p[1] - y))) }
        })
        .filter((d) => d.r < 0.13)
    const same = (a, b, digits = 9) => {
        expect(a).toHaveLength(b.length)
        a.forEach((p, i) => p.forEach((v, k) => expect(v).toBeCloseTo(b[i][k], digits)))
    }

    it('every scene at every count and every eighth of a beat is a lit frame inside the field and the point cap', () => {
        for (const shape of SCENES) {
            for (let copies = 0; copies <= 8; copies += 1) {
                for (let beat = 0; beat < 32; beat += 0.125) {
                    const points = generateShape({ shape, size: 1, points: 300, copies, beat })
                    expect(normaliseFramePoints(points).dropped, `${shape} ×${copies} beat ${beat}`).toBe(0)
                    expect(points.some(isLit), `${shape} ×${copies} beat ${beat}`).toBe(true)
                }
            }
            expect(generateShape({ shape, size: 1, points: FRAME_MAX_POINTS, copies: 8, beat: 2 }).length).toBeLessThanOrEqual(FRAME_MAX_POINTS)
        }
    })

    it('no two dots ever touch: bounce, radar, the stars and morse at every count, every eighth of a beat over 64 beats', () => {
        for (const shape of ['bounce', 'radar', 'horizon', 'morse']) {
            for (let copies = 0; copies <= 8; copies += 1) {
                for (let beat = 0; beat < 64; beat += 0.125) {
                    const d = dots(generateShape({ shape, size: 1, points: 600, copies, beat }))
                    for (let i = 0; i < d.length; i += 1) {
                        for (let j = i + 1; j < d.length; j += 1) {
                            expect(Math.hypot(d[i].x - d[j].x, d[i].y - d[j].y), `${shape} ×${copies} beat ${beat}`).toBeGreaterThan(d[i].r + d[j].r)
                        }
                    }
                }
            }
        }
    })

    it('planets, pendulum, bounce and constellation glide: nothing jumps at the beat', () => {
        for (const shape of ['planets', 'pendulum', 'bounce', 'constellation']) {
            for (const beat of [1, 2, 3, 7, 12]) {
                same(generateShape({ shape, points: 300, beat: beat - 1e-7 }), generateShape({ shape, points: 300, beat }), 4)
            }
        }
    })

    it('planets and pendulum come round every 16 beats; the constellation moves one dot a beat', () => {
        for (const shape of ['planets', 'pendulum']) same(generateShape({ shape, points: 300, beat: 3.3 }), generateShape({ shape, points: 300, beat: 19.3 }))
        // Resting in the second half of a beat, and the dots that are not this beat's never move.
        same(generateShape({ shape: 'constellation', points: 300, beat: 5.6 }), generateShape({ shape: 'constellation', points: 300, beat: 5.95 }))
        expect(generateShape({ shape: 'constellation', points: 300, beat: 5.25 })).not.toEqual(generateShape({ shape: 'constellation', points: 300, beat: 5 }))
    })

    it('clock: the hands jump on the beat and hold between; the short hand moves once a bar', () => {
        const at = (beat) => generateShape({ shape: 'clock', points: 300, beat })
        same(at(5.1), at(5.9))
        expect(at(6)).not.toEqual(at(5.9))
        // The ring starts at the long hand, so where the ring stroke starts says where the long hand points.
        const ringStart = (beat) => strokes(at(beat))[1][0]
        expect(ringStart(0)[0]).toBeCloseTo(0, 9)
        expect(ringStart(3)[0]).toBeCloseTo(0.5, 9) // a quarter turn, clockwise
        expect(strokes(at(4))[0][0]).not.toEqual(strokes(at(3))[0][0]) // the short hand's tip
        expect(strokes(at(3))[0][0]).toEqual(strokes(at(0))[0][0])
    })

    it('radar: each dot is lit from when the hand passes it until half a turn later', () => {
        for (let beat = 0; beat < 32; beat += 0.125) {
            const hand = Math.PI / 2 - (2 * Math.PI * beat) / 4
            const d = dots(generateShape({ shape: 'radar', size: 1, points: 600, beat }))
            expect(d.length).toBeLessThanOrEqual(4)
            // A dot's centre read off its drawn points is a few thousandths out, so a dot just lit may read a hair ahead.
            for (const { x, y } of d) {
                const behind = (((Math.atan2(y, x) - hand) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
                expect(behind < Math.PI + 0.05 || behind > 2 * Math.PI - 0.05, `beat ${beat}: ${behind}`).toBe(true)
            }
        }
        expect(dots(generateShape({ shape: 'radar', size: 1, points: 600, beat: 7 })).length).toBeGreaterThan(0)
    })

    it('horizon: nothing lit under the line; the stars are out only while the sun is more than half down', () => {
        for (let beat = 0; beat < 32; beat += 0.25) {
            const points = generateShape({ shape: 'horizon', size: 1, points: 300, beat })
            for (const p of points.filter(isLit)) expect(p[1], `beat ${beat}`).toBeGreaterThanOrEqual(-0.3 - 1e-9)
            const sun = -0.15 - 0.65 * Math.cos((2 * Math.PI * beat) / 16)
            expect(dots(points), `beat ${beat}`).toHaveLength(sun < -0.3 ? 3 : 0)
        }
    })

    it('morse: a row of four marks on the beat; it glides one place left, the first mark gone, and lands where the next beat starts', () => {
        const at = (beat) => strokes(generateShape({ shape: 'morse', size: 1, points: 300, beat }))
        expect(at(4)).toHaveLength(4)
        expect(at(4.25)).toHaveLength(3)
        expect(at(4.75)).toHaveLength(3)
        const resting = at(4.999)
        const next = at(5)
        expect(next).toHaveLength(4)
        resting.forEach((mark, i) => expect(mark[0][0]).toBeCloseTo(next[i][0][0], 9))
    })

    it('without a beat the scenes run on time at 120 BPM', () => {
        for (const shape of SCENES) expect(generateShape({ shape, time: 3.3 })).toEqual(generateShape({ shape, beat: 6.6 }))
    })
})

describe('height', () => {
    it('lifts a shape up the field; at 0.5 a size-0.5 circle sits wholly in the upper half (the keep-in zone)', async () => {
        const { generateShape } = await import('./laserShapes.js')
        const centred = generateShape({ shape: 'circle', size: 0.5 })
        expect(Math.min(...centred.map((p) => p[1]))).toBeLessThan(0)
        const lifted = generateShape({ shape: 'circle', size: 0.5, height: 0.5 })
        expect(Math.min(...lifted.map((p) => p[1]))).toBeGreaterThanOrEqual(-1e-9)
        expect(Math.max(...lifted.map((p) => p[1]))).toBeLessThanOrEqual(1)
    })
})
