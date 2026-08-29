import { TelegramConfig } from './TelegramConfig';
import { TelegramUpdate } from './TelegramTypes';
import { ISecretSanitizer } from '../../../core/security/SecretSanitizer';

/**
 * Defensive secret sanitizer for Telegram payloads, error strings, URLs, and headers.
 * Ensures zero credential leakage (bot tokens, webhook secrets, authorization headers, passwords)
 * into persisted storage, observability streams, or logs.
 */
export class TelegramSecretSanitizer implements ISecretSanitizer {
  private static readonly SECRET_KEYS = new Set([
    'bot_token',
    'bottoken',
    'token',
    'webhook_secret',
    'webhooksecret',
    'secret',
    'secret_token',
    'authorization',
    'auth',
    'password',
    'api_key',
    'apikey',
    'headers',
  ]);

  /**
   * Redacts sensitive strings (bot tokens, webhook secrets, embedded URL credentials) from any text.
   */
  static sanitizeString(raw: string, secretsToRedact: (string | undefined)[] = []): string {
    if (!raw || typeof raw !== 'string') return '';

    let sanitized = raw;

    // 1. Redact explicit secret strings if provided
    for (const secret of secretsToRedact) {
      if (secret && secret.trim().length > 0) {
        sanitized = sanitized.split(secret).join('***REDACTED***');
      }
    }

    // 2. Redact Telegram Bot Token patterns (e.g. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz or /bot123456789:...)
    sanitized = sanitized.replace(/(?:bot)?(\d{6,12}:[A-Za-z0-9_-]{25,50})/g, '***REDACTED_BOT_TOKEN***');

    // 3. Redact Basic Auth passwords in URLs (e.g. https://user:pass@host)
    sanitized = sanitized.replace(/:\/\/[^:]+:([^@]+)@/g, '://***REDACTED_USER***:***REDACTED_PASS***@');

    // 4. Redact Bearer / Secret Token header values
    sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1***REDACTED***');
    sanitized = sanitized.replace(/(secret(?:_token)?(?:[:=\s]+))[^\s&,]+/gi, '$1***REDACTED***');

    return sanitized;
  }

  /**
   * Sanitizes a URL string by stripping user credentials and query secrets.
   */
  static sanitizeUrl(rawUrl: string, secretsToRedact: (string | undefined)[] = []): string {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    try {
      const parsed = new URL(rawUrl);
      if (parsed.password) {
        parsed.password = '***REDACTED***';
      }
      if (parsed.searchParams.has('token')) {
        parsed.searchParams.set('token', '***REDACTED***');
      }
      if (parsed.searchParams.has('secret')) {
        parsed.searchParams.set('secret', '***REDACTED***');
      }
      return this.sanitizeString(parsed.toString(), secretsToRedact);
    } catch {
      return this.sanitizeString(rawUrl, secretsToRedact);
    }
  }

  /**
   * Extracts a minimal, replay-safe, sanitized payload representation from a TelegramUpdate.
   * Preserves all essential community data (message ID, author, text, timestamps, replies)
   * while strictly omitting transport headers, tokens, and secrets.
   */
  static extractReplaySafePayload(update: TelegramUpdate, config?: TelegramConfig): Record<string, unknown> {
    if (!update || typeof update !== 'object') return {};

    const message =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.edited_channel_post;

    const payload: Record<string, unknown> = {
      update_id: update.update_id,
      is_edit: Boolean(update.edited_message || update.edited_channel_post),
    };

    if (message) {
      payload.message = {
        message_id: message.message_id,
        date: message.date,
        chat: {
          id: message.chat?.id,
          type: message.chat?.type,
          title: message.chat?.title,
          username: message.chat?.username,
        },
        from: message.from
          ? {
              id: message.from.id,
              is_bot: message.from.is_bot,
              first_name: message.from.first_name,
              last_name: message.from.last_name,
              username: message.from.username,
            }
          : undefined,
        text: message.text,
        caption: message.caption,
        entities: message.entities,
        caption_entities: message.caption_entities,
        reply_to_message: message.reply_to_message
          ? {
              message_id: message.reply_to_message.message_id,
              date: message.reply_to_message.date,
              from: message.reply_to_message.from
                ? {
                    id: message.reply_to_message.from.id,
                    is_bot: message.reply_to_message.from.is_bot,
                    first_name: message.reply_to_message.from.first_name,
                    username: message.reply_to_message.from.username,
                  }
                : undefined,
              text: message.reply_to_message.text,
              caption: message.reply_to_message.caption,
            }
          : undefined,
      };
    }

    return this.sanitizePayload(payload, config);
  }

  /**
   * Recursively sanitizes any arbitrary object/record to guarantee no sensitive keys or values are stored.
   */
  static sanitizePayload(
    obj: Record<string, unknown>,
    config?: TelegramConfig
  ): Record<string, unknown> {
    const secrets = [config?.botToken, config?.webhookSecret].filter(Boolean) as string[];
    return this.deepSanitizeObject(obj, secrets) as Record<string, unknown>;
  }

  private static deepSanitizeObject(
    value: unknown,
    secrets: string[]
  ): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      return this.sanitizeString(value, secrets);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.deepSanitizeObject(item, secrets));
    }

    if (typeof value === 'object') {
      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (this.SECRET_KEYS.has(lowerKey)) {
          sanitizedObj[key] = '***REDACTED***';
        } else {
          sanitizedObj[key] = this.deepSanitizeObject(val, secrets);
        }
      }
      return sanitizedObj;
    }

    return value;
  }

  sanitizeString(raw?: string, secretsToRedact?: (string | undefined)[]): string {
    return TelegramSecretSanitizer.sanitizeString(raw || '', secretsToRedact);
  }

  sanitizeUrl(rawUrl?: string, secretsToRedact?: (string | undefined)[]): string {
    return TelegramSecretSanitizer.sanitizeUrl(rawUrl || '', secretsToRedact);
  }
}
