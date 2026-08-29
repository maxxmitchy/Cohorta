import { TelegramUpdate, TelegramUser, TelegramSetWebhookParams, TelegramWebhookInfo } from './TelegramTypes';

export type { TelegramUpdate, TelegramUser, TelegramSetWebhookParams, TelegramWebhookInfo };

export type SetWebhookParams = TelegramSetWebhookParams;
export type DeleteWebhookParams = { dropPendingUpdates?: boolean };
export type FetchUpdatesParams = {
  offset?: number;
  limit?: number;
  timeout?: number;
  allowedUpdates?: string[];
};

/**
 * Transport port interface for Telegram Bot API communication.
 *
 * Confined strictly to infrastructure transport concerns (fetching updates, bot identity, webhook configuration).
 * Must NEVER perform domain evidence analysis, consensus classification, or Catch Up generation.
 */
export interface ITelegramClient {
  /**
   * Fetches incoming updates using Telegram getUpdates Bot API method.
   */
  fetchUpdates(params?: FetchUpdatesParams): Promise<TelegramUpdate[]>;

  /**
   * Fetches basic information about the bot account using Telegram getMe method.
   */
  getMe(): Promise<TelegramUser>;

  /**
   * Explicitly configures a webhook URL with optional secret token on the Telegram Bot API.
   * Hard Invariant: Must NEVER be called automatically during application startup or tests.
   */
  setWebhook(params: SetWebhookParams): Promise<boolean>;

  /**
   * Deletes the currently configured webhook on Telegram Bot API.
   */
  deleteWebhook(params?: DeleteWebhookParams): Promise<boolean>;

  /**
   * Retrieves the current webhook status from Telegram Bot API.
   */
  getWebhookInfo(): Promise<TelegramWebhookInfo>;
}
