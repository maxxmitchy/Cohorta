import { ITelegramClient } from './ITelegramClient';
import { TelegramConfig } from './TelegramConfig';
import {
  ITelegramWebhookService,
  TelegramWebhookRegistrationParams,
  TelegramWebhookStatusInfo,
} from './ITelegramWebhookService';

export class TelegramWebhookService implements ITelegramWebhookService {
  constructor(
    private readonly client: ITelegramClient,
    private readonly config: TelegramConfig
  ) {}

  private sanitizeUrl(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.password) {
        parsed.password = '***REDACTED***';
      }
      return parsed.toString();
    } catch {
      return rawUrl;
    }
  }

  private sanitizeError(err: unknown): Error {
    const rawMessage = err instanceof Error ? err.message : String(err);
    let sanitized = rawMessage;

    if (this.config.botToken && this.config.botToken.length > 0) {
      sanitized = sanitized.split(this.config.botToken).join('***REDACTED***');
    }
    if (this.config.webhookSecret && this.config.webhookSecret.length > 0) {
      sanitized = sanitized.split(this.config.webhookSecret).join('***REDACTED***');
    }

    return new Error(sanitized);
  }

  async setWebhook(params: TelegramWebhookRegistrationParams): Promise<{ success: boolean; message: string }> {
    if (!this.config.botToken || this.config.botToken.trim() === '') {
      throw new Error('TelegramWebhookService error: botToken is required in TelegramConfig to register webhook.');
    }

    const url = params.url?.trim();
    if (!url) {
      throw new Error('TelegramWebhookService error: A non-empty webhook URL must be provided.');
    }

    // Telegram requires HTTPS in production; allow HTTP only for localhost/testing
    if (!url.startsWith('https://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
      throw new Error('TelegramWebhookService error: Webhook URL must use HTTPS protocol.');
    }

    const secretToken = params.secretToken?.trim() || this.config.webhookSecret;

    try {
      const result = await this.client.setWebhook({
        url,
        secret_token: secretToken,
        max_connections: params.maxConnections,
        allowed_updates: params.allowedUpdates || ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
        drop_pending_updates: params.dropPendingUpdates,
      });

      return {
        success: result,
        message: result ? 'Webhook successfully registered with Telegram.' : 'Telegram returned false for setWebhook.',
      };
    } catch (err: unknown) {
      throw this.sanitizeError(err);
    }
  }

  async getWebhookInfo(): Promise<TelegramWebhookStatusInfo> {
    if (!this.config.botToken || this.config.botToken.trim() === '') {
      throw new Error('TelegramWebhookService error: botToken is required in TelegramConfig to inspect webhook.');
    }

    try {
      const info = await this.client.getWebhookInfo();
      return {
        isConfigured: !!info.url && info.url.length > 0,
        url: info.url ? this.sanitizeUrl(info.url) : undefined,
        hasCustomCertificate: info.has_custom_certificate ?? false,
        pendingUpdateCount: info.pending_update_count ?? 0,
        lastErrorDate: info.last_error_date ? new Date(info.last_error_date * 1000) : undefined,
        lastErrorMessage: info.last_error_message,
        maxConnections: info.max_connections,
        allowedUpdates: info.allowed_updates,
      };
    } catch (err: unknown) {
      throw this.sanitizeError(err);
    }
  }

  async deleteWebhook(params?: { dropPendingUpdates?: boolean }): Promise<{ success: boolean; message: string }> {
    if (!this.config.botToken || this.config.botToken.trim() === '') {
      throw new Error('TelegramWebhookService error: botToken is required in TelegramConfig to delete webhook.');
    }

    try {
      const result = await this.client.deleteWebhook({
        dropPendingUpdates: params?.dropPendingUpdates,
      });
      return {
        success: result,
        message: result ? 'Webhook successfully deleted from Telegram.' : 'Telegram returned false for deleteWebhook.',
      };
    } catch (err: unknown) {
      throw this.sanitizeError(err);
    }
  }
}
