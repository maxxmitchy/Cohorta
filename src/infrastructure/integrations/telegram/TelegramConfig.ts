/**
 * Configuration and validation for Telegram integration.
 *
 * Enforces authorized chat boundaries and prevents running in an unconfigured state.
 */

export interface TelegramConfig {
  /** Telegram Bot API Token */
  botToken?: string;
  /** Set of authorized Telegram chat IDs permitted to enter Cohorta */
  authorizedChatIds: Set<string>;
  /** Base URL for Telegram Bot API (defaults to https://api.telegram.org) */
  apiBaseUrl?: string;
  /** Fallback roadmap item ID when none can be inferred */
  defaultRoadmapItemId?: string;
  /** Custom mapping from Telegram chat ID to internal Cohorta community ID */
  communityIdMapper?: (chatId: string) => string;
}

export function validateTelegramConfig(config: Partial<TelegramConfig>): TelegramConfig {
  const authorizedChatIds = new Set<string>();

  if (config.authorizedChatIds) {
    for (const id of config.authorizedChatIds) {
      const cleanId = String(id).trim();
      if (cleanId) {
        authorizedChatIds.add(cleanId);
      }
    }
  }

  if (authorizedChatIds.size === 0) {
    throw new Error('TelegramConfig validation failed: authorizedChatIds must contain at least one authorized chat ID.');
  }

  return {
    botToken: config.botToken?.trim() || undefined,
    authorizedChatIds,
    apiBaseUrl: config.apiBaseUrl || 'https://api.telegram.org',
    defaultRoadmapItemId: config.defaultRoadmapItemId || 'general',
    communityIdMapper: config.communityIdMapper || ((id: string) => `community_${id.replace(/^-/, '')}`),
  };
}

export function loadTelegramConfigFromEnv(env: Record<string, string | undefined> = process.env): TelegramConfig {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const rawAllowedChats = env.TELEGRAM_ALLOWED_CHAT_IDS || '-5456731754';

  const authorizedChatIds = new Set<string>(
    rawAllowedChats
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
  );

  return validateTelegramConfig({
    botToken,
    authorizedChatIds,
    apiBaseUrl: env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org',
    defaultRoadmapItemId: env.TELEGRAM_DEFAULT_ROADMAP_ITEM_ID || 'general',
  });
}
