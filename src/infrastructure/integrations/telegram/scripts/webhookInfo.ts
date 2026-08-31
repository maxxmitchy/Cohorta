import dotenv from 'dotenv';
import { HttpTelegramClient } from '../HttpTelegramClient';
import { loadTelegramConfigFromEnv, TelegramConfig } from '../TelegramConfig';
import { TelegramWebhookService } from '../TelegramWebhookService';

dotenv.config();

/**
 * Manual CLI script for inspecting the Telegram Webhook status.
 */
export async function runWebhookInfo(): Promise<void> {
  const env = process.env;

  let config: TelegramConfig;
  try {
    config = loadTelegramConfigFromEnv(env);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Canonical configuration validation failed. ${message}`);
    process.exitCode = 1;
    return;
  }

  if (!config.botToken) {
    console.error('Error: TELEGRAM_BOT_TOKEN is required to inspect webhook.');
    process.exitCode = 1;
    return;
  }

  const client = new HttpTelegramClient(config);
  const webhookService = new TelegramWebhookService(client, config);

  console.log(`Inspecting webhook status with Telegram Bot API...`);

  try {
    const info = await webhookService.getWebhookInfo();
    console.log('\n--- Webhook Status ---');
    console.log(`Is Configured: ${info.isConfigured ? 'Yes' : 'No'}`);
    if (info.isConfigured) {
      console.log(`URL: ${info.url || 'None'}`);
      console.log(`Has Custom Certificate: ${info.hasCustomCertificate ? 'Yes' : 'No'}`);
      console.log(`Pending Updates: ${info.pendingUpdateCount}`);
      if (info.lastErrorDate) {
        console.log(`Last Error Date: ${info.lastErrorDate.toISOString()}`);
        console.log(`Last Error Message: ${info.lastErrorMessage || 'None'}`);
      }
      if (info.maxConnections) {
        console.log(`Max Connections: ${info.maxConnections}`);
      }
      if (info.allowedUpdates) {
        console.log(`Allowed Updates: ${info.allowedUpdates.join(', ')}`);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to inspect webhook: ${message}`);
    process.exitCode = 1;
  }
}

// Only execute directly if run from CLI
if (process.argv[1] && process.argv[1].endsWith('webhookInfo.ts')) {
  runWebhookInfo().catch(() => {
    console.error('Unhandled webhook inspection error.');
    process.exitCode = 1;
  });
}
