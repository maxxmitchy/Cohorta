import dotenv from 'dotenv';
import { HttpTelegramClient } from '../HttpTelegramClient';
import { TelegramConfig } from '../TelegramConfig';

dotenv.config();

/**
 * Manual CLI script for setting up the Telegram Webhook.
 *
 * Hard Invariants:
 * 1. Must NEVER be executed automatically during server start, tests, or builds.
 * 2. Requires explicit bot token, webhook URL, and webhook secret.
 * 3. Never logs or displays bot tokens or webhook secrets in terminal output.
 * 4. Fails closed with informative, sanitized error messages.
 */
export async function runSetWebhook(args: string[] = process.argv.slice(2)): Promise<void> {
  const env = process.env;

  // Extract CLI flags if provided (e.g. --url=https://... --secret=...)
  let cliUrl: string | undefined;
  let cliSecret: string | undefined;
  let dropPending = false;

  for (const arg of args) {
    if (arg.startsWith('--url=')) {
      cliUrl = arg.slice(6).trim();
    } else if (arg.startsWith('--secret=')) {
      cliSecret = arg.slice(9).trim();
    } else if (arg === '--drop-pending') {
      dropPending = true;
    }
  }

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const webhookUrl = cliUrl || env.TELEGRAM_WEBHOOK_URL?.trim();
  const webhookSecret = cliSecret || env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const apiBaseUrl = env.TELEGRAM_API_BASE_URL?.trim() || 'https://api.telegram.org';

  if (!botToken) {
    console.error('Error: TELEGRAM_BOT_TOKEN is required to register webhook.');
    process.exitCode = 1;
    return;
  }

  if (!webhookUrl) {
    console.error('Error: Webhook URL is required. Provide TELEGRAM_WEBHOOK_URL in environment or use --url=https://...');
    process.exitCode = 1;
    return;
  }

  if (!webhookUrl.startsWith('https://')) {
    console.error('Error: Webhook URL must use HTTPS protocol (Telegram requirement).');
    process.exitCode = 1;
    return;
  }

  if (!webhookSecret) {
    console.error('Error: TELEGRAM_WEBHOOK_SECRET is required. Provide TELEGRAM_WEBHOOK_SECRET in environment or use --secret=...');
    process.exitCode = 1;
    return;
  }

  const config: TelegramConfig = {
    botToken,
    authorizedChatIds: new Set(['1']), // dummy placeholder to satisfy TelegramConfig validation for client transport
    apiBaseUrl,
    webhookSecret,
  };

  const client = new HttpTelegramClient(config);

  console.log(`Registering webhook with Telegram Bot API...`);
  console.log(`Target URL: ${webhookUrl}`);
  console.log(`Secret Token: [CONFIGURED - ***REDACTED***]`);

  try {
    const success = await client.setWebhook({
      url: webhookUrl,
      secret_token: webhookSecret,
      drop_pending_updates: dropPending,
      allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
    });

    if (success) {
      console.log('Webhook successfully registered with Telegram Bot API.');
      const info = await client.getWebhookInfo();
      console.log(`Webhook Status: Verified (pending updates: ${info.pending_update_count})`);
    } else {
      console.error('Telegram Bot API returned false for setWebhook.');
      process.exitCode = 1;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Sanitize any remaining token or secret
    const sanitized = message
      .split(botToken).join('***REDACTED***')
      .split(webhookSecret).join('***REDACTED***');
    console.error(`Failed to register webhook: ${sanitized}`);
    process.exitCode = 1;
  }
}

// Only execute directly if run from CLI
if (process.argv[1] && process.argv[1].endsWith('setWebhook.ts')) {
  runSetWebhook();
}
