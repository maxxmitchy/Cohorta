import dotenv from 'dotenv';
import { loadTelegramConfigFromEnv } from '../TelegramConfig';

dotenv.config();

/**
 * Operational readiness check for Telegram integration.
 * Safe to run anytime. Never logs credentials.
 * Determines if the environment is structurally ready for a live test.
 */
export async function runReadinessCheck(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  console.log('--- Telegram Operational Readiness Check ---\n');

  let configurationReady = true;
  const messages: string[] = [];

  const logStatus = (ok: boolean, msg: string) => {
    messages.push(`[${ok ? 'OK' : 'MISSING'}] ${msg}`);
    if (!ok) configurationReady = false;
  };

  const logInvalid = (msg: string) => {
    messages.push(`[INVALID] ${msg}`);
    configurationReady = false;
  };

  // 1. Canonical Validation
  try {
    const config = loadTelegramConfigFromEnv(env);
    
    if (config.botToken) {
      logStatus(true, 'TELEGRAM_BOT_TOKEN: Configured (***REDACTED***)');
    } else {
      logStatus(false, 'TELEGRAM_BOT_TOKEN: Not configured');
    }

    if (config.webhookSecret) {
      logStatus(true, 'TELEGRAM_WEBHOOK_SECRET: Configured (***REDACTED***)');
    } else {
      logStatus(false, 'TELEGRAM_WEBHOOK_SECRET: Not configured');
    }

    if (config.authorizedChatIds && config.authorizedChatIds.size > 0) {
      logStatus(true, `TELEGRAM_ALLOWED_CHAT_IDS: ${config.authorizedChatIds.size} chat IDs configured structurally valid`);
    } else {
      logStatus(false, 'TELEGRAM_ALLOWED_CHAT_IDS: Not configured');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Be careful not to leak values from the error message if the error throws the value,
    // though our TelegramConfig currently does not leak secret values in errors.
    logInvalid(`TelegramConfig Canonical Validation Failed: ${msg}`);
  }

  // 2. Webhook URL Validation (Not in TelegramConfig, but required for webhook operations)
  const webhookUrl = env.TELEGRAM_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    try {
      const url = new URL(webhookUrl);
      if (url.protocol !== 'https:') {
        logInvalid(`TELEGRAM_WEBHOOK_URL: Protocol must be https: (found ${url.protocol})`);
      } else if (!url.hostname) {
        logInvalid('TELEGRAM_WEBHOOK_URL: Hostname is missing');
      } else {
        // Redact any query/path for output, only show origin
        logStatus(true, `TELEGRAM_WEBHOOK_URL: Configured (origin: ${url.origin})`);
      }
    } catch {
      logInvalid('TELEGRAM_WEBHOOK_URL: Malformed URL');
    }
  } else {
    logStatus(false, 'TELEGRAM_WEBHOOK_URL: Not configured');
  }

  // Output Results
  messages.forEach(msg => console.log(msg));

  console.log('\n--- Status ---');
  if (configurationReady) {
    console.log('Configuration readiness: READY');
  } else {
    console.log('Configuration readiness: NOT READY');
  }
  console.log('Live Telegram connectivity: NOT TESTED');
  console.log('Webhook registration: NOT TESTED');

  // Exit appropriately
  if (configurationReady) {
    process.exitCode = 0;
  } else {
    process.exitCode = 1;
  }
}

// Only execute directly if run from CLI
if (process.argv[1] && process.argv[1].endsWith('readinessCheck.ts')) {
  runReadinessCheck().catch(err => {
    // Redact any top-level uncaught errors just in case
    console.error('Unhandled readiness error.');
    process.exitCode = 1;
  });
}

