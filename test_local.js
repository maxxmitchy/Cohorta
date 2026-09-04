const { loadTelegramConfigFromEnv } = require('./dist/server.cjs');
try {
  const config = loadTelegramConfigFromEnv(process.env);
  console.log("Config loaded. Secret:", config.webhookSecret);
} catch (e) {
  console.error("Config load error:", e.message);
}
