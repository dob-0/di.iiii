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
