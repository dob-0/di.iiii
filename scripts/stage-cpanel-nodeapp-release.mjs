import { spawn } from 'node:child_process'
import {
    copyFile,
    cp,
    mkdir,
    access,
    readFile,
    rm,
    stat,
    writeFile
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const distRoot = path.join(repoRoot, 'dist')
const serverRoot = path.join(repoRoot, 'serverXR')
const sharedRoot = path.join(repoRoot, 'shared')
const templateRoot = path.join(repoRoot, 'deploy', 'cpanel')
const releaseRoot = path.join(repoRoot, '.deploy', 'cpanel')
const publicHtmlRoot = path.join(releaseRoot, 'public_html')
const releaseServerRoot = path.join(releaseRoot, 'serverXR')
const releaseSharedRoot = path.join(releaseRoot, 'shared')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const parseEnvFile = async (filePath) => {
    try {
        const raw = await readFile(filePath, 'utf8')
        return raw
            .split(/\r?\n/)
            .reduce((acc, line) => {
                const trimmed = line.trim()
                if (!trimmed || trimmed.startsWith('#')) return acc
                const separatorIndex = trimmed.indexOf('=')
                if (separatorIndex === -1) return acc
                const key = trimmed.slice(0, separatorIndex).trim()
                const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
                if (key) acc[key] = value
                return acc
            }, {})
    } catch {
        return {}
    }
}

const captureCommand = (command, args, options = {}) => new Promise((resolve) => {
    const child = spawn(command, args, {
        cwd: options.cwd || repoRoot,
        env: options.env || process.env,
        stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString()
    })
    child.on('error', () => {
        resolve({ code: 1, stdout: '', stderr: '' })
    })
    child.on('exit', (code) => {
        resolve({
            code: code ?? 1,
            stdout: stdout.trim(),
            stderr: stderr.trim()
        })
    })
})

const runCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        cwd: options.cwd || repoRoot,
        env: options.env || process.env,
        stdio: 'inherit'
    })
    child.on('exit', (code) => {
        if (code === 0) {
            resolve()
            return
        }
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
    })
})

const ensureDir = async (targetPath) => {
    await mkdir(targetPath, { recursive: true })
}

const copyIfPresent = async (sourcePath, targetPath) => {
    await ensureDir(path.dirname(targetPath))
    await copyFile(sourcePath, targetPath)
}

const copyDirectory = async (sourcePath, targetPath, filter = null) => {
    await cp(sourcePath, targetPath, {
        recursive: true,
        filter: filter || (() => true)
    })
}

const formatTimestamp = (date = new Date()) => {
    const pad = (value) => String(value).padStart(2, '0')
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('') + '-' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join('')
}

const normalizeValue = (value) => {
    const normalized = typeof value === 'string' ? value.trim() : ''
    return normalized
}

const inferDeployEnv = ({ explicit = '', sourceRef = '' } = {}) => {
    const normalizedExplicit = normalizeValue(explicit).toLowerCase()
    if (normalizedExplicit) {
        return normalizedExplicit
    }

    switch (normalizeValue(sourceRef)) {
        case 'dev':
        case 'staging':
        case 'cpanel-staging':
            return 'staging'
        case 'main':
        case 'master':
        case 'cpanel-production':
            return 'production'
        default:
            return 'preview'
    }
}

const buildReleaseEnv = async () => {
    const rootEnv = await parseEnvFile(path.join(repoRoot, '.env'))
    const env = { ...process.env }

    if (!env.VITE_API_BASE_URL && rootEnv.VITE_API_BASE_URL) {
        env.VITE_API_BASE_URL = rootEnv.VITE_API_BASE_URL
    }

    if (!env.VITE_API_TOKEN && rootEnv.VITE_API_TOKEN) {
        env.VITE_API_TOKEN = rootEnv.VITE_API_TOKEN
    }

    return env
}

const readGitMetadata = async () => {
    const [commitResult, branchResult, branchFallbackResult] = await Promise.all([
        captureCommand('git', ['rev-parse', 'HEAD']),
        captureCommand('git', ['branch', '--show-current']),
        captureCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
    ])

    return {
        commit: commitResult.code === 0 ? commitResult.stdout : '',
        branch: branchResult.code === 0 && branchResult.stdout
            ? branchResult.stdout
            : (branchFallbackResult.code === 0 ? branchFallbackResult.stdout : '')
    }
}

const buildReleaseManifest = ({ timestamp, git, releaseEnv }) => {
    const sourceRef = normalizeValue(releaseEnv.GITHUB_HEAD_REF)
        || normalizeValue(releaseEnv.GITHUB_REF_NAME)
        || normalizeValue(releaseEnv.BRANCH_NAME)
        || normalizeValue(git.branch)
    const gitCommit = normalizeValue(releaseEnv.GITHUB_SHA) || normalizeValue(git.commit)
    const deployEnv = inferDeployEnv({
        explicit: releaseEnv.CPANEL_DEPLOY_ENV || releaseEnv.DEPLOY_ENV,
        sourceRef
    })

    return {
        generatedAt: new Date().toISOString(),
        releaseId: `cpanel-${timestamp}`,
        deployEnv,
        sourceRef: sourceRef || null,
        gitCommit: gitCommit || null,
        deploymentMode: 'cpanel-nodejs-app',
        frontendApiBaseUrl: (releaseEnv.VITE_API_BASE_URL || '/serverXR').trim() || '/serverXR',
        git: {
            branch: sourceRef || '',
            commit: gitCommit || ''
        },
        paths: {
            publicHtml: 'public_html',
            serverXR: 'serverXR',
            shared: 'shared'
        },
        omittedLegacyPaths: [
            'public_html/serverXR'
        ],
        notes: [
            'Sync public_html contents to your web root.',
            'Sync serverXR and shared as sibling folders in your home directory.',
            'Do not deploy a public_html/serverXR proxy folder; the cPanel Node.js App owns /serverXR.',
            'Generate serverXR/.env from environment-specific secrets before restarting the Node.js App.',
            'serverXR/release.json is copied with the backend bundle so /api/health can report the active release.'
        ]
    }
}

const ensureRequiredPaths = async () => {
    await access(path.join(serverRoot, 'src'))
    await access(sharedRoot)
}

await ensureRequiredPaths()
const releaseEnv = await buildReleaseEnv()
const gitMetadata = await readGitMetadata()
await runCommand(npmCommand, ['run', 'build'], { cwd: repoRoot, env: releaseEnv })

try {
    await stat(distRoot)
} catch {
    throw new Error('dist/ was not created. The frontend build did not complete successfully.')
}

await rm(releaseRoot, { recursive: true, force: true })
await ensureDir(releaseRoot)

await copyDirectory(distRoot, publicHtmlRoot)
await rm(path.join(publicHtmlRoot, 'serverXR'), { recursive: true, force: true })

await ensureDir(releaseServerRoot)
await copyDirectory(path.join(serverRoot, 'src'), path.join(releaseServerRoot, 'src'), (sourcePath) => !sourcePath.endsWith('.test.js'))
await copyDirectory(path.join(serverRoot, 'public'), path.join(releaseServerRoot, 'public'))
await copyIfPresent(path.join(serverRoot, 'package.json'), path.join(releaseServerRoot, 'package.json'))
await copyIfPresent(path.join(serverRoot, 'package-lock.json'), path.join(releaseServerRoot, 'package-lock.json'))
await copyIfPresent(path.join(serverRoot, 'ecosystem.config.js'), path.join(releaseServerRoot, 'ecosystem.config.js'))
await copyIfPresent(path.join(serverRoot, 'README.md'), path.join(releaseServerRoot, 'README.md'))
await copyIfPresent(path.join(serverRoot, '.env.example'), path.join(releaseServerRoot, '.env.example'))
await copyIfPresent(path.join(templateRoot, 'serverXR.env.production.example'), path.join(releaseServerRoot, '.env.production.example'))

await ensureDir(releaseSharedRoot)
await copyDirectory(sharedRoot, releaseSharedRoot, (sourcePath) => sourcePath.endsWith('.cjs') || !path.extname(sourcePath))

await copyIfPresent(path.join(templateRoot, 'frontend.env.production.example'), path.join(releaseRoot, 'frontend.env.production.example'))
await copyIfPresent(path.join(templateRoot, 'DEPLOY.md'), path.join(releaseRoot, 'DEPLOY.md'))

const releaseManifest = buildReleaseManifest({
    timestamp: formatTimestamp(),
    git: gitMetadata,
    releaseEnv
})
const serializedReleaseManifest = `${JSON.stringify(releaseManifest, null, 2)}\n`
await writeFile(path.join(releaseRoot, 'release.json'), serializedReleaseManifest, 'utf8')
await writeFile(path.join(releaseServerRoot, 'release.json'), serializedReleaseManifest, 'utf8')

const frontendEnvExample = await readFile(path.join(templateRoot, 'frontend.env.production.example'), 'utf8')
const serverEnvExample = await readFile(path.join(templateRoot, 'serverXR.env.production.example'), 'utf8')

console.log('')
console.log('[deploy:cpanel] Release staged successfully.')
console.log(`[deploy:cpanel] Output: ${releaseRoot}`)
console.log(`[deploy:cpanel] Frontend env template: ${path.join(releaseRoot, 'frontend.env.production.example')}`)
console.log(`[deploy:cpanel] Server env template: ${path.join(releaseServerRoot, '.env.production.example')}`)
console.log(`[deploy:cpanel] Deploy env: ${releaseManifest.deployEnv}`)
if (releaseManifest.sourceRef) {
    console.log(`[deploy:cpanel] Source ref: ${releaseManifest.sourceRef}`)
}
if (releaseManifest.git.commit) {
    console.log(`[deploy:cpanel] Git commit: ${releaseManifest.git.commit}`)
}
console.log('')
console.log('[deploy:cpanel] frontend.env.production.example')
console.log(frontendEnvExample.trim())
console.log('')
console.log('[deploy:cpanel] serverXR/.env.production.example')
console.log(serverEnvExample.trim())
