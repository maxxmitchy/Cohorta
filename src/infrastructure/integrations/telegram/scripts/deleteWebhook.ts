import dotenv from 'dotenv';
import { HttpTelegramClient } from '../HttpTelegramClient';
import { loadTelegramConfigFromEnv, TelegramConfig } from '../TelegramConfig';
import { TelegramWebhookService } from '../TelegramWebhookService';

dotenv.config();

/**
 * Manual CLI script for deleting the Telegram Webhook.
 */
export async function runDeleteWebhook(args: string[] = process.argv.slice(2)): Promise<void> {
  const env = process.env;

  let dropPending = false;
  for (const arg of args) {
    if (arg === '--drop-pending') {
      dropPending = true;
    }
  }

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
    console.error('Error: TELEGRAM_BOT_TOKEN is required to delete webhook.');
    process.exitCode = 1;
    return;
  }

  const client = new HttpTelegramClient(config);
  const webhookService = new TelegramWebhookService(client, config);

  console.log(`Deleting webhook with Telegram Bot API...`);

  try {
    const result = await webhookService.deleteWebhook({
      dropPendingUpdates: dropPending,
    });

    if (result.success) {
      console.log('Webhook successfully deleted from Telegram Bot API.');
    } else {
      console.error(`Telegram Bot API returned failure: ${result.message}`);
      process.exitCode = 1;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to delete webhook: ${message}`);
    process.exitCode = 1;
  }
}

// Only execute directly if run from CLI
if (process.argv[1] && process.argv[1].endsWith('deleteWebhook.ts')) {
  runDeleteWebhook().catch(() => {
    console.error('Unhandled webhook deletion error.');
    process.exitCode = 1;
  });
}
