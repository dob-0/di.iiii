// CI twin of sync-node-anatomy.mjs: re-measure, diff, fail loudly. Reads files
// only — no git history — so it is shallow-clone safe.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildManifest, renderManifestModule } from './sync-node-anatomy.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_PATH = path.join(ROOT, 'src/project/graph/nodeAnatomy.generated.js')

const expected = renderManifestModule(await buildManifest())
const actual = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : ''
if (expected !== actual) {
    console.error('nodeAnatomy.generated.js is stale — the code it points at has moved.')
    console.error('Run: npm run docs:anatomy:sync   (and commit the result)')
    process.exit(1)
}
console.log('node anatomy manifest is current.')
