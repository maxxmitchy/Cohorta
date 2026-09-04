const { loadTelegramConfigFromEnv } = require('./dist/server.cjs');
const config = loadTelegramConfigFromEnv(process.env);
const secret = config.webhookSecret;
console.log('Environment variable exists:', !!process.env.TELEGRAM_WEBHOOK_SECRET);
console.log('Format is valid:', /^[A-Za-z0-9_-]{32,}$/.test(secret));
console.log('Handler uses environment-derived value:', secret === process.env.TELEGRAM_WEBHOOK_SECRET);
console.log('No transformed copy being used:', !secret.includes('+') && !secret.includes('='));
