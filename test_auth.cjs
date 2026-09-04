const { loadTelegramConfigFromEnv } = require('./dist/server.cjs');
const config = loadTelegramConfigFromEnv(process.env);
console.log("Config loaded. Secret is:", config.webhookSecret);
