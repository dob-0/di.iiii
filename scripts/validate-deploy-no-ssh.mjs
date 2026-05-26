#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const pkgPath = path.resolve(root, 'package.json')
let pkg
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
} catch (err) {
  console.error('[validate-deploy-no-ssh] Could not read package.json:', err.message)
  process.exit(2)
}

const scripts = pkg.scripts || {}
const errors = []

function containsSshLikeToken(s) {
  if (!s) return false
  return /\bssh\b|\bremote\b|DEPLOY_SSH_TARGET/i.test(s)
}

// Primary safety check: ensure the single-command `deploy:all` does not invoke remote/ssh
const primary = 'deploy:all'
if (!scripts[primary]) {
  console.warn(`[validate-deploy-no-ssh] Warning: '${primary}' script not found. Add one that uses the no-SSH promotion flow.`)
} else {
  if (containsSshLikeToken(scripts[primary])) {
    errors.push(`'${primary}' appears to invoke SSH/remote commands: ${scripts[primary]}`)
  }
}

// Sanity: warn if deploy:*:all scripts reference ssh — allowed only with explicit approval
const allowedWarnTargets = ['deploy:staging:all', 'deploy:production:all']
for (const name of allowedWarnTargets) {
  const cmd = scripts[name]
  if (cmd && containsSshLikeToken(cmd)) {
    console.warn(`[validate-deploy-no-ssh] Note: '${name}' references SSH/remote. Only use this when you have explicit SSH access and approval.`)
  }
}

if (errors.length) {
  console.error('[validate-deploy-no-ssh] ERROR: Deployment safety checks failed:')
  for (const e of errors) console.error('  -', e)
  console.error('\nPolicy: single-command deploy must NOT require SSH. Use cron-based host apply instead.')
  process.exit(2)
}

console.log('[validate-deploy-no-ssh] OK: `deploy:all` does not reference SSH/remote tokens.')
process.exit(0)
