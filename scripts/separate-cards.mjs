#!/usr/bin/env node
// Lay a project's cards out from their REAL heights (src/raw/utils/cardRows.js).
//   node scripts/separate-cards.mjs <nodes.json | -> [--gap 40]
// Input: a project document ({nodes}, or the API reply {document: {nodes}}) or a bare array of nodes, from a file or stdin ("-").
// Output (stdout, JSON): { moves: [{id,label,from,to,height}], covered: [[a,b]...] before, nodes: [...] with graphX/graphY set }
// Writes nothing anywhere else: the caller (a dry run, an op log) decides what to do with the moves.
import { readFileSync } from 'node:fs'
import { separateCards, coveredPairs, ROW_GAP } from '../src/raw/utils/cardRows.js'

const argv = process.argv.slice(2)
const src = argv.find((a) => !a.startsWith('--'))
const gap = argv.includes('--gap') ? Number(argv[argv.indexOf('--gap') + 1]) : ROW_GAP
if (!src) { console.error('usage: separate-cards.mjs <nodes.json | -> [--gap 40]'); process.exit(2) }
const doc = JSON.parse(readFileSync(src === '-' ? 0 : src, 'utf8'))
const nodes = Array.isArray(doc) ? doc : (doc.document ?? doc).nodes
const { moves, positions } = separateCards(nodes, { gap })
const covered = coveredPairs(nodes)
const out = nodes.map((n) => ({ ...n, graphX: positions.get(n.id).x, graphY: positions.get(n.id).y }))
console.log(JSON.stringify({ moves, covered, stillCovered: coveredPairs(out), nodes: out }, null, 1))
