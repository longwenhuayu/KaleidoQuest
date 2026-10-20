// PM2：pm2 start deploy/ecosystem.config.js
module.exports = {
  apps: [{
    name: 'vision-arena',
    script: 'server.js',
    cwd: '/opt/vision-arena',
    node_args: '--disable-warning=ExperimentalWarning',
    env: { NODE_ENV: 'production', PORT: 3048, COOKIE_SECURE: '1', DB_PATH: '/opt/vision-arena/data/arena.db' },
    max_memory_restart: '400M'
  }]
};
