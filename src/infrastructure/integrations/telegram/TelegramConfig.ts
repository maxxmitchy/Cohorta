/**
 * Configuration and validation for Telegram integration.
 *
 * Enforces strict fail-closed authorized chat boundaries and transport configuration.
 *
 * Hard Invariants:
 * 1. Contains ONLY Telegram transport/source configuration (bot token, authorized chat IDs, API base URL).
 * 2. Does NOT contain Cohorta domain concepts (communities, roadmap items, learning topics, mappers).
 * 3. Fails closed: Missing or empty authorized chat IDs throws an explicit configuration error.
 * 4. Never defaults to a hardcoded test chat ID.
 */

export interface TelegramConfig {
  /** Telegram Bot API Token */
  botToken?: string;
  /** Set of authorized Telegram chat IDs permitted to enter Cohorta */
  authorizedChatIds?: Set<string>;
  /** Base URL for Telegram Bot API (defaults to https://api.telegram.org) */
  apiBaseUrl?: string;
  /** Secret token used to verify inbound webhook requests from Telegram */
  webhookSecret?: string;
}

const NUMERIC_CHAT_ID_PATTERN = /^-?\d+$/;

export function validateTelegramConfig(config: Partial<TelegramConfig>): TelegramConfig {
  if (!config || !config.authorizedChatIds) {
    throw new Error('TelegramConfig validation failed: authorizedChatIds must be provided and cannot be empty.');
  }

  const authorizedChatIds = new Set<string>();

  for (const id of config.authorizedChatIds) {
    const cleanId = String(id).trim();
    if (!cleanId) {
      continue;
    }
    if (!NUMERIC_CHAT_ID_PATTERN.test(cleanId)) {
      throw new Error(`TelegramConfig validation failed: Invalid Telegram chat ID format "${cleanId}". Telegram chat IDs must be numeric strings.`);
    }
    authorizedChatIds.add(cleanId);
  }

  if (authorizedChatIds.size === 0) {
    throw new Error('TelegramConfig validation failed: authorizedChatIds must contain at least one authorized chat ID.');
  }

  return {
    botToken: config.botToken?.trim() || undefined,
    authorizedChatIds,
    apiBaseUrl: config.apiBaseUrl?.trim() || 'https://api.telegram.org',
    webhookSecret: config.webhookSecret?.trim() || undefined,
  };
}

export function loadTelegramConfigFromEnv(env: Record<string, string | undefined> = process.env): TelegramConfig {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
  const rawAllowedChats = env.TELEGRAM_ALLOWED_CHAT_IDS?.trim();
  let webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;
  if (webhookSecret) {
    webhookSecret = webhookSecret.replace(/\+/g, "-").replace(/=/g, "");
  }

  if (!rawAllowedChats) {
    throw new Error('TelegramConfig error: TELEGRAM_ALLOWED_CHAT_IDS environment variable is required and cannot be empty. System fails closed.');
  }

  const chatIds = rawAllowedChats
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (chatIds.length === 0) {
    throw new Error('TelegramConfig error: TELEGRAM_ALLOWED_CHAT_IDS environment variable did not contain any valid chat IDs.');
  }

  return validateTelegramConfig({
    botToken,
    authorizedChatIds: new Set(chatIds),
    apiBaseUrl: env.TELEGRAM_API_BASE_URL?.trim(),
    webhookSecret,
  });
}
