// PM2 / cPanel legacy — NOT the live process supervisor.
//
// Production and staging have run on Docker Compose since the 2026-07-15 VPS
// cutover; process supervision is Compose's `restart:` policy, and nothing in
// the live path reads this file. It survives only because
// `scripts/stage-cpanel-nodeapp-release.mjs` copies it into the cPanel release
// bundle, and that bundle is reachable only from legacy cPanel entry points
// (`npm run deploy:cpanel`, the workflow_dispatch-only cPanel publish workflow,
// and `legacy/cpanel-git-pull/`), which are deliberately retained as a
// documented fallback until the cPanel hosting term expires.
//
// Do not treat anything here as a description of how the server runs, and do
// not add process-manager config to a task. Current deploy truth:
// docs/deploy/LIVE_DEPLOY.md.
module.exports = {
  apps: [
    {
      name: 'dii-control-server',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      autorestart: true
    }
  ]
}
