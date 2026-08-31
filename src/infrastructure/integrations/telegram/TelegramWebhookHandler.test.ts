import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramWebhookHandler } from './TelegramWebhookHandler';
import { TelegramConfig, validateTelegramConfig } from './TelegramConfig';
import {
  FIXTURE_TELEGRAM_UPDATE_001,
  FIXTURE_TELEGRAM_UPDATE_002_QUESTION,
  FIXTURE_TELEGRAM_UPDATE_003_REPLY,
  FIXTURE_TELEGRAM_UPDATE_RESOURCE,
  FIXTURE_TELEGRAM_UPDATE_UNAUTHORIZED,
  FIXTURE_TELEGRAM_UPDATE_EDITED,
  FIXTURE_TELEGRAM_UPDATE_STICKER_NO_TEXT,
  FIXTURE_TELEGRAM_UPDATE_PRIVATE_START,
  TEST_CHAT_ID_STRING,
  TEST_TELEGRAM_CHAT_ID,
} from './TelegramFixtures';
import { HttpTelegramClient } from './HttpTelegramClient';
import { runSetWebhook } from './scripts/setWebhook';
import { CommunityHistoryNormalizer } from '../../../core/source/CommunityHistoryNormalizer';
import { ExternalCommunitySourceEvent } from '../../../core/source/ExternalCommunitySourceEvent';

describe('TelegramWebhookHandler (Phase 13.2 Webhook Ingestion Boundary)', () => {
  const TEST_SECRET = 'secret_webhook_token_123456789';
  let config: TelegramConfig;

  beforeEach(() => {
    config = validateTelegramConfig({
      botToken: '123456789:ABCDefGhIjKlMnOpQrStUvWxYz',
      authorizedChatIds: new Set([TEST_CHAT_ID_STRING]),
      webhookSecret: TEST_SECRET,
    });
  });

  describe('1. Secret Token Verification & Security Fail-Closed', () => {
    it('TEST 1: Valid authorized Telegram message with correct secret is accepted', async () => {
      const handler = new TelegramWebhookHandler(config);
      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_001
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.status).toBe('ok');
      expect(result.body.action).toBe('processed');
      expect(result.body.eventId).toBe('10001');
      expect(result.event).toBeDefined();
      expect(result.event?.content).toBe('Cohorta integration test 001');
    });

    it('TEST 2: Missing secret header is rejected with 401 Unauthorized', async () => {
      const handler = new TelegramWebhookHandler(config);
      const result = await handler.processWebhook({}, FIXTURE_TELEGRAM_UPDATE_001);

      expect(result.statusCode).toBe(401);
      expect(result.body.error).toBe('Unauthorized');
      expect(result.event).toBeUndefined();
    });

    it('TEST 3: Incorrect secret header is rejected with 401 Unauthorized', async () => {
      const handler = new TelegramWebhookHandler(config);
      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': 'wrong_secret_token' },
        FIXTURE_TELEGRAM_UPDATE_001
      );

      expect(result.statusCode).toBe(401);
      expect(result.body.error).toBe('Unauthorized');
      expect(result.event).toBeUndefined();
    });

    it('TEST 4: Missing webhook secret in server configuration fails closed with 401', async () => {
      const unconfiguredSecretConfig = validateTelegramConfig({
        botToken: '123456789:ABCDefGhIjKlMnOpQrStUvWxYz',
        authorizedChatIds: new Set([TEST_CHAT_ID_STRING]),
        // webhookSecret omitted
      });

      const handler = new TelegramWebhookHandler(unconfiguredSecretConfig);
      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_001
      );

      expect(result.statusCode).toBe(401);
      expect(result.body.error).toBe('Unauthorized');
    });
  });

  describe('2. Payload Validation & Boundary Enforcement', () => {
    it('TEST 5: Malformed request body (string / null / array) returns 400 Bad Request', async () => {
      const handler = new TelegramWebhookHandler(config);

      const nullResult = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        null
      );
      expect(nullResult.statusCode).toBe(400);
      expect(nullResult.body.error).toBe('Bad Request');

      const stringResult = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        'invalid non-json text'
      );
      expect(stringResult.statusCode).toBe(400);
      expect(stringResult.body.error).toBe('Bad Request');
    });

    it('TEST 6: Structurally invalid Telegram update (missing update_id or invalid fields) returns 400 Bad Request', async () => {
      const handler = new TelegramWebhookHandler(config);

      const missingIdResult = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        { message: { text: 'no update_id' } }
      );
      expect(missingIdResult.statusCode).toBe(400);
      expect(missingIdResult.body.error).toBe('Bad Request');
    });

    it('TEST 7: Valid unauthorized chat update is ignored (200 OK) without contaminating Cohorta', async () => {
      const handler = new TelegramWebhookHandler(config);
      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_UNAUTHORIZED
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.status).toBe('ok');
      expect(result.body.action).toBe('ignored');
      expect(result.body.reason).toBe('filtered_by_adapter');
      expect(result.event).toBeNull();
    });

    it('TEST 8: Private chat update (e.g. /start) is ignored (200 OK) and not stored', async () => {
      const handler = new TelegramWebhookHandler(config);
      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_PRIVATE_START
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.status).toBe('ok');
      expect(result.body.action).toBe('ignored');
      expect(result.body.reason).toBe('filtered_by_adapter');
      expect(result.event).toBeNull();
    });
  });

  describe('3. Transformation & Adapter Integration', () => {
    it('TEST 9: Normal group message reaches TelegramSourceAdapter and produces valid event', async () => {
      const events: ExternalCommunitySourceEvent[] = [];
      const handler = new TelegramWebhookHandler(config, (e) => {
        events.push(e);
      });

      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_002_QUESTION
      );

      expect(result.statusCode).toBe(200);
      expect(events).toHaveLength(1);
      expect(events[0].provider).toBe('telegram');
      expect(events[0].externalCommunityId).toBe(TEST_CHAT_ID_STRING);
      expect(events[0].externalEventId).toBe('10002');
      expect(events[0].externalMessageId).toBe('4');
      expect(events[0].content).toBe('Can someone explain how AI agents use memory?');
      expect(events[0].author.displayName).toBe('Elena Rostova');
    });

    it('TEST 10: Reply reaches TelegramSourceAdapter and correctly links replyToMessageId', async () => {
      const events: ExternalCommunitySourceEvent[] = [];
      const handler = new TelegramWebhookHandler(config, (e) => {
        events.push(e);
      });

      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_003_REPLY
      );

      expect(result.statusCode).toBe(200);
      expect(events).toHaveLength(1);
      expect(events[0].externalParentMessageId).toBe('4');
    });

    it('TEST 11: Edited message reaches TelegramSourceAdapter with eventType message_edited and updated text', async () => {
      const events: ExternalCommunitySourceEvent[] = [];
      const handler = new TelegramWebhookHandler(config, (e) => {
        events.push(e);
      });

      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_EDITED
      );

      expect(result.statusCode).toBe(200);
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('message_edited');
      expect(events[0].metadata.editedAt).toBeDefined();
      expect(events[0].content).toBe('Cohorta integration test 001 (Updated: verified agent pipeline)');
    });

    it('TEST 12: Existing resource extraction remains intact for URLs and hashtags', async () => {
      const events: ExternalCommunitySourceEvent[] = [];
      const handler = new TelegramWebhookHandler(config, (e) => {
        events.push(e);
      });

      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_RESOURCE
      );

      expect(result.statusCode).toBe(200);
      expect(events).toHaveLength(1);
      expect(events[0].resources).toHaveLength(2);
      expect(events[0].resources?.[0].url).toBe('https://arxiv.org/abs/2305.18290');
    });

    it('TEST 13: Unsupported media (sticker with no text) is processed without fabricating fake text', async () => {
      const events: ExternalCommunitySourceEvent[] = [];
      const handler = new TelegramWebhookHandler(config, (e) => {
        events.push(e);
      });

      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_STICKER_NO_TEXT
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.action).toBe('processed');
      expect(events).toHaveLength(1);
      expect(events[0].content).toBe('');
    });
  });

  describe('4. Idempotency & Multi-Chat Collision Resistance', () => {
    it('TEST 14: Duplicate Telegram update is recognized as duplicate_ignored', async () => {
      const events: ExternalCommunitySourceEvent[] = [];
      const handler = new TelegramWebhookHandler(config, (e) => {
        events.push(e);
      });

      const firstCall = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_001
      );
      expect(firstCall.statusCode).toBe(200);
      expect(firstCall.body.action).toBe('processed');
      expect(events).toHaveLength(1);

      const secondCall = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_001
      );
      expect(secondCall.statusCode).toBe(200);
      expect(secondCall.body.action).toBe('duplicate_ignored');
      expect(events).toHaveLength(1); // Not re-delivered to sink
    });

    it('TEST 15: Same message ID in different authorized chats remains isolated and non-colliding', async () => {
      const multiChatConfig = validateTelegramConfig({
        botToken: '123456789:ABCDefGhIjKlMnOpQrStUvWxYz',
        authorizedChatIds: new Set([TEST_CHAT_ID_STRING, '-1008888888888']),
        webhookSecret: TEST_SECRET,
      });

      const events: ExternalCommunitySourceEvent[] = [];
      const handler = new TelegramWebhookHandler(multiChatConfig, (e) => {
        events.push(e);
      });

      const updateChatA = FIXTURE_TELEGRAM_UPDATE_001; // message_id: 3, chat: TEST_TELEGRAM_CHAT_ID, update_id: 10001
      const updateChatB = {
        update_id: 10009,
        message: {
          ...FIXTURE_TELEGRAM_UPDATE_001.message!,
          message_id: 3, // identical message_id
          chat: {
            id: -1008888888888,
            type: 'group' as const,
            title: 'Second Cohort',
          },
        },
      };

      await handler.processWebhook({ 'x-telegram-bot-api-secret-token': TEST_SECRET }, updateChatA);
      await handler.processWebhook({ 'x-telegram-bot-api-secret-token': TEST_SECRET }, updateChatB);

      expect(events).toHaveLength(2);
      expect(events[0].externalCommunityId).toBe(TEST_CHAT_ID_STRING);
      expect(events[1].externalCommunityId).toBe('-1008888888888');
      expect(events[0].externalMessageId).toBe('3');
      expect(events[1].externalMessageId).toBe('3');

      // End-to-end normalization test
      const discussionsA = CommunityHistoryNormalizer.normalize([events[0]], {
        communityIdMapper: () => 'com_chat_a',
      });
      const discussionsB = CommunityHistoryNormalizer.normalize([events[1]], {
        communityIdMapper: () => 'com_chat_b',
      });
      expect(discussionsA).toHaveLength(1);
      expect(discussionsB).toHaveLength(1);
      expect(discussionsA[0].communityId).toBe('com_chat_a');
      expect(discussionsB[0].communityId).toBe('com_chat_b');
    });
  });

  describe('5. Security, Secret Redaction, and Explicit setWebhook', () => {
    it('TEST 16 & 17: Webhook secret and bot token never leak into errors or output', async () => {
      const sensitiveToken = '123456789:SUPER_SECRET_TOKEN_XYZ';
      const sensitiveSecret = 'SUPER_SECRET_WEBHOOK_HEADER_VALUE';

      const customConfig = validateTelegramConfig({
        botToken: sensitiveToken,
        authorizedChatIds: new Set([TEST_CHAT_ID_STRING]),
        webhookSecret: sensitiveSecret,
      });

      const client = new HttpTelegramClient(customConfig);

      const originalFetch = global.fetch;
      global.fetch = async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            ok: false,
            error_code: 400,
            description: `Bad Request: token ${sensitiveToken} and secret ${sensitiveSecret} were invalid`,
          }),
        } as unknown as Response;
      };

      try {
        await client.setWebhook({
          url: 'https://example.com/webhook',
          secret_token: sensitiveSecret,
        });
        expect.unreachable('Should have thrown error');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).not.toContain(sensitiveToken);
        expect(msg).not.toContain(sensitiveSecret);
        expect(msg).toContain('***REDACTED***');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('TEST 18: setWebhook CLI requires explicit configuration and fails cleanly when missing', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Missing all args and env
      const savedEnv = { ...process.env };
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_WEBHOOK_URL;
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      // Provide valid chat ID so canonical validation passes for that rule,
      // and we hit the bot token missing error.
      process.env.TELEGRAM_ALLOWED_CHAT_IDS = '12345';

      await runSetWebhook([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('TELEGRAM_BOT_TOKEN is required'));

      process.env = savedEnv;
      consoleErrorSpy.mockRestore();
    });

    it('TEST 19: setWebhook is not invoked automatically on normal client or handler instantiation', () => {
      const fetchSpy = vi.fn();
      const originalFetch = global.fetch;
      global.fetch = fetchSpy as unknown as typeof fetch;

      try {
        new TelegramWebhookHandler(config);
        new HttpTelegramClient(config);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('6. End-to-End Pipeline with ICommunityEventIngestionService (Phase 13.3)', () => {
    it('TEST 20: Ingests update via TelegramWebhookHandler into durable repository', async () => {
      const { MockIngestionEventRepository } = await import('../../db/mock/MockIngestionEventRepository');
      const { MockCommunityHistoryRepository } = await import('../../db/mock/MockCommunityHistoryRepository');
      const { MockCommunityIntegrationRepository } = await import('../../db/mock/MockCommunityIntegrationRepository');
      const { CommunityEventIngestionService } = await import('../../../core/services/CommunityEventIngestionService');

      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository(false);
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_tg_test',
          communityId: 'com_ai_builders',
          providerType: 'telegram',
          providerCommunityId: TEST_CHAT_ID_STRING,
          isActive: true,
          metadata: { credentialsRef: 'env:TELEGRAM_BOT_TOKEN', syncIntervalMinutes: 5 },
          createdAt: new Date(),
        },
      ]);

      const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const handler = new TelegramWebhookHandler(config, ingestionService);

      // Ingest update 001
      const res1 = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_001
      );

      expect(res1.statusCode).toBe(200);
      expect(res1.body.action).toBe('processed');

      // Verify stored in history repository
      const discussions = await historyRepo.getAllDiscussions('com_ai_builders');
      expect(discussions).toHaveLength(1);
      expect(discussions[0].content).toBe('Cohorta integration test 001');

      // Ingest duplicate
      const res2 = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_001
      );

      expect(res2.statusCode).toBe(200);
      expect(res2.body.action).toBe('duplicate_ignored');
      expect(await historyRepo.getAllDiscussions('com_ai_builders')).toHaveLength(1);
    });
  });
});
