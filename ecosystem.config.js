module.exports = {
  apps: [
    {
      name: "wa-akg",
      script: "server.mjs",
      interpreter: "node",
      watch: false,
      autorestart: true,
      max_memory_restart: "1G",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      },
      env_production: {
        NODE_ENV: "production"
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
