import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSetWebhook } from './setWebhook';

// We need to mock HttpTelegramClient and TelegramWebhookService to prevent real network calls
vi.mock('../HttpTelegramClient', () => {
  return {
    HttpTelegramClient: class {
      constructor() {}
    }
  };
});

vi.mock('../TelegramWebhookService', () => {
  return {
    TelegramWebhookService: class {
      constructor() {}
      async setWebhook() { return { success: true }; }
      async getWebhookInfo() { return { pendingUpdateCount: 0 }; }
    }
  };
});

describe('setWebhook Script', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  const getLogOutput = () => {
    const calls = (console.log as any).mock.calls;
    return calls.map((args: any[]) => args.join(' ')).join('\n');
  };

  const getErrorOutput = () => {
    const calls = (console.error as any).mock.calls;
    return calls.map((args: any[]) => args.join(' ')).join('\n');
  };

  it('fails if canonical configuration validation fails (e.g. missing allowed chats)', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com';
    delete process.env.TELEGRAM_ALLOWED_CHAT_IDS;

    await runSetWebhook([]);
    expect(process.exitCode).toBe(1);
    expect(getErrorOutput()).toContain('Error: Canonical configuration validation failed.');
  });

  it('fails if webhook URL is not HTTPS', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '123';
    process.env.TELEGRAM_WEBHOOK_URL = 'http://example.com';

    await runSetWebhook([]);
    expect(process.exitCode).toBe(1);
    expect(getErrorOutput()).toContain('Error: Webhook URL must use HTTPS protocol');
  });

  it('redacts the secret token from the log output', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token_abc123';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret_def456';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '123';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runSetWebhook([]);
    expect(process.exitCode).toBeUndefined(); // Success
    
    const logs = getLogOutput();
    expect(logs).toContain('Secret Token: [CONFIGURED - ***REDACTED***]');
    expect(logs).not.toContain('secret_def456');
    expect(logs).not.toContain('token_abc123');
  });
  
  it('redacts the full URL path/query to prevent credential leakage in webhook paths', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token_abc123';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret_def456';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '123';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook?token=my_secret_query_param';

    await runSetWebhook([]);
    expect(process.exitCode).toBeUndefined();
    
    const logs = getLogOutput();
    expect(logs).toContain('Target URL Origin: https://example.com');
    expect(logs).not.toContain('my_secret_query_param');
  });

});
