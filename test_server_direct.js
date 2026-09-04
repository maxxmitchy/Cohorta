import { loadTelegramConfigFromEnv } from './src/infrastructure/integrations/telegram/TelegramConfig.js';
const config = loadTelegramConfigFromEnv(process.env);
console.log("Secret is:", config.webhookSecret);
