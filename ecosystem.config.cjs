module.exports = {
  apps: [{
    name: 'daily-hot-api',
    script: 'npm',
    args: 'start',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 6689
    }
  }]
}
