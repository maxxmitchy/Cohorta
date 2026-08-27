import { TelegramUpdate, TelegramUser } from './TelegramTypes';

/**
 * Transport port interface for Telegram Bot API communication.
 *
 * Confined strictly to infrastructure transport concerns (fetching updates, bot identity).
 * Must NEVER perform domain evidence analysis, consensus classification, or Catch Up generation.
 */
export interface ITelegramClient {
  /**
   * Fetches incoming updates using Telegram getUpdates Bot API method.
   */
  fetchUpdates(params?: {
    offset?: number;
    limit?: number;
    timeout?: number;
    allowedUpdates?: string[];
  }): Promise<TelegramUpdate[]>;

  /**
   * Fetches basic information about the bot account using Telegram getMe method.
   */
  getMe(): Promise<TelegramUser>;
}
