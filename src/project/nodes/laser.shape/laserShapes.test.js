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

describe('the patterns: lines and circles that move on the beat (2026-10-31)', () => {
    const PATTERNS = ['lissajous', 'helix', 'tunnel', 'echo', 'sides', 'count', 'rain', 'cube']
    const isLit = (p) => p[2] + p[3] + p[4] > 0
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    const at = (shape, beat, more = {}) => generateShape({ shape, size: 1, points: 400, beat, ...more })
    // A stroke's half width: a square's half side, a ring's radius (all of them are centred).
    const reach = (stroke) => Math.max(...stroke.map((p) => Math.abs(p[0])))
    const span = (points, k) => Math.max(...points.filter(isLit).map((p) => p[k])) - Math.min(...points.filter(isLit).map((p) => p[k]))

    it('are the eight shapes after unfold; rain is a mark shape', () => {
        expect(LASER_SHAPES.slice(33, 41)).toEqual(PATTERNS)
        expect(twin.MARK_SHAPES).toContain('rain')
    })

    it('every pattern at every count and every eighth of a beat is a lit frame inside the field and the point cap', () => {
        for (const shape of PATTERNS) {
            for (let copies = 0; copies <= 12; copies += 1) {
                for (let beat = 0; beat < 32; beat += 0.125) {
                    const points = generateShape({ shape, size: 1, points: 300, copies, beat })
                    expect(normaliseFramePoints(points).dropped, `${shape} ×${copies} beat ${beat}`).toBe(0)
                    expect(points.some(isLit), `${shape} ×${copies} beat ${beat}`).toBe(true)
                }
            }
            expect(generateShape({ shape, size: 1, points: FRAME_MAX_POINTS, copies: 10, beat: 2.5 }).length).toBeLessThanOrEqual(FRAME_MAX_POINTS)
        }
    })

    it('lissajous and helix are one closed line; the cube is four strokes; the tunnel and echo one stroke a square or ring', () => {
        for (const shape of ['lissajous', 'helix']) {
            for (const beat of [0, 0.3, 5.5, 11.25]) {
                const [line, ...rest] = strokes(at(shape, beat))
                expect(rest).toHaveLength(0)
                expect(Math.hypot(line[0][0] - line[line.length - 1][0], line[0][1] - line[line.length - 1][1])).toBeLessThan(1e-9)
            }
        }
        expect(strokes(at('cube', 3.3))).toHaveLength(4)
        for (const copies of [2, 4, 8]) {
            expect(strokes(at('tunnel', 1.7, { copies }))).toHaveLength(copies)
            expect(strokes(at('echo', 1.7, { copies }))).toHaveLength(copies)
        }
    })

    it('lissajous, tunnel and cube step on the beat and hold in its second half; helix and echo never stop', () => {
        for (const shape of ['lissajous', 'tunnel', 'cube']) {
            expect(at(shape, 5.6)).toEqual(at(shape, 5.95))
            expect(at(shape, 6.25)).not.toEqual(at(shape, 6))
        }
        for (const shape of ['helix', 'echo']) expect(at(shape, 5.6)).not.toEqual(at(shape, 5.95))
        // The helix's crossings run half a wave a beat: two beats on, it is the same rope.
        const later = at('helix', 2.3)
        const now = at('helix', 0.3)
        expect(later).toHaveLength(now.length)
        later.forEach((p, i) => p.forEach((v, k) => expect(v).toBeCloseTo(now[i][k], 9)))
    })

    it('tunnel and echo: as each beat starts the outermost goes from the edge and a new one comes at the centre; the rest do not jump', () => {
        for (const shape of ['tunnel', 'echo']) {
            for (const beat of [1, 2, 7]) {
                const before = strokes(at(shape, beat - 1e-9)).map(reach)
                const after = strokes(at(shape, beat)).map(reach)
                expect(before[0], shape).toBeCloseTo(1, 2)
                expect(after[after.length - 1], shape).toBeCloseTo(0.15, 2)
                before.slice(1).forEach((r, i) => expect(r, `${shape} beat ${beat}`).toBeCloseTo(after[i], 2))
            }
        }
    })

    it('sides: a triangle on the first beat of the bar, then a square, a pentagon, a hexagon; centred top to bottom', () => {
        const heights = [1.5, Math.SQRT2, 1 + Math.cos(Math.PI / 5), Math.sqrt(3)]
        for (let beat = 0; beat < 8; beat += 1) {
            const points = at('sides', beat + 0.5)
            expect(strokes(points)).toHaveLength(1)
            expect(span(points, 1), `beat ${beat}`).toBeCloseTo(heights[beat % 4], 1)
            const ys = points.map((p) => p[1])
            expect(Math.max(...ys) + Math.min(...ys)).toBeCloseTo(0, 1)
        }
        expect(at('sides', 0.2)).toEqual(at('sides', 0.9))
    })

    it('count: one bar on the first beat of the bar, two on the second, all four on the last, then one again', () => {
        for (let beat = 0; beat < 12; beat += 1) {
            expect(strokes(at('count', beat + 0.5)), `beat ${beat}`).toHaveLength((beat % 4) + 1)
            expect(strokes(at('count', beat + 0.5, { copies: 6 })), `×6 beat ${beat}`).toHaveLength((beat % 6) + 1)
        }
    })

    it('rain: never empty, and every dash an upright piece no shorter than half a dash, at every count over 64 beats', () => {
        for (let copies = 2; copies <= 10; copies += 1) {
            for (let beat = 0; beat < 64; beat += 0.125) {
                const dashes = strokes(at('rain', beat, { copies }))
                expect(dashes.length, `×${copies} beat ${beat}`).toBeGreaterThan(0)
                expect(dashes.length).toBeLessThanOrEqual(copies)
                for (const d of dashes) {
                    expect(Math.max(...d.map((p) => Math.abs(p[0] - d[0][0])))).toBeLessThan(1e-9)
                    expect(span(d, 1), `×${copies} beat ${beat}`).toBeGreaterThanOrEqual(0.25 - 1e-9)
                }
            }
        }
    })

    it('without a beat the patterns run on time at 120 BPM', () => {
        for (const shape of PATTERNS) expect(generateShape({ shape, time: 3.3 })).toEqual(generateShape({ shape, beat: 6.6 }))
    })
})

describe('dust: many dots, as small as the laser may draw one (2026-11-01)', () => {
    const isLit = (p) => p[2] + p[3] + p[4] > 0
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    // Each dot's centre and radius, read off its ring.
    const dots = (points) => strokes(points).map((s) => {
        const x = (Math.max(...s.map((p) => p[0])) + Math.min(...s.map((p) => p[0]))) / 2
        const y = (Math.max(...s.map((p) => p[1])) + Math.min(...s.map((p) => p[1]))) / 2
        return { x, y, r: Math.max(...s.map((p) => Math.hypot(p[0] - x, p[1] - y))) }
    })
    const at = (beat, more = {}) => dots(generateShape({ shape: 'dust', size: 1, points: 400, beat, ...more }))

    it('comes after the patterns, a mark shape; `copies` dots (20, 2 to 28), each a ring of its own', () => {
        expect(LASER_SHAPES[41]).toBe('dust')
        expect(twin.MARK_SHAPES).toContain('dust')
        expect(at(3.3)).toHaveLength(20)
        expect(at(3.3, { copies: 7 })).toHaveLength(7)
        expect(at(3.3, { copies: 99 })).toHaveLength(28)
    })

    it('a dot is the same size on the wall at any size of the picture: 0.046 of the field across, until it is a spot', () => {
        for (const size of [1, 0.6, 0.3]) {
            for (const d of dots(generateShape({ shape: 'dust', size, points: 400, beat: 2 }))) expect(d.r).toBeCloseTo(0.023, 3)
        }
    })

    it('half the dots jump to new places on every beat and the rest hold; nothing moves between beats', () => {
        // A ring starts where the hop from the dot before it arrives, so the centre read off its points moves by a hair
        // when the drawing order changes: dots are matched within 0.01 (the places are 0.08 or more apart).
        const held = (from, to) => to.filter((d) => from.some((e) => Math.hypot(d.x - e.x, d.y - e.y) < 0.01)).length
        for (const beat of [1, 2, 5, 10]) {
            const before = at(beat - 0.5)
            const after = at(beat + 0.4)
            expect(held(before, after), `beat ${beat}`).toBe(10)
            expect(held(after, at(beat + 0.1)), `beat ${beat}`).toBe(20)
        }
    })

    it('no two dots ever touch from size 0.3 up, at every count, every half beat over 64 beats', () => {
        for (const size of [1, 0.5, 0.3]) {
            for (const copies of [0, 2, 13, 28]) {
                for (let beat = 0; beat < 64; beat += 0.5) {
                    const d = dots(generateShape({ shape: 'dust', size, points: 400, copies, beat }))
                    for (let i = 0; i < d.length; i += 1) {
                        for (let j = i + 1; j < d.length; j += 1) {
                            expect(Math.hypot(d[i].x - d[j].x, d[i].y - d[j].y), `${size} ×${copies} beat ${beat}`).toBeGreaterThan(d[i].r + d[j].r)
                        }
                    }
                }
            }
        }
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

describe('heartbeat: a heart monitor\'s trace (2026-11-01)', () => {
    const isLit = (p) => p[2] + p[3] + p[4] > 0
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    const at = (beat, more = {}) => strokes(generateShape({ shape: 'heartbeat', size: 1, points: 600, beat, ...more }))

    it('comes after dust; one or two strokes, never empty, at every count and eighth of a beat', () => {
        expect(LASER_SHAPES[42]).toBe('heartbeat')
        for (let copies = 0; copies <= 9; copies += 1) {
            for (let beat = 0; beat < 18; beat += 0.125) {
                const s = at(beat, { copies })
                expect(s.length, `×${copies} beat ${beat}`).toBeGreaterThanOrEqual(1)
                expect(s.length).toBeLessThanOrEqual(2)
            }
        }
    })

    it('the pen is at the top of a spike on every beat, and the spike stands in the middle of its beat\'s width', () => {
        for (const beat of [0, 1, 2, 4, 7]) {
            const written = at(beat)[0]
            const pen = written[written.length - 1]
            expect(pen[1], `beat ${beat}`).toBeGreaterThan(0.7)
            expect(pen[0], `beat ${beat}`).toBeCloseTo(-1 + (2 * ((beat % 3) + 0.5)) / 3, 2)
        }
    })

    it('just ahead of the pen the old trace is wiped; the trace itself holds still', () => {
        for (const beat of [0.3, 1.6, 2.2]) {
            const s = at(beat)
            const pen = s[0][s[0].length - 1][0]
            for (const p of s.flat()) expect(p[0] > pen + 1e-9 && p[0] < pen + 0.25 - 1e-9, `beat ${beat} x ${p[0]}`).toBe(false)
        }
        // Between the beats the written part only grows: a point drawn at beat 1.2 is still where it was at beat 1.7.
        const early = at(1.2)[0]
        const late = at(1.7)[0]
        const yAt = (stroke, x) => stroke.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1]
        for (const x of [-0.9, -0.5, 0.05]) expect(yAt(late, x)).toBeCloseTo(yAt(early, x), 1)
    })
})

describe('point: one dot in the middle (2026-11-01)', () => {
    it('comes after heartbeat: one ring round the middle, 0.05 of the field in radius at any size from 0.05, at most 300 points', () => {
        expect(LASER_SHAPES[43]).toBe('point')
        for (const size of [1, 0.5, 0.05]) {
            const points = generateShape({ shape: 'point', size, points: 1992 })
            expect(points.length).toBeLessThanOrEqual(300)
            expect(points.every((p) => p[2] + p[3] + p[4] > 0)).toBe(true)
            for (const p of points) expect(Math.hypot(p[0], p[1])).toBeCloseTo(0.05, 6)
        }
        // Below 0.05 it shrinks with the picture, and held still at 0 it is what the engine stops, as every shape is.
        expect(Math.hypot(...generateShape({ shape: 'point', size: 0.02, points: 60 })[0].slice(0, 2))).toBeCloseTo(0.02, 6)
    })
})

describe('weave and venn: lines into a grid, circles that split and mix (2026-11-01)', () => {
    const isLit = (p) => p[2] + p[3] + p[4] > 0
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    const at = (shape, beat) => strokes(generateShape({ shape, size: 1, points: 600, beat }))

    it('come after point', () => {
        expect(LASER_SHAPES.slice(44, 46)).toEqual(['weave', 'venn'])
    })

    it('weave: 1, 2, 4 level lines, then 1, 2, 4 upright ones into a four-by-four grid, and back, resting in each beat\'s second half', () => {
        const lines = [1, 2, 4, 5, 6, 8, 8, 8, 8, 6, 5, 4, 2, 1, 1, 1]
        for (let k = 0; k < 32; k += 1) expect(at('weave', k + 0.75), `beat ${k}`).toHaveLength(lines[k % 16])
        // Every line runs the whole picture.
        for (const s of at('weave', 7.5)) expect(Math.max(...s.map((p) => Math.abs(p[0])), ...s.map((p) => Math.abs(p[1])))).toBeCloseTo(1, 6)
    })

    it('weave: a split or a fold glides, so nothing jumps at a beat but the first upright line coming (3) and the last going (11)', () => {
        const places = (beat) => [...new Set(at('weave', beat).map((s) => {
            const level = Math.abs(s[0][1] - s[s.length - 1][1]) < 1e-9
            return `${level ? 'y' : 'x'}${(level ? s[0][1] : s[0][0]).toFixed(4)}`
        }))].sort()
        for (let beat = 1; beat < 16; beat += 1) {
            if (beat === 3 || beat === 11) continue
            expect(places(beat), `beat ${beat}`).toEqual(places(beat - 1e-9))
        }
    })

    it('venn: one circle, two (beat 2), three (beat 4) that mix, two again (12), one (14); every circle 0.5 round, inside the picture', () => {
        const circles = [1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 1]
        for (let k = 0; k < 32; k += 1) {
            const s = at('venn', k + 0.75)
            expect(s, `beat ${k}`).toHaveLength(circles[k % 16])
            for (const c of s) {
                const x = (Math.max(...c.map((p) => p[0])) + Math.min(...c.map((p) => p[0]))) / 2
                const y = (Math.max(...c.map((p) => p[1])) + Math.min(...c.map((p) => p[1]))) / 2
                for (const p of c) expect(Math.hypot(p[0] - x, p[1] - y)).toBeCloseTo(0.5, 2)
                for (const p of c) expect(Math.max(Math.abs(p[0]), Math.abs(p[1]))).toBeLessThanOrEqual(0.96)
            }
        }
    })

    it('without a beat they run on time at 120 BPM', () => {
        for (const shape of ['weave', 'venn']) expect(generateShape({ shape, time: 3.3 })).toEqual(generateShape({ shape, beat: 6.6 }))
    })
})

describe('the lava shapes: lava, magma, eruption, bubble, crack, drip (2026-11-06)', () => {
    const LAVA = ['lava', 'magma', 'eruption', 'bubble', 'crack', 'drip']
    const isLit = (p) => p[2] + p[3] + p[4] > 0
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    const at = (shape, beat, more = {}) => strokes(generateShape({ shape, size: 1, points: 900, beat, colour: '#ff4000', ...more }))
    // A blob, a bomb or a drop: a closed stroke; its middle and radius from its box.
    const isRing = (s) => s.length > 4 && Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]) < 1e-6
    const ringOf = (s) => {
        const xs = s.map((p) => p[0])
        const ys = s.map((p) => p[1])
        return { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, r: (Math.max(...xs) - Math.min(...xs)) / 2 }
    }
    const closest = (rings) => {
        let gap = Infinity
        for (let i = 0; i < rings.length; i += 1) {
            for (let j = i + 1; j < rings.length; j += 1) gap = Math.min(gap, Math.hypot(rings[i].x - rings[j].x, rings[i].y - rings[j].y) - rings[i].r - rings[j].r)
        }
        return gap
    }

    it('come after weave and venn, and stay inside 0.95 of the picture at every sixteenth of a beat', () => {
        expect(LASER_SHAPES.slice(46, 52)).toEqual(LAVA)
        for (const shape of LAVA) {
            for (const copies of [0, 1, 4, 6]) {
                for (let beat = 0; beat < 32; beat += 1 / 16) {
                    const most = Math.max(...at(shape, beat, { copies }).flat().map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1]))))
                    expect(most, `${shape} ×${copies} beat ${beat}`).toBeLessThanOrEqual(0.95 + 1e-9)
                }
            }
        }
    })

    it('lava: `copies` blobs (3, 2 to 5), each keeping its size through its loop, that never touch, none smaller than a spot', () => {
        for (const [copies, count] of [[0, 3], [2, 2], [4, 4], [5, 5], [99, 5]]) {
            const sizes = at('lava', 0, { copies }).map((s) => ringOf(s).r)
            for (let beat = 0; beat < 64; beat += 1 / 8) {
                const blobs = at('lava', beat, { copies })
                expect(blobs, `×${copies} beat ${beat}`).toHaveLength(count)
                expect(blobs.every(isRing)).toBe(true)
                blobs.forEach((s, i) => expect(ringOf(s).r).toBeCloseTo(sizes[i], 2))
                for (const r of sizes) expect(r).toBeGreaterThan(0.119)
                expect(closest(blobs.map(ringOf)), `×${copies} beat ${beat}`).toBeGreaterThan(0.02)
            }
        }
        // A blob goes from the floor to the ceiling and back.
        const heights = Array.from({ length: 256 }, (_, k) => ringOf(at('lava', k / 8)[0]).y)
        expect(Math.min(...heights)).toBeLessThan(-0.6)
        expect(Math.max(...heights)).toBeGreaterThan(0.6)
    })

    it('magma: `copies` level lines (3, 1 to 6) across the picture that flow and never cross', () => {
        const yAt = (line, x) => line.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1]
        for (const [copies, count] of [[0, 3], [1, 1], [6, 6]]) {
            for (let beat = 0; beat < 32; beat += 0.25) {
                const lines = at('magma', beat, { copies })
                expect(lines, `×${copies} beat ${beat}`).toHaveLength(count)
                for (let i = 1; i < lines.length; i += 1) {
                    for (let k = 0; k < 20; k += 1) {
                        const x = -0.9 + (1.8 * k) / 19
                        expect(yAt(lines[i - 1], x) - yAt(lines[i], x), `×${copies} beat ${beat} x ${x}`).toBeGreaterThan(0.05)
                    }
                }
            }
        }
        expect(at('magma', 1)).not.toEqual(at('magma', 0))
    })

    it('eruption: the volcano always, and bombs that are whole dots 0.12 round, gone inside the beat, never touching', () => {
        for (const copies of [0, 1, 2, 3, 4]) {
            let most = 0
            for (let beat = 0; beat < 32; beat += 1 / 32) {
                const [volcano, ...bombs] = at('eruption', beat, { copies })
                expect(volcano.length).toBeGreaterThan(8)
                expect(bombs.every(isRing)).toBe(true)
                const dots = bombs.map(ringOf)
                for (const d of dots) expect(d.r).toBeCloseTo(0.12, 2)
                expect(closest(dots), `×${copies} beat ${beat}`).toBeGreaterThan(0.02)
                most = Math.max(most, dots.length)
            }
            expect(most, `×${copies}`).toBe(copies === 0 ? 2 : copies)
        }
    })

    it('bubble: the pool is one line right across, with at most one drop above it', () => {
        for (let beat = 0; beat < 32; beat += 1 / 16) {
            const [pool, ...drops] = at('bubble', beat)
            expect(Math.min(...pool.map((p) => p[0]))).toBeCloseTo(-0.95, 6)
            expect(Math.max(...pool.map((p) => p[0]))).toBeCloseTo(0.95, 6)
            expect(drops.length).toBeLessThanOrEqual(1)
            // A drop clears the pool and any bubble under it.
            for (const d of drops.map(ringOf)) {
                const under = pool.filter((p) => Math.abs(p[0] - d.x) <= d.r).map((p) => p[1])
                expect(d.y - d.r, `beat ${beat}`).toBeGreaterThan(Math.max(...under))
            }
        }
        // A bubble swells between the beats.
        expect(at('bubble', 1.5)).not.toEqual(at('bubble', 1.6))
    })

    it('crack: opens from the middle, right across half a beat later, then four branches; still between half beats', () => {
        const width = (beat) => {
            const s = at('crack', beat)[0]
            return Math.max(...s.map((p) => p[0])) - Math.min(...s.map((p) => p[0]))
        }
        expect(width(0.1)).toBeCloseTo(1.52, 6)
        expect(width(0.6)).toBeCloseTo(1.9, 6)
        expect(width(7.9)).toBeCloseTo(1.9, 6)
        const branches = [0.6, 1.1, 1.6, 2.1, 2.6, 3.1, 3.6, 4.1, 4.6, 7.9].map((b) => at('crack', b).length - 1)
        expect(branches).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 4])
        for (let half = 0; half < 32; half += 1) expect(at('crack', half / 2 + 0.05), `half beat ${half}`).toEqual(at('crack', half / 2 + 0.45))
        // A new crack on the next loop.
        expect(at('crack', 8.1)).not.toEqual(at('crack', 0.1))
    })

    it('drip: ceiling and pool lines, `copies` drops (2, 1 to 3) hanging and as many falling in the first half of the beat', () => {
        for (const [copies, count] of [[0, 2], [1, 1], [3, 3], [9, 3]]) {
            for (let beat = 0; beat < 16; beat += 1 / 16) {
                const s = at('drip', beat, { copies })
                const dots = s.filter(isRing).map(ringOf)
                const falling = beat - Math.floor(beat) < 0.5
                expect(dots, `×${copies} beat ${beat}`).toHaveLength(falling ? 2 * count : count)
                expect(s.length - dots.length).toBe(2)
                expect(closest(dots), `×${copies} beat ${beat}`).toBeGreaterThan(0.02)
            }
        }
    })

    it('without a beat they run on time at 120 BPM', () => {
        for (const shape of LAVA) expect(generateShape({ shape, time: 3.3 }), shape).toEqual(generateShape({ shape, beat: 6.6 }))
    })
})

describe('volcano: the lava story in one line over four bars (2026-11-06 evening)', () => {
    const isLit = (p) => p[2] + p[3] + p[4] > 0
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    const at = (beat) => strokes(generateShape({ shape: 'volcano', size: 1, points: 900, beat, colour: '#ff4000' }))
    const isRing = (s) => s.length > 4 && Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]) < 1e-6
    const ringOf = (s) => {
        const xs = s.map((p) => p[0])
        const ys = s.map((p) => p[1])
        return { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, r: (Math.max(...xs) - Math.min(...xs)) / 2 }
    }
    const top = (beat) => Math.max(...at(beat)[0].map((p) => p[1]))
    const lowest = (beat) => at(beat)[0].reduce((best, p) => (p[1] < best[1] ? p : best))
    const heightAt = (line, x) => line.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1]

    it('comes after the lava shapes, one line right across inside 0.95 of the picture, beside it at most two whole dots that never touch', () => {
        expect(LASER_SHAPES[52]).toBe('volcano')
        for (let beat = 0; beat < 48; beat += 1 / 16) {
            const [line, ...dots] = at(beat)
            const label = `beat ${beat}`
            expect(Math.min(...line.map((p) => p[0])), label).toBeCloseTo(-0.95, 6)
            expect(Math.max(...line.map((p) => p[0])), label).toBeCloseTo(0.95, 6)
            expect(Math.max(...[line, ...dots].flat().map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])))), label).toBeLessThanOrEqual(0.95 + 1e-9)
            expect(dots.length, label).toBeLessThanOrEqual(2)
            expect(dots.every(isRing), label).toBe(true)
            const rings = dots.map(ringOf)
            for (const d of rings) expect(d.r, label).toBeCloseTo(0.12, 2)
            if (rings.length === 2) expect(Math.hypot(rings[0].x - rings[1].x, rings[0].y - rings[1].y) - 0.24, label).toBeGreaterThan(0.02)
        }
    })

    it('bar one: flat on the downbeat, then the drop\'s ripples run out to both sides and die away before bar two', () => {
        expect(top(0)).toBeCloseTo(-0.55, 6)
        expect(lowest(0)[1]).toBeCloseTo(-0.55, 6)
        expect(lowest(0.3)[1]).toBeLessThan(-0.6)
        const out = [1, 2, 3].map((beat) => Math.abs(lowest(beat)[0]))
        expect(out[0]).toBeLessThan(out[1])
        expect(out[1]).toBeLessThan(out[2])
        expect(top(4)).toBeCloseTo(-0.55, 6)
        expect(lowest(4)[1]).toBeCloseTo(-0.55, 6)
        for (let beat = 0; beat < 8; beat += 1 / 16) expect(at(beat), `beat ${beat}`).toHaveLength(1)
    })

    it('bar two: the pool swells into a cone, a step each beat that glides in the first half and holds in the second', () => {
        const steps = [4, 5, 6, 7].map((b) => top(b + 0.75))
        for (let i = 1; i < 4; i += 1) expect(steps[i]).toBeGreaterThan(steps[i - 1] + 0.1)
        for (const b of [4, 5, 6, 7]) expect(top(b + 0.6), `beat ${b}`).toBeCloseTo(top(b + 0.95), 6)
        expect(steps[3]).toBeCloseTo(-0.55 + 0.85, 1)
    })

    it('bar three: the crater bursts open on its downbeat and throws a bomb left on each beat and one right a quarter beat later', () => {
        expect(heightAt(at(7.95)[0], 0)).toBeGreaterThan(heightAt(at(8.01)[0], 0) + 0.05)
        for (const k of [8, 9, 10, 11]) {
            expect(at(k + 0.1).slice(1).map(ringOf).some((d) => d.x < 0 && d.y > 0), `left on beat ${k}`).toBe(true)
            expect(at(k + 0.35).slice(1).map(ringOf).some((d) => d.x > 0 && d.y > 0), `right after beat ${k}`).toBe(true)
        }
        for (let beat = 12.5; beat < 15; beat += 1 / 16) expect(at(beat), `beat ${beat}`).toHaveLength(1)
        // The bombs fly their own heights each loop; the line keeps the story's beats.
        expect(at(8.3)).not.toEqual(at(24.3))
        expect(at(21.5)[0]).toEqual(at(5.5)[0])
    })

    it('bar four: it melts back a step on each of three beats, and the next drop hangs, falls and lands on the downbeat', () => {
        expect(top(12.75)).toBeGreaterThan(top(13.75) + 0.1)
        expect(top(13.75)).toBeGreaterThan(top(14.75) + 0.1)
        expect(top(14.75)).toBeCloseTo(-0.55, 6)
        const drop = (beat) => ringOf(at(beat)[1])
        expect(drop(15.1).x).toBeCloseTo(0, 6)
        expect(drop(15.1).y).toBeCloseTo(drop(15.45).y, 6)
        expect(drop(15.75).y).toBeLessThan(drop(15.55).y)
        expect(drop(15.999).y - 0.12).toBeCloseTo(-0.55, 1)
        expect(at(16)).toHaveLength(1)
    })

    it('without a beat it runs on time at 120 BPM', () => {
        expect(generateShape({ shape: 'volcano', time: 3.3 })).toEqual(generateShape({ shape: 'volcano', beat: 6.6 }))
    })
})

describe('strands: the owner\'s laser.html, a tangle of drifting sines the beam runs along (2026-11-06 evening)', () => {
    const isLit = (p) => p[2] + p[3] + p[4] > 0
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    const at = (beat, more = {}) => strokes(generateShape({ shape: 'strands', size: 1, points: 600, beat, colour: '#ff190a', ...more }))
    const lengthOf = (s) => s.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - s[i][0], p[1] - s[i][1]), 0)

    it('comes after volcano: one line inside 0.92 of the picture at every moment, at every tangle', () => {
        expect(LASER_SHAPES[53]).toBe('strands')
        for (const copies of [0, 2, 8]) {
            for (let beat = 0; beat < 32; beat += 1 / 16) {
                const s = at(beat, { copies })
                expect(s, `×${copies} beat ${beat}`).toHaveLength(1)
                expect(Math.max(...s[0].map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])))), `×${copies} beat ${beat}`).toBeLessThanOrEqual(0.92 + 1e-9)
            }
        }
    })

    it('wanders on as the beam runs, the same moment drawing the same strand', () => {
        expect(at(0.25)).not.toEqual(at(0))
        expect(at(7.3)).toEqual(at(7.3))
        expect(lengthOf(at(3)[0])).toBeGreaterThan(1)
    })

    it('Copies sets how tangled: 2 to 8 harmonics, 5 its own', () => {
        expect(at(2, { copies: 0 })).toEqual(at(2, { copies: 5 }))
        expect(at(2, { copies: 12 })).toEqual(at(2, { copies: 8 }))
        expect(at(2, { copies: 1 })).toEqual(at(2, { copies: 2 }))
        expect(at(2, { copies: 2 })).not.toEqual(at(2, { copies: 8 }))
    })

    it('a faster look draws a longer strand, up to twice as long; a slower one keeps its length', () => {
        const mean = (speed) => Array.from({ length: 32 }, (_, k) => lengthOf(at(k / 2, { speed })[0])).reduce((s, l) => s + l, 0) / 32
        expect(mean(2)).toBeGreaterThan(mean(1) * 1.5)
        expect(at(5, { speed: 4 })).toEqual(at(5, { speed: 2 }))
        expect(at(5, { speed: 0.25 })).toEqual(at(5, { speed: 1 }))
    })

    it('without a beat it runs on time at 120 BPM', () => {
        expect(generateShape({ shape: 'strands', time: 3.3 })).toEqual(generateShape({ shape: 'strands', beat: 6.6 }))
    })
})

describe('solid-light lines: contour, draw, blade, coil, down, vortex (2026-11-07, the owner\'s references)', () => {
    const SOLID = ['contour', 'draw', 'blade', 'coil', 'down', 'vortex']
    const isLit = (p) => p[2] + p[3] + p[4] > 0
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    const at = (shape, beat, more = {}) => strokes(generateShape({ shape, size: 1, points: 600, beat, colour: '#ff0000', colour2: '#0000ff', ...more }))
    const radius = (p) => Math.hypot(p[0], p[1])
    const mean = (list) => list.reduce((s, v) => s + v, 0) / list.length
    // The turns a stroke makes round the middle, counted by the angle it sweeps (a spiral's `copies`).
    const turnsOf = (s) => {
        let sweep = 0
        for (let i = 1; i < s.length; i += 1) {
            const d = Math.atan2(s[i][1], s[i][0]) - Math.atan2(s[i - 1][1], s[i - 1][0])
            sweep += Math.atan2(Math.sin(d), Math.cos(d))
        }
        return sweep / (2 * Math.PI)
    }
    // A stroke turned back by `turn` radians (blade's lines, as they were before the slow turn).
    const unturned = (s, turn) => s.map((p) => [p[0] * Math.cos(turn) + p[1] * Math.sin(turn), -p[0] * Math.sin(turn) + p[1] * Math.cos(turn)])

    it('come after strands, named and in this order; every one is a frame inside the point cap at every copies and beat', () => {
        expect(LASER_SHAPES.slice(54, 60)).toEqual(SOLID)
        for (const shape of SOLID) {
            for (const points of [120, 900, 1e9]) {
                for (let copies = 0; copies <= 9; copies += 1) {
                    for (let beat = 0; beat < 32; beat += 1.5) {
                        const frame = generateShape({ shape, size: 1, points, copies, beat })
                        const label = `${shape} ${points} points ×${copies} beat ${beat}`
                        expect(frame.length, label).toBeLessThanOrEqual(FRAME_MAX_POINTS)
                        expect(frame.some(isLit), label).toBe(true)
                        expect(normaliseFramePoints(frame).dropped, label).toBe(0)
                    }
                }
            }
        }
    }, 30000)

    it('contour: Copies loops (5, 2 to 8) one inside the other, bunched to one side, flowing outward, never crossing', () => {
        expect([0, 1, 2, 5, 8, 12].map((copies) => at('contour', 1, { copies }).length)).toEqual([5, 2, 2, 5, 8, 8])
        // The inner loops sit off centre, so the lines bunch: the smaller the loop, the further its middle is up.
        const middles = at('contour', 0).map((s) => mean(s.map((p) => p[1])))
        expect(middles[0]).toBeGreaterThan(0.2)
        expect(middles[4]).toBeLessThan(0.1)
        for (let i = 1; i < middles.length; i += 1) expect(middles[i]).toBeLessThan(middles[i - 1])
        // Each loop lies wholly inside the next one up.
        const within = (p, poly) => {
            let inside = false
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
                if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < ((poly[j][0] - poly[i][0]) * (p[1] - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) inside = !inside
            }
            return inside
        }
        for (const beat of [0, 1.7, 3.3, 7, 11.5, 20]) {
            const loops = at('contour', beat)
            for (let i = 0; i + 1 < loops.length; i += 1) expect(loops[i].every((p) => within(p, loops[i + 1])), `loop ${i} at beat ${beat}`).toBe(true)
            for (const loop of loops) expect(Math.max(...loop.map(radius)), `beat ${beat}`).toBeLessThanOrEqual(0.95 + 1e-9)
        }
        // They flow out: before a loop reaches the edge (the first 2 beats) every one is bigger than it was.
        const widest = (beat) => at('contour', beat).map((s) => Math.max(...s.map(radius)))
        expect(widest(1).every((r, i) => r > widest(0)[i])).toBe(true)
        expect(at('contour', 1)).toEqual(at('contour', 1))
        expect(at('contour', 1)).not.toEqual(at('contour', 1.5))
    })

    it('draw: the loop draws itself over beats 0 to 4 and rubs out over 4 to 8, a quarter always lit', () => {
        // Points go with how much is lit: 800 points for the whole loop, a quarter of them for its least.
        const lit = (beat, more = {}) => at('draw', beat, { points: 800, ...more })[0].length
        const up = Array.from({ length: 17 }, (_, k) => lit(k / 4))
        const down = Array.from({ length: 17 }, (_, k) => lit(4 + k / 4))
        for (let k = 1; k < 17; k += 1) {
            expect(up[k], `beat ${k / 4}`).toBeGreaterThanOrEqual(up[k - 1])
            expect(down[k], `beat ${4 + k / 4}`).toBeLessThanOrEqual(down[k - 1])
        }
        expect(up[0]).toBeCloseTo(200, -1)
        expect(up[16]).toBeGreaterThan(790)
        expect(down[16]).toBeCloseTo(200, -1)
        expect(up[8]).toBeCloseTo(400, -1)
        for (let beat = 0; beat < 16; beat += 1 / 8) {
            expect(at('draw', beat, { points: 800 }), `beat ${beat}`).toHaveLength(1)
            expect(lit(beat), `beat ${beat}`).toBeGreaterThanOrEqual(0.25 * 800 - 2)
        }
        // The next round starts again from the least.
        expect(lit(8)).toBeCloseTo(lit(0), -1)
    })

    it('draw: Copies 2 or 3 add smaller loops inside, a beat behind each other', () => {
        expect([0, 1, 2, 3, 4].map((copies) => at('draw', 4, { copies }).length)).toEqual([1, 1, 2, 3, 3])
        const [outer, inner] = at('draw', 4, { copies: 2 })
        expect(Math.max(...inner.map(radius))).toBeLessThan(Math.max(...outer.map(radius)))
        // At beat 4 the first loop is whole and the second, a beat behind, is not yet.
        expect(outer.length).toBeGreaterThan(inner.length)
    })

    it('blade: Copies lines (1, 1 to 4) side by side, turning half a turn in 16 beats, a ripple running along each', () => {
        expect([0, 1, 3, 4, 9].map((copies) => at('blade', 0, { copies }).length)).toEqual([1, 1, 3, 4, 4])
        // Level at the start, the lines 0.28 apart; upright at beat 8; level again, the other way up, at beat 16.
        const start = at('blade', 0, { copies: 3 }).map((s) => mean(s.map((p) => p[1])))
        for (const [i, y] of [-0.28, 0, 0.28].entries()) expect(start[i]).toBeCloseTo(y, 1)
        const upright = at('blade', 8, { copies: 3 })
        for (const [i, x] of [0.28, 0, -0.28].entries()) {
            expect(mean(upright[i].map((p) => p[0]))).toBeCloseTo(x, 1)
            expect(Math.abs(mean(upright[i].map((p) => p[1])))).toBeLessThan(0.1)
        }
        const flipped = at('blade', 16, { copies: 3 }).map((s) => mean(s.map((p) => p[1])))
        for (const [i, y] of [0.28, 0, -0.28].entries()) expect(flipped[i]).toBeCloseTo(y, 1)
        // The ripple's packet is off the line's end at beat 0 and halfway along it at beat 2.
        const height = (beat) => {
            const ys = unturned(at('blade', beat)[0], (Math.PI * beat) / 16).map((p) => p[1])
            return Math.max(...ys) - Math.min(...ys)
        }
        expect(height(0)).toBeLessThan(0.08)
        expect(height(2)).toBeGreaterThan(0.18)
        expect(height(4)).toBeLessThan(0.08)
        // At every moment the lines stay inside 0.92 of the picture, and apart.
        for (let beat = 0; beat < 32; beat += 0.25) {
            const lines = at('blade', beat, { copies: 4 })
            for (const line of lines) expect(Math.max(...line.map(radius)), `beat ${beat}`).toBeLessThanOrEqual(0.92 + 1e-9)
            const turn = (Math.PI * beat) / 16
            for (let i = 0; i + 1 < lines.length; i += 1) {
                const a = unturned(lines[i], turn)
                const b = unturned(lines[i + 1], turn)
                const gap = Math.min(...a.flatMap((p) => b.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))))
                expect(gap, `lines ${i} and ${i + 1} at beat ${beat}`).toBeGreaterThan(0.03)
            }
        }
    })

    it('coil: one line, a spiral of Copies turns (2, 1 to 4), turning a quarter turn in 16 beats', () => {
        expect([0, 1, 2, 3, 4, 9].map((copies) => {
            const s = at('coil', 3, { copies, points: 900 })
            return [s.length, Math.round(turnsOf(s[0]) * 100) / 100]
        })).toEqual([[1, 2], [1, 1], [1, 2], [1, 3], [1, 4], [1, 4]])
        // From a tight start to a wide end.
        const line = at('coil', 3, { points: 900 })[0]
        expect(radius(line[0])).toBeLessThan(0.3)
        expect(radius(line[line.length - 1])).toBeGreaterThan(0.55)
        // Its start turns with the coil: a turn every 64 beats.
        const startAt = (beat) => Math.atan2(...at('coil', beat)[0][0].slice(0, 2).reverse())
        expect(startAt(0)).toBeCloseTo(0, 6)
        expect(startAt(16)).toBeCloseTo(Math.PI / 2, 6)
        expect(startAt(64)).toBeCloseTo(0, 6)
    })

    it('down: Copies flat lines (3, 1 to 6) glide down, one new line coming in at the top on every beat', () => {
        expect([0, 1, 3, 6, 9].map((copies) => at('down', 0.3, { copies }).length)).toEqual([3, 1, 3, 6, 6])
        const level = (s) => s[0][1]
        for (const copies of [1, 3, 6]) {
            const count = copies
            const lines = at('down', 0.3, { copies })
            for (const s of lines) expect(Math.max(...s.map((p) => p[1])) - Math.min(...s.map((p) => p[1]))).toBe(0)
            for (let i = 1; i < count; i += 1) expect(level(lines[i - 1]) - level(lines[i])).toBeCloseTo(1.9 / count, 6)
            for (let k = 0; k < 6; k += 1) {
                // Just after a beat a line is at the top, just before it the top is empty for a whole gap.
                expect(Math.max(...at('down', k + 0.01, { copies }).map(level))).toBeCloseTo(0.95 - (1.9 * 0.01) / count, 6)
                expect(Math.max(...at('down', k + 0.99, { copies }).map(level))).toBeCloseTo(0.95 - (1.9 * 0.99) / count, 6)
                // A beat later the picture is the same, the lines each one place down; half a beat later it is between.
                const now = at('down', 0.3 + k, { copies }).map(level)
                const next = at('down', 1.3 + k, { copies }).map(level)
                next.forEach((y, i) => expect(y).toBeCloseTo(now[i], 6))
                expect(at('down', 0.8 + k, { copies }).map(level)[0]).not.toBeCloseTo(now[0], 2)
            }
        }
        // Drawn back and forth: each line starts where the one before stopped.
        const lines = at('down', 0.3)
        expect(lines[0][0][0]).toBeCloseTo(-0.95, 6)
        expect(lines[0][lines[0].length - 1][0]).toBeCloseTo(0.95, 6)
        expect(lines[1][0][0]).toBeCloseTo(0.95, 6)
        expect(lines[2][0][0]).toBeCloseTo(-0.95, 6)
    })

    it('vortex: Copies turns of spiral (3, 2 to 5) turning once in 8 beats, round a dot in the second colour with a quarter of the points', () => {
        const frame = (beat, more = {}) => generateShape({ shape: 'vortex', size: 1, points: 600, beat, colour: '#ff0000', colour2: '#0000ff', ...more }).filter(isLit)
        const dotOf = (lit) => lit.filter((p) => p[4] > 0)
        const spiralOf = (lit) => lit.filter((p) => p[2] > 0)
        expect([0, 1, 2, 3, 5, 9].map((copies) => Math.round(turnsOf(spiralOf(frame(3, { copies }))) * 100) / 100)).toEqual([3, 2, 2, 3, 5, 5])
        // The dot has about a quarter of the points, at a few point counts; the rest are the spiral.
        for (const points of [120, 600]) {
            const lit = frame(3, { points })
            expect(dotOf(lit).length / lit.length, `${points} points`).toBeCloseTo(0.25, 1)
            expect(dotOf(lit).length + spiralOf(lit).length).toBe(lit.length)
        }
        // The dot lies in the hole, never reaching the spiral, at any size and moment; the spiral reaches the edge.
        for (const size of [1, 0.25, 0.1]) {
            for (let beat = 0; beat < 32; beat += 0.5) {
                const lit = frame(beat, { size })
                expect(Math.max(...dotOf(lit).map(radius)), `size ${size} beat ${beat}`).toBeLessThan(Math.min(...spiralOf(lit).map(radius)))
            }
        }
        const full = spiralOf(frame(3))
        expect(Math.min(...full.map(radius))).toBeCloseTo(0.28, 2)
        expect(Math.max(...full.map(radius))).toBeCloseTo(0.95, 2)
        // The arms turn once in 8 beats; the dot wanders on a slower round of its own.
        const arms = spiralOf(frame(0))
        spiralOf(frame(8)).forEach((p, i) => { expect(p[0]).toBeCloseTo(arms[i][0], 6); expect(p[1]).toBeCloseTo(arms[i][1], 6) })
        expect(spiralOf(frame(2))).not.toEqual(arms)
        const middle = (lit) => [mean(lit.map((p) => p[0])), mean(lit.map((p) => p[1]))]
        expect(Math.abs(middle(dotOf(frame(8)))[0] - middle(dotOf(frame(0)))[0])).toBeGreaterThan(0.05)
        // Left out, colour2 is the look's one colour: the dot is the same colour.
        const one = generateShape({ shape: 'vortex', size: 1, points: 600, beat: 3, colour: '#ff0000' }).filter(isLit)
        expect(one.every((p) => p[2] > 0 && p[4] === 0)).toBe(true)
    })

    it('without a beat each runs on time at 120 BPM', () => {
        for (const shape of SOLID) expect(generateShape({ shape, time: 3.3 }), shape).toEqual(generateShape({ shape, beat: 6.6 }))
    })
})

describe('phyllotaxis: the owner\'s TouchDesigner Phyllotaxis scene (2026-11-07: "can we have the sameeee")', () => {
    const lit = (p) => p[2] + p[3] + p[4] > 0
    // The lit strokes of a frame, each as its points.
    const strokesOf = (points) => {
        const out = []
        let on = false
        for (const p of points) { if (lit(p)) { if (!on) out.push([]); out[out.length - 1].push(p) } on = lit(p) }
        return out
    }
    const centreOf = (stroke) => [stroke.reduce((s, p) => s + p[0], 0) / stroke.length, stroke.reduce((s, p) => s + p[1], 0) / stroke.length]
    const polar = ([x, y]) => [Math.hypot(x, y), Math.atan2(y, x)]

    it('come after vortex, in this order', () => {
        expect(LASER_SHAPES.slice(59, 62)).toEqual(['vortex', 'phyllotaxis', 'phyllolines'])
    })
    it('17 seeds, seed i at radius √i and angle i × Angle (TD\'s parexec1), as dots; the Angle 90° at beat 0, 180° at 10, 0° at 30', () => {
        for (const [beat, angle] of [[0, 90], [10, 180], [5, 135], [30, 0]]) {
            const dots = strokesOf(generateShape({ shape: 'phyllotaxis', size: 1, height: 0, points: 600, copies: 1, beat })).map(centreOf)
            // Dots on the same spot are drawn once: at 0° and 180° the seeds share a line; at 90° four arms.
            const seeds = Array.from({ length: 17 }, (_, i) => {
                const a = (i * angle * Math.PI) / 180
                return [Math.cos(a) * Math.sqrt(i / 16), Math.sin(a) * Math.sqrt(i / 16)]
            })
            for (const d of dots) {
                const nearest = Math.min(...seeds.map((s) => Math.hypot(s[0] - d[0], s[1] - d[1])))
                expect(nearest, `beat ${beat}`).toBeLessThan(0.02)
            }
            if (angle === 135) expect(dots.length).toBe(17)
        }
    })
    it('Copies 2 adds the half-turn copy, 4 the top-to-bottom mirror too (TD\'s copy1, copy2); never more than 25 dots', () => {
        const count = (copies, beat) => strokesOf(generateShape({ shape: 'phyllotaxis', size: 1, height: 0, points: 600, copies, beat })).length
        expect(count(1, 5)).toBe(17)
        expect(count(0, 5)).toBe(17) // the default is the seeds alone
        expect(count(2, 5)).toBe(25)
        expect(count(4, 5)).toBe(25)
        for (let beat = 0; beat < 40; beat += 0.5) for (const copies of [1, 2, 4]) expect(count(copies, beat)).toBeLessThanOrEqual(25)
    })
    it('each dot is a true point, the beam resting on one spot (the owner: "jsut points smallest one"), longer with more Points', () => {
        for (const size of [1, 0.5]) {
            for (const stroke of strokesOf(generateShape({ shape: 'phyllotaxis', size, height: 0, points: 600, copies: 1, beat: 5 }))) {
                expect(new Set(stroke.map((p) => `${p[0]},${p[1]}`)).size).toBe(1)
                expect(stroke).toHaveLength(12) // 600 / PHYLLO_HOLD_PER
            }
        }
        const rest = (points) => strokesOf(generateShape({ shape: 'phyllotaxis', size: 1, height: 0, points, copies: 1, beat: 5 }))[0].length
        expect([rest(1), rest(120), rest(1500), rest(1992)]).toEqual([1, 2, 30, 30])
    })
    it('phyllolines joins the seeds in order, centre outwards, as one line (Copies 2: out along one copy, back in the other)', () => {
        const one = strokesOf(generateShape({ shape: 'phyllolines', size: 0.6, height: 0, points: 900, copies: 1, beat: 5 }))
        expect(one).toHaveLength(1)
        expect(polar(one[0][0])[0]).toBeLessThan(0.01) // it starts at the centre seed
        expect(polar(one[0].at(-1))[0] / 0.6).toBeCloseTo(1, 1) // and ends at the outermost (the look is size 0.6)
        const two = strokesOf(generateShape({ shape: 'phyllolines', size: 0.6, height: 0, points: 900, copies: 2, beat: 5 }))
        expect(two).toHaveLength(1)
        const [a, b] = [two[0][0], two[0].at(-1)]
        expect(a[0]).toBeCloseTo(-b[0], 2)
        expect(a[1]).toBeCloseTo(-b[1], 2)
        expect(strokesOf(generateShape({ shape: 'phyllolines', size: 0.6, height: 0, points: 900, copies: 4, beat: 5 }))).toHaveLength(1)
    })
    it('the lines leave out their outermost seeds only when they would be more than the cube can draw in one pass', () => {
        const reach = (size, copies, beat) => Math.max(...strokesOf(generateShape({ shape: 'phyllolines', size, height: 0, points: 900, copies, beat }))[0].map((p) => Math.hypot(p[0], p[1]))) / size
        expect(reach(0.6, 2, 10)).toBeCloseTo(1, 1)
        expect(reach(1, 1, 10)).toBeCloseTo(1, 1)
        expect(reach(1, 2, 10)).toBeLessThan(0.98) // two copies at full size, the Angle at 180°: the longest it gets
    })
})

describe('crossgrid: down, crossed (2026-11-07, the owner: "add pattern cross grid")', () => {
    const lit = (p) => p[2] + p[3] + p[4] > 0
    const strokesOf = (points) => {
        const out = []
        let on = false
        for (const p of points) { if (lit(p)) { if (!on) out.push([]); out[out.length - 1].push(p) } on = lit(p) }
        return out
    }
    const at = (beat, more = {}) => strokesOf(generateShape({ shape: 'crossgrid', size: 1, height: 0, points: 600, beat, colour: '#ffffff', ...more }))
    const spread = (s, k) => Math.max(...s.map((p) => p[k])) - Math.min(...s.map((p) => p[k]))
    const levelsOf = (lines) => lines.filter((s) => spread(s, 1) === 0).map((s) => s[0][1]).sort((a, b) => b - a)
    const uprightsOf = (lines) => lines.filter((s) => spread(s, 0) === 0).map((s) => s[0][0]).sort((a, b) => a - b)
    const same = (a, b) => { expect(a).toHaveLength(b.length); a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6)) }

    it('comes after phyllolines', () => {
        expect(LASER_SHAPES.slice(61, 63)).toEqual(['phyllolines', 'crossgrid'])
    })
    it('Copies level lines and as many upright ones (4, 1 to 4), each right across the picture', () => {
        expect([0, 1, 4, 6, 9].map((copies) => at(0.3, { copies }).length)).toEqual([8, 2, 8, 8, 8])
        for (const copies of [1, 2, 4]) {
            const lines = at(0.3, { copies })
            expect(levelsOf(lines)).toHaveLength(copies)
            expect(uprightsOf(lines)).toHaveLength(copies)
            for (const s of lines) expect(Math.max(spread(s, 0), spread(s, 1))).toBeCloseTo(1.9, 6)
        }
    })
    it('the level lines glide down and the upright ones right, one gap a beat: a beat later the picture is the same', () => {
        for (const copies of [1, 2, 4]) {
            const gap = 1.9 / copies
            const levels = levelsOf(at(0.3, { copies }))
            const uprights = uprightsOf(at(0.3, { copies }))
            for (let i = 1; i < copies; i += 1) {
                expect(levels[i - 1] - levels[i]).toBeCloseTo(gap, 6)
                expect(uprights[i] - uprights[i - 1]).toBeCloseTo(gap, 6)
            }
            same(levelsOf(at(0.55, { copies })), levels.map((y) => y - gap / 4))
            same(uprightsOf(at(0.55, { copies })), uprights.map((x) => x + gap / 4))
            same(levelsOf(at(1.3, { copies })), levels)
            same(uprightsOf(at(1.3, { copies })), uprights)
            for (let k = 0; k < 6; k += 1) {
                // Just after a beat a line has come in at the top and one at the left.
                expect(levelsOf(at(k + 0.01, { copies }))[0]).toBeCloseTo(0.95 - (1.9 * 0.01) / copies, 6)
                expect(uprightsOf(at(k + 0.01, { copies }))[0]).toBeCloseTo(-0.95 + (1.9 * 0.01) / copies, 6)
            }
        }
    })
    it('drawn back and forth: level lines top to bottom, then upright ones from the side the last level one ends on', () => {
        for (const copies of [1, 2, 3, 4]) {
            for (const beat of [0.3, 2.7]) {
                const lines = at(beat, { copies })
                const levels = lines.slice(0, copies)
                const uprights = lines.slice(copies)
                levels.slice(1).forEach((s, i) => expect(s[0][0]).toBeCloseTo(levels[i].at(-1)[0], 6))
                uprights.slice(1).forEach((s, i) => expect(s[0][1]).toBeCloseTo(uprights[i].at(-1)[1], 6))
                const side = Math.sign(levels.at(-1).at(-1)[0])
                expect(uprights[0][0][0] * side).toBeCloseTo(Math.max(...uprights.map((s) => s[0][0] * side)), 6)
                expect(uprights[0][0][1]).toBeCloseTo(-0.95, 6)
            }
        }
    })
    it('a point at least every 0.021 of the field on every line (the guards\' lit step at 35 kpps is 0.0214), and few enough for one pass', () => {
        for (const size of [1, 0.5, 0.1]) {
            for (const copies of [1, 2, 4]) {
                for (const points of [120, 600, 1992]) {
                    const lines = strokesOf(generateShape({ shape: 'crossgrid', size, height: 0, points, copies, beat: 0.3, colour: '#ffffff' }))
                    for (const s of lines) {
                        for (let i = 1; i < s.length; i += 1) expect(Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1])).toBeLessThanOrEqual(0.021 + 1e-9)
                    }
                    const least = Math.max(8, Math.ceil((1.9 * size) / 0.021) + 1)
                    expect(lines.reduce((n, s) => n + s.length, 0)).toBeLessThanOrEqual(Math.max(1650 - 120 * copies, 2 * copies * least))
                }
            }
        }
    })
    it('follows the beat: `time` alone is its beat at 120 BPM', () => {
        expect(generateShape({ shape: 'crossgrid', time: 3.3 })).toEqual(generateShape({ shape: 'crossgrid', beat: 6.6 }))
    })
})
