import { ITelegramClient } from './ITelegramClient';
import {
  TelegramUpdate,
  TelegramUser,
  TelegramApiResponse,
  TelegramSetWebhookParams,
  TelegramWebhookInfo,
} from './TelegramTypes';
import { TelegramConfig } from './TelegramConfig';

/**
 * Native HTTP/fetch implementation of ITelegramClient.
 *
 * Avoids heavyweight third-party Telegram SDK dependencies while strictly
 * maintaining boundary security (protecting bot tokens and webhook secrets from leaking into logs/errors).
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

  async setWebhook(params: TelegramSetWebhookParams): Promise<boolean> {
    if (!params.url || params.url.trim() === '') {
      throw new Error('setWebhook requires a non-empty https URL.');
    }
    const endpoint = `${this.baseUrl}/bot${this.botToken}/setWebhook`;
    const body: Record<string, unknown> = {
      url: params.url.trim(),
    };

    if (params.secret_token) {
      body.secret_token = params.secret_token.trim();
    }
    if (params.max_connections !== undefined) {
      body.max_connections = params.max_connections;
    }
    if (params.allowed_updates !== undefined) {
      body.allowed_updates = params.allowed_updates;
    }
    if (params.drop_pending_updates !== undefined) {
      body.drop_pending_updates = params.drop_pending_updates;
    }

    const response = await this.executeRequest<boolean>(endpoint, body, params.secret_token);
    return response.result === true;
  }

  async deleteWebhook(params?: { dropPendingUpdates?: boolean }): Promise<boolean> {
    const endpoint = `${this.baseUrl}/bot${this.botToken}/deleteWebhook`;
    const body: Record<string, unknown> = {};
    if (params?.dropPendingUpdates !== undefined) {
      body.drop_pending_updates = params.dropPendingUpdates;
    }
    const response = await this.executeRequest<boolean>(endpoint, body);
    return response.result === true;
  }

  async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    const endpoint = `${this.baseUrl}/bot${this.botToken}/getWebhookInfo`;
    const response = await this.executeRequest<TelegramWebhookInfo>(endpoint);
    if (!response.result) {
      throw new Error('Telegram Bot API getWebhookInfo returned empty result.');
    }
    return response.result;
  }

  private async executeRequest<T>(
    endpoint: string,
    body?: Record<string, unknown>,
    additionalSecretToRedact?: string
  ): Promise<TelegramApiResponse<T>> {
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
        const rawDesc = data.description || response.statusText || 'Unknown error';
        let sanitizedDesc = rawDesc.split(this.botToken).join('***REDACTED***');
        if (additionalSecretToRedact && additionalSecretToRedact.length > 0) {
          sanitizedDesc = sanitizedDesc.split(additionalSecretToRedact).join('***REDACTED***');
        }
        throw new Error(`Telegram Bot API error (${data.error_code || response.status}): ${sanitizedDesc}`);
      }

      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      let sanitizedMsg = message.split(this.botToken).join('***REDACTED***');
      if (additionalSecretToRedact && additionalSecretToRedact.length > 0) {
        sanitizedMsg = sanitizedMsg.split(additionalSecretToRedact).join('***REDACTED***');
      }
      throw new Error(`Telegram transport failure: ${sanitizedMsg}`);
    }
  }
}
