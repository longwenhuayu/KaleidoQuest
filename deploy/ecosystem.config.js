// PM2：pm2 start deploy/ecosystem.config.js
module.exports = {
  apps: [{
    name: 'kaleido',
    script: 'server.js',
    cwd: '/opt/kaleido',
    node_args: '--disable-warning=ExperimentalWarning',
    env: { NODE_ENV: 'production', PORT: 3048, COOKIE_SECURE: '1', DB_PATH: '/opt/kaleido/data/kaleido.db' },
    max_memory_restart: '400M'
  }]
};
