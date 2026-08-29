export interface ISecretSanitizer {
  sanitizeString(raw?: string, secretsToRedact?: (string | undefined)[]): string;
  sanitizeUrl(rawUrl?: string, secretsToRedact?: (string | undefined)[]): string;
}

/**
 * Provider-agnostic defensive secret sanitizer for error strings, URLs, logs, and payload values.
 * Ensures credentials (tokens, authorization headers, passwords, secrets) are redacted.
 */
export class SecretSanitizer implements ISecretSanitizer {
  private static readonly DEFAULT_SECRET_KEYS = new Set([
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

  static sanitizeString(raw?: string, secretsToRedact: (string | undefined)[] = []): string {
    if (!raw || typeof raw !== 'string') return '';

    let sanitized = raw;

    // 1. Redact explicit secret strings if provided
    for (const secret of secretsToRedact) {
      if (secret && secret.trim().length > 0) {
        sanitized = sanitized.split(secret).join('***REDACTED***');
      }
    }

    // 2. Redact bot token formats (e.g. 123456789:ABCdefGHIjklMNOpqrsTUVwxyz or /bot123456789:...)
    sanitized = sanitized.replace(/(?:bot)?(\d{6,12}:[A-Za-z0-9_-]{25,50})/g, '***REDACTED_BOT_TOKEN***');

    // 3. Redact Basic Auth passwords in URLs (e.g. https://user:pass@host)
    sanitized = sanitized.replace(/:\/\/[^:]+:([^@]+)@/g, '://***REDACTED_USER***:***REDACTED_PASS***@');

    // 4. Redact Bearer / Secret Token header values
    sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1***REDACTED***');
    sanitized = sanitized.replace(/(secret(?:_token)?(?:[:=\s]+))[^\s&,]+/gi, '$1***REDACTED***');

    return sanitized;
  }

  static sanitizeUrl(rawUrl?: string, secretsToRedact: (string | undefined)[] = []): string {
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

  sanitizeString(raw?: string, secretsToRedact?: (string | undefined)[]): string {
    return SecretSanitizer.sanitizeString(raw, secretsToRedact);
  }

  sanitizeUrl(rawUrl?: string, secretsToRedact?: (string | undefined)[]): string {
    return SecretSanitizer.sanitizeUrl(rawUrl, secretsToRedact);
  }
}
