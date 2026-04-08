import { spawn } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
    options: {
        environment: {
            type: 'string'
        },
        note: {
            type: 'string'
        },
        release: {
            type: 'string'
        },
        smoke: {
            type: 'string'
        },
        'output-dir': {
            type: 'string'
        },
        'rollback-target': {
            type: 'string'
        }
    }
})

const repoRoot = process.cwd()
const environment = String(values.environment || 'local').trim() || 'local'
const note = String(values.note || '').trim()
const releasePath = path.resolve(repoRoot, values.release || '.deploy/cpanel/release.json')
const smokePath = values.smoke ? path.resolve(repoRoot, values.smoke) : ''
const outputDir = path.resolve(repoRoot, values['output-dir'] || 'docs/checkpoints')

const captureCommand = (command, args) => new Promise((resolve) => {
    const child = spawn(command, args, {
        cwd: repoRoot,
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

const readJsonIfPresent = async (filePath) => {
    if (!filePath) {
        return null
    }
    try {
        await access(filePath)
        const raw = await readFile(filePath, 'utf8')
        return JSON.parse(raw)
    } catch {
        return null
    }
}

const formatDateStamp = (date = new Date()) => {
    const pad = (value) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

const [headResult, branchResult, rollbackResult] = await Promise.all([
    captureCommand('git', ['rev-parse', 'HEAD']),
    captureCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
    values['rollback-target']
        ? Promise.resolve({ code: 0, stdout: String(values['rollback-target']).trim() })
        : captureCommand('git', ['rev-parse', 'HEAD^'])
])

const releaseManifest = await readJsonIfPresent(releasePath)
const smokeResults = await readJsonIfPresent(smokePath)

const gitSha = headResult.code === 0 ? headResult.stdout : 'unknown'
const gitBranch = branchResult.code === 0 ? branchResult.stdout : 'unknown'
const rollbackTarget = rollbackResult.code === 0 ? rollbackResult.stdout : 'unknown'
const smokeChecks = Array.isArray(smokeResults?.checks) ? smokeResults.checks : []
const smokeStatus = smokeResults
    ? (smokeResults.success ? 'pass' : 'fail')
    : 'not-run'
const timestamp = formatDateStamp()

const lines = [
    `# Deploy Checkpoint ${timestamp}`,
    '',
    '## Summary',
    `- Environment: ${environment}`,
    `- Git SHA: ${gitSha}`,
    `- Branch: ${gitBranch}`,
    `- Release ID: ${releaseManifest?.releaseId || 'unknown'}`,
    `- Release generated at: ${releaseManifest?.generatedAt || 'unknown'}`,
    `- Smoke status: ${smokeStatus}`,
    `- Rollback target: ${rollbackTarget}`,
    ''
]

if (releaseManifest?.git?.commit || releaseManifest?.git?.branch) {
    lines.push('## Release Metadata')
    if (releaseManifest.git.commit) {
        lines.push(`- Release commit: ${releaseManifest.git.commit}`)
    }
    if (releaseManifest.git.branch) {
        lines.push(`- Release branch: ${releaseManifest.git.branch}`)
    }
    if (releaseManifest.frontendApiBaseUrl) {
        lines.push(`- Frontend API base: ${releaseManifest.frontendApiBaseUrl}`)
    }
    if (releaseManifest.deploymentMode) {
        lines.push(`- Deployment mode: ${releaseManifest.deploymentMode}`)
    }
    lines.push('')
}

lines.push('## Smoke Tests')
if (smokeChecks.length) {
    smokeChecks.forEach((entry) => {
        lines.push(`- ${entry.ok ? 'PASS' : 'FAIL'} ${entry.name} (${entry.url})`)
        if (!entry.ok && Array.isArray(entry.issues) && entry.issues.length) {
            lines.push(`Issues: ${entry.issues.join('; ')}`)
        }
    })
} else {
    lines.push('- Not recorded')
}
lines.push('')

lines.push('## Notes')
lines.push(`- ${note || 'Checkpoint created without an additional note.'}`)
lines.push('')

await mkdir(outputDir, { recursive: true })

const checkpointPath = path.join(outputDir, `${timestamp}-${environment}.md`)
await writeFile(checkpointPath, `${lines.join('\n')}\n`, 'utf8')

console.log(`[checkpoint] Wrote ${checkpointPath}`)
