import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runReadinessCheck } from './readinessCheck';

describe('Telegram Operational Readiness Check', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tempExitCode: number | undefined;
  
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

  it('1. All required configuration valid', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);

    expect(process.exitCode).toBe(0);
    const logs = getLogOutput();
    expect(logs).toContain('[OK] TELEGRAM_BOT_TOKEN: Configured');
    expect(logs).toContain('[OK] TELEGRAM_WEBHOOK_SECRET: Configured');
    expect(logs).toContain('[OK] TELEGRAM_ALLOWED_CHAT_IDS: 1 chat IDs configured structurally valid');
    expect(logs).toContain('[OK] TELEGRAM_WEBHOOK_URL: Configured');
    expect(logs).toContain('Configuration readiness: READY');
  });

  it('2. Missing bot token', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[MISSING] TELEGRAM_BOT_TOKEN: Not configured');
  });

  it('3. Empty bot token', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '   ';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[MISSING] TELEGRAM_BOT_TOKEN: Not configured');
  });

  it('4. Missing webhook secret', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[MISSING] TELEGRAM_WEBHOOK_SECRET: Not configured');
  });

  it('5. Empty webhook secret', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = '   ';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[MISSING] TELEGRAM_WEBHOOK_SECRET: Not configured');
  });

  it('6. Missing authorized chat IDs', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    delete process.env.TELEGRAM_ALLOWED_CHAT_IDS;
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[INVALID] TelegramConfig Canonical Validation Failed: TelegramConfig error: TELEGRAM_ALLOWED_CHAT_IDS environment variable is required and cannot be empty.');
  });

  it('7. Empty authorized chat IDs', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '   ';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[INVALID] TelegramConfig Canonical Validation Failed: TelegramConfig error: TELEGRAM_ALLOWED_CHAT_IDS environment variable is required and cannot be empty.');
  });

  it('8. Valid numeric Telegram chat IDs', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '-12345,67890';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(0);
    expect(getLogOutput()).toContain('[OK] TELEGRAM_ALLOWED_CHAT_IDS: 2 chat IDs configured structurally valid');
  });

  it('9. Non-numeric chat ID', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = 'abcd';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[INVALID] TelegramConfig Canonical Validation Failed: TelegramConfig validation failed: Invalid Telegram chat ID format "abcd"');
  });

  it('10. Mixed valid/invalid chat IDs', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345, invalid';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[INVALID] TelegramConfig Canonical Validation Failed: TelegramConfig validation failed: Invalid Telegram chat ID format "invalid"');
  });

  it('11. Whitespace around chat IDs', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = ' 12345 , -67890  ';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(0);
    expect(getLogOutput()).toContain('[OK] TELEGRAM_ALLOWED_CHAT_IDS: 2 chat IDs configured structurally valid');
  });

  it('12. Missing webhook URL', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    delete process.env.TELEGRAM_WEBHOOK_URL;

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[MISSING] TELEGRAM_WEBHOOK_URL: Not configured');
  });

  it('13. Valid HTTPS webhook URL', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(0);
    expect(getLogOutput()).toContain('[OK] TELEGRAM_WEBHOOK_URL: Configured (origin: https://example.com)');
  });

  it('14. HTTP webhook URL rejected', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'http://example.com/webhook';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[INVALID] TELEGRAM_WEBHOOK_URL: Protocol must be https: (found http:)');
  });

  it('15. Malformed URL rejected', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'not-a-url';

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[INVALID] TELEGRAM_WEBHOOK_URL: Malformed URL');
  });

  it('16. URL without hostname rejected', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://'; // no hostname

    await runReadinessCheck(process.env);
    expect(process.exitCode).toBe(1);
    expect(getLogOutput()).toContain('[INVALID] TELEGRAM_WEBHOOK_URL: Malformed URL');
  });

  it('17. No secret appears in readiness output', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_SECRET_123';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET_456';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook?secret=789';

    await runReadinessCheck(process.env);
    const logs = getLogOutput();
    expect(logs).not.toContain('TEST_TOKEN_SECRET_123');
    expect(logs).not.toContain('TEST_WEBHOOK_SECRET_456');
    expect(logs).not.toContain('789'); // url query param
    expect(logs).toContain('***REDACTED***');
  });

  it('18. No bot token appears in thrown errors', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_SECRET_123';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET_456';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = 'invalid';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    const logs = getLogOutput();
    expect(logs).not.toContain('TEST_TOKEN_SECRET_123');
    expect(logs).toContain('Invalid Telegram chat ID format "invalid"');
  });

  it('19. Readiness does not call setWebhook', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    // There are no mock calls to TelegramWebhookService here because we don't import it in readinessCheck.
    const logs = getLogOutput();
    expect(logs).toContain('Webhook registration: NOT TESTED');
    expect(logs).not.toContain('Registering webhook');
  });

  it('20. Readiness does not call Telegram\'s API unless explicitly designed as a separate connectivity command', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_NOT_A_REAL_SECRET';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';
    process.env.TELEGRAM_WEBHOOK_URL = 'https://example.com/webhook';

    await runReadinessCheck(process.env);
    const logs = getLogOutput();
    expect(logs).toContain('Live Telegram connectivity: NOT TESTED');
    expect(logs).not.toContain('Authentication successful');
  });
});
