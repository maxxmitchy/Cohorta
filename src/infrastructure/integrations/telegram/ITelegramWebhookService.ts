export interface TelegramWebhookRegistrationParams {
  url: string;
  secretToken?: string;
  maxConnections?: number;
  allowedUpdates?: string[];
  dropPendingUpdates?: boolean;
}

export interface TelegramWebhookStatusInfo {
  isConfigured: boolean;
  url?: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  lastErrorDate?: Date;
  lastErrorMessage?: string;
  maxConnections?: number;
  allowedUpdates?: string[];
}

/**
 * Service interface for managing the Telegram webhook lifecycle.
 *
 * Requirements:
 * 1. Never automatically call setWebhook on application startup.
 * 2. Never expose bot tokens or webhook secrets in responses, logs, or thrown errors.
 * 3. Preserve timing-safe secret token verification and payload integrity.
 */
export interface ITelegramWebhookService {
  /**
   * Explicitly registers or updates the webhook URL with Telegram Bot API.
   */
  setWebhook(params: TelegramWebhookRegistrationParams): Promise<{ success: boolean; message: string }>;

  /**
   * Retrieves current webhook status from Telegram Bot API without exposing secrets.
   */
  getWebhookInfo(): Promise<TelegramWebhookStatusInfo>;

  /**
   * Deletes the configured webhook on Telegram Bot API.
   */
  deleteWebhook(params?: { dropPendingUpdates?: boolean }): Promise<{ success: boolean; message: string }>;
}
