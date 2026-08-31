import dotenv from 'dotenv';
import { HttpTelegramClient } from '../HttpTelegramClient';
import { TelegramConfig } from '../TelegramConfig';

dotenv.config();

/**
 * Operational readiness check for Telegram integration.
 * Safe to run anytime. Never logs credentials.
 */
export async function runReadinessCheck(): Promise<void> {
  const env = process.env;

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const rawAllowedChats = env.TELEGRAM_ALLOWED_CHAT_IDS?.trim();
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const webhookUrl = env.TELEGRAM_WEBHOOK_URL?.trim();
  const apiBaseUrl = env.TELEGRAM_API_BASE_URL?.trim() || 'https://api.telegram.org';

  console.log('--- Telegram Operational Readiness Check ---');

  // Check Bot Token
  if (botToken) {
    console.log('[OK] TELEGRAM_BOT_TOKEN: Configured (***REDACTED***)');
  } else {
    console.log('[MISSING] TELEGRAM_BOT_TOKEN: Not configured');
  }

  // Check Webhook Secret
  if (webhookSecret) {
    console.log('[OK] TELEGRAM_WEBHOOK_SECRET: Configured (***REDACTED***)');
  } else {
    console.log('[MISSING] TELEGRAM_WEBHOOK_SECRET: Not configured');
  }

  // Check Allowed Chats
  if (rawAllowedChats) {
    const chatIds = rawAllowedChats.split(',').map(id => id.trim()).filter(Boolean);
    if (chatIds.length > 0) {
      console.log(`[OK] TELEGRAM_ALLOWED_CHAT_IDS: ${chatIds.length} chat IDs configured`);
    } else {
      console.log('[INVALID] TELEGRAM_ALLOWED_CHAT_IDS: Configured but contains no valid IDs');
    }
  } else {
    console.log('[MISSING] TELEGRAM_ALLOWED_CHAT_IDS: Not configured');
  }

  // Check Webhook URL
  if (webhookUrl) {
    if (webhookUrl.startsWith('https://')) {
      console.log(`[OK] TELEGRAM_WEBHOOK_URL: Configured (${webhookUrl})`);
    } else {
      console.log(`[INVALID] TELEGRAM_WEBHOOK_URL: Configured but does not use HTTPS (${webhookUrl})`);
    }
  } else {
    console.log('[MISSING] TELEGRAM_WEBHOOK_URL: Not configured');
  }

  // Test Authentication (GetMe) if token exists
  if (botToken) {
    console.log('\n--- Live API Verification ---');
    try {
      const config: TelegramConfig = {
        botToken,
        authorizedChatIds: new Set(['1']),
        apiBaseUrl,
      };
      const client = new HttpTelegramClient(config);
      const me = await client.getMe();
      console.log(`[OK] Authentication successful.`);
      console.log(`     Bot ID: ${me.id}`);
      console.log(`     Username: @${me.username}`);
      console.log(`     First Name: ${me.first_name}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[FAILED] Authentication failed: ${message}`);
    }
  } else {
    console.log('\n--- Live API Verification ---');
    console.log('[BLOCKED] Cannot test live API without TELEGRAM_BOT_TOKEN');
  }
}

// Only execute directly if run from CLI
if (process.argv[1] && process.argv[1].endsWith('readinessCheck.ts')) {
  runReadinessCheck().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
