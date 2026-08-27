import { ITelegramClient } from './ITelegramClient';
import { TelegramUpdate, TelegramUser, TelegramApiResponse } from './TelegramTypes';
import { TelegramConfig } from './TelegramConfig';

/**
 * Native HTTP/fetch implementation of ITelegramClient.
 *
 * Avoids heavyweight third-party Telegram SDK dependencies while strictly
 * maintaining boundary security (protecting bot tokens from leaking into logs/errors).
 */
export class HttpTelegramClient implements ITelegramClient {
  private readonly baseUrl: string;
  private readonly botToken: string;

  constructor(config: TelegramConfig) {
    if (!config.botToken || config.botToken.trim() === '') {
      throw new Error('HttpTelegramClient requires a valid botToken in TelegramConfig.');
    }
    this.botToken = config.botToken.trim();
    this.baseUrl = (config.apiBaseUrl || 'https://api.telegram.org').replace(/\/$/, '');
  }

  async fetchUpdates(params?: {
    offset?: number;
    limit?: number;
    timeout?: number;
    allowedUpdates?: string[];
  }): Promise<TelegramUpdate[]> {
    const endpoint = `${this.baseUrl}/bot${this.botToken}/getUpdates`;
    const body: Record<string, unknown> = {};

    if (params?.offset !== undefined) body.offset = params.offset;
    if (params?.limit !== undefined) body.limit = params.limit;
    if (params?.timeout !== undefined) body.timeout = params.timeout;
    if (params?.allowedUpdates !== undefined) body.allowed_updates = params.allowedUpdates;

    const response = await this.executeRequest<TelegramUpdate[]>(endpoint, body);
    return response.result || [];
  }

  async getMe(): Promise<TelegramUser> {
    const endpoint = `${this.baseUrl}/bot${this.botToken}/getMe`;
    const response = await this.executeRequest<TelegramUser>(endpoint);
    if (!response.result) {
      throw new Error('Telegram Bot API getMe returned empty result.');
    }
    return response.result;
  }

  private async executeRequest<T>(endpoint: string, body?: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data: TelegramApiResponse<T> = await response.json();

      if (!response.ok || !data.ok) {
        const sanitizedDesc = (data.description || response.statusText || 'Unknown error')
          .replace(this.botToken, '***REDACTED***');
        throw new Error(`Telegram Bot API error (${data.error_code || response.status}): ${sanitizedDesc}`);
      }

      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const sanitizedMsg = message.replace(this.botToken, '***REDACTED***');
      throw new Error(`Telegram transport failure: ${sanitizedMsg}`);
    }
  }
}
