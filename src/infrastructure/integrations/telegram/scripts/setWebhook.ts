import dotenv from 'dotenv';
import { HttpTelegramClient } from '../HttpTelegramClient';
import { loadTelegramConfigFromEnv, TelegramConfig } from '../TelegramConfig';
import { TelegramWebhookService } from '../TelegramWebhookService';

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

  const webhookUrl = cliUrl || env.TELEGRAM_WEBHOOK_URL?.trim();
  const webhookSecret = cliSecret || env.TELEGRAM_WEBHOOK_SECRET?.trim();

  // Validate base configuration first to ensure consistency with server.ts
  let config: TelegramConfig;
  try {
    // If CLI secret is provided, we temporarily patch the environment variable just for validation
    // so that loadTelegramConfigFromEnv can pick it up.
    if (cliSecret) {
      env.TELEGRAM_WEBHOOK_SECRET = cliSecret;
    }
    config = loadTelegramConfigFromEnv(env);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Canonical configuration validation failed. ${message}`);
    process.exitCode = 1;
    return;
  }

  if (!config.botToken) {
    console.error('Error: TELEGRAM_BOT_TOKEN is required to register webhook.');
    process.exitCode = 1;
    return;
  }

  if (!webhookUrl) {
    console.error('Error: Webhook URL is required. Provide TELEGRAM_WEBHOOK_URL in environment or use --url=https://...');
    process.exitCode = 1;
    return;
  }

  try {
    const url = new URL(webhookUrl);
    if (url.protocol !== 'https:') {
      console.error(`Error: Webhook URL must use HTTPS protocol (Telegram requirement). Found: ${url.protocol}`);
      process.exitCode = 1;
      return;
    }
    if (!url.hostname) {
      console.error(`Error: Webhook URL must contain a valid hostname.`);
      process.exitCode = 1;
      return;
    }
  } catch {
    console.error(`Error: Malformed webhook URL.`);
    process.exitCode = 1;
    return;
  }

  if (!config.webhookSecret) {
    console.error('Error: TELEGRAM_WEBHOOK_SECRET is required. Provide TELEGRAM_WEBHOOK_SECRET in environment or use --secret=...');
    process.exitCode = 1;
    return;
  }

  const client = new HttpTelegramClient(config);
  const webhookService = new TelegramWebhookService(client, config);

  console.log(`Registering webhook with Telegram Bot API...`);
  // Redact potentially sensitive query strings or fragments in the path
  try {
    const safeUrl = new URL(webhookUrl);
    console.log(`Target URL Origin: ${safeUrl.origin}`);
  } catch {
    console.log(`Target URL: [VALIDATED BUT REDACTED]`);
  }
  
  console.log(`Secret Token: [CONFIGURED - ***REDACTED***]`);

  try {
    const result = await webhookService.setWebhook({
      url: webhookUrl,
      secretToken: config.webhookSecret,
      dropPendingUpdates: dropPending,
      allowedUpdates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
    });

    if (result.success) {
      console.log('Webhook successfully registered with Telegram Bot API.');
      const info = await webhookService.getWebhookInfo();
      console.log(`Webhook Status: Verified (pending updates: ${info.pendingUpdateCount})`);
    } else {
      console.error(`Telegram Bot API returned failure: ${result.message}`);
      process.exitCode = 1;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to register webhook: ${message}`);
    process.exitCode = 1;
  }
}

// Only execute directly if run from CLI
if (process.argv[1] && process.argv[1].endsWith('setWebhook.ts')) {
  runSetWebhook().catch(() => {
    console.error('Unhandled webhook registration error.');
    process.exitCode = 1;
  });
}
