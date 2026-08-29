import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CommunityIntegrationService } from '../../../core/services/CommunityIntegrationService';
import {
  IntegrationConflictError,
  IntegrationNotFoundError,
  InvalidIntegrationError,
} from '../../../core/services/ICommunityIntegrationService';
import { DurableFileCommunityIntegrationRepository } from '../../db/durable/DurableFileCommunityIntegrationRepository';
import { DurableFileIngestionEventRepository } from '../../db/durable/DurableFileIngestionEventRepository';
import { DurableFileCommunityHistoryRepository } from '../../db/durable/DurableFileCommunityHistoryRepository';
import { DurableFileTelegramBotCheckpointRepository } from './DurableFileTelegramBotCheckpointRepository';
import { CommunityEventIngestionService } from '../../../core/services/CommunityEventIngestionService';
import { IngestionObservabilityService } from '../../../core/services/IngestionObservabilityService';
import { TelegramWebhookHandler } from './TelegramWebhookHandler';
import { TelegramUpdateReconciliationService } from './TelegramUpdateReconciliationService';
import { MockTelegramClient } from './MockTelegramClient';
import { TelegramConfig } from './TelegramConfig';
import { TelegramUpdate } from './TelegramTypes';
import { SecretSanitizer } from '../../../core/security/SecretSanitizer';

describe('Phase 13.7: Community ↔ Telegram Integration Lifecycle & Real-World Activation', () => {
  const testDir = path.join(process.cwd(), '.data_test_community_integration_' + Date.now());
  const integrationsPath = path.join(testDir, 'community_integrations.json');
  const ingestionEventsPath = path.join(testDir, 'ingestion_events.json');
  const historyPath = path.join(testDir, 'community_history.json');
  const checkpointPath = path.join(testDir, 'bot_checkpoints.json');

  const BOT_TOKEN = '123456789:ABCdefGhIJKlmNoPQRstuVWXyz_SecretToken';
  const WEBHOOK_SECRET = 'super_secret_telegram_webhook_token_xyz_99';
  const AUTHORIZED_TEST_CHAT_ID = '-100987654321';
  const SECOND_TEST_CHAT_ID = '-1001122334455';
  const UNKNOWN_CHAT_ID = '-1009999999999';

  let integrationRepo: DurableFileCommunityIntegrationRepository;
  let ingestionRepo: DurableFileIngestionEventRepository;
  let historyRepo: DurableFileCommunityHistoryRepository;
  let checkpointRepo: DurableFileTelegramBotCheckpointRepository;

  let integrationService: CommunityIntegrationService;
  let ingestionService: CommunityEventIngestionService;
  let observabilityService: IngestionObservabilityService;

  let telegramConfig: TelegramConfig;
  let mockClient: MockTelegramClient;

  beforeEach(async () => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    integrationRepo = new DurableFileCommunityIntegrationRepository(integrationsPath);
    ingestionRepo = new DurableFileIngestionEventRepository(ingestionEventsPath);
    historyRepo = new DurableFileCommunityHistoryRepository(historyPath);
    checkpointRepo = new DurableFileTelegramBotCheckpointRepository(checkpointPath);

    integrationService = new CommunityIntegrationService(integrationRepo);
    ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
    observabilityService = new IngestionObservabilityService(ingestionRepo, integrationRepo);

    telegramConfig = {
      botToken: BOT_TOKEN,
      webhookSecret: WEBHOOK_SECRET,
      authorizedChatIds: new Set([AUTHORIZED_TEST_CHAT_ID, SECOND_TEST_CHAT_ID]),
    };

    mockClient = new MockTelegramClient();
  });

  afterEach(async () => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('1. Administrative Integration Operations & Lifecycle', () => {
    it('creates an integration mapping external Telegram chat ID to Cohorta community ID', async () => {
      const created = await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_real_world_ai',
        metadata: { channelTitle: 'AI Research Group' },
      });

      expect(created.id).toBe(`int_telegram_${AUTHORIZED_TEST_CHAT_ID}`);
      expect(created.providerType).toBe('telegram');
      expect(created.providerCommunityId).toBe(AUTHORIZED_TEST_CHAT_ID);
      expect(created.communityId).toBe('c_real_world_ai');
      expect(created.isActive).toBe(true);
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);

      const retrieved = await integrationService.getIntegration('telegram', AUTHORIZED_TEST_CHAT_ID);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.communityId).toBe('c_real_world_ai');
    });

    it('rejects duplicate integration for the same external chat on a different community', async () => {
      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_community_one',
      });

      await expect(
        integrationService.createIntegration({
          providerType: 'telegram',
          providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
          communityId: 'c_community_two',
        })
      ).rejects.toThrow(IntegrationConflictError);
    });

    it('rejects duplicate integration for the same external chat on the same community', async () => {
      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_community_one',
      });

      await expect(
        integrationService.createIntegration({
          providerType: 'telegram',
          providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
          communityId: 'c_community_one',
        })
      ).rejects.toThrow(IntegrationConflictError);
    });

    it('rejects invalid or missing parameters during integration creation', async () => {
      await expect(
        integrationService.createIntegration({
          providerType: 'unknown_provider' as any,
          providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
          communityId: 'c_test',
        })
      ).rejects.toThrow(InvalidIntegrationError);

      await expect(
        integrationService.createIntegration({
          providerType: 'telegram',
          providerCommunityId: '',
          communityId: 'c_test',
        })
      ).rejects.toThrow(InvalidIntegrationError);

      await expect(
        integrationService.createIntegration({
          providerType: 'telegram',
          providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
          communityId: '',
        })
      ).rejects.toThrow(InvalidIntegrationError);
    });

    it('supports enabling and disabling an integration', async () => {
      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_test',
      });

      const disabled = await integrationService.disableIntegration('telegram', AUTHORIZED_TEST_CHAT_ID);
      expect(disabled.isActive).toBe(false);

      const enabled = await integrationService.enableIntegration('telegram', AUTHORIZED_TEST_CHAT_ID);
      expect(enabled.isActive).toBe(true);
    });

    it('throws IntegrationNotFoundError when enabling/disabling non-existent integration', async () => {
      await expect(
        integrationService.enableIntegration('telegram', '-100999999999')
      ).rejects.toThrow(IntegrationNotFoundError);

      await expect(
        integrationService.disableIntegration('telegram', '-100999999999')
      ).rejects.toThrow(IntegrationNotFoundError);
    });

    it('deactivates or removes integration without destroying historical community data', async () => {
      // 1. Create integration and ingest an event
      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_historical_comm',
      });

      const handler = new TelegramWebhookHandler(telegramConfig, ingestionService);
      const updatePayload: TelegramUpdate = {
        update_id: 1001,
        message: {
          message_id: 501,
          date: 1700000000,
          chat: { id: Number(AUTHORIZED_TEST_CHAT_ID), type: 'supergroup', title: 'Test Group' },
          from: { id: 99, is_bot: false, first_name: 'Alice' },
          text: 'Foundational historical announcement for the community',
        },
      };

      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
        updatePayload
      );
      expect(result.statusCode).toBe(200);

      // Verify history exists
      const historyBefore = await historyRepo.getAllDiscussions('c_historical_comm');
      expect(historyBefore.length).toBe(1);

      // 2. Remove integration
      const removed = await integrationService.deactivateOrRemoveIntegration('telegram', AUTHORIZED_TEST_CHAT_ID);
      expect(removed).toBe(true);

      // Verify integration is gone
      const check = await integrationService.getIntegration('telegram', AUTHORIZED_TEST_CHAT_ID);
      expect(check).toBeNull();

      // Verify history is completely intact
      const historyAfter = await historyRepo.getAllDiscussions('c_historical_comm');
      expect(historyAfter.length).toBe(1);
      expect(historyAfter[0].content).toBe('Foundational historical announcement for the community');

      // 3. Subsequent event on the removed chat is rejected (no active integration)
      const nextUpdatePayload: TelegramUpdate = {
        update_id: 1002,
        message: {
          message_id: 502,
          date: 1700000100,
          chat: { id: Number(AUTHORIZED_TEST_CHAT_ID), type: 'supergroup', title: 'Test Group' },
          from: { id: 99, is_bot: false, first_name: 'Alice' },
          text: 'This should be rejected',
        },
      };

      const nextResult = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
        nextUpdatePayload
      );
      expect(nextResult.statusCode).toBe(500); // Ingestion rejected

      // Still exactly 1 historical record
      const historyFinal = await historyRepo.getAllDiscussions('c_historical_comm');
      expect(historyFinal.length).toBe(1);
    });
  });

  describe('2. Strict Community Resolution Invariants', () => {
    it('NO EXPLICIT COMMUNITY INTEGRATION → NO COMMUNITY INGESTION (unknown chat is rejected)', async () => {
      // Configuration allows UNKNOWN_CHAT_ID at network level, but NO integration exists in repository
      const openConfig: TelegramConfig = {
        botToken: BOT_TOKEN,
        webhookSecret: WEBHOOK_SECRET,
        authorizedChatIds: new Set([UNKNOWN_CHAT_ID]),
      };

      const handler = new TelegramWebhookHandler(openConfig, ingestionService);
      const updatePayload: TelegramUpdate = {
        update_id: 2001,
        message: {
          message_id: 601,
          date: 1700000200,
          chat: { id: Number(UNKNOWN_CHAT_ID), type: 'supergroup', title: 'Unknown Random Group' },
          from: { id: 42, is_bot: false, first_name: 'Eve' },
          text: 'Unsolicited message from unconfigured group',
        },
      };

      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
        updatePayload
      );

      // Ingestion rejected
      expect(result.statusCode).toBe(500);
      expect(result.body.reason).toContain(`No active community integration found for telegram:${UNKNOWN_CHAT_ID}`);

      // Verify ZERO synthetic communities or discussions were created
      const allHistories = await historyRepo.getAllDiscussions('c_unregistered');
      expect(allHistories.length).toBe(0);
      const autoHistories = await historyRepo.getAllDiscussions(`telegram_${UNKNOWN_CHAT_ID}`);
      expect(autoHistories.length).toBe(0);
    });

    it('disabled integration rejects incoming events without mutating history', async () => {
      // Create integration and disable it
      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_managed_cohort',
        isActive: false, // Disabled
      });

      const handler = new TelegramWebhookHandler(telegramConfig, ingestionService);
      const updatePayload: TelegramUpdate = {
        update_id: 3001,
        message: {
          message_id: 701,
          date: 1700000300,
          chat: { id: Number(AUTHORIZED_TEST_CHAT_ID), type: 'supergroup', title: 'Test Group' },
          from: { id: 99, is_bot: false, first_name: 'Alice' },
          text: 'Message sent while integration is disabled',
        },
      };

      const result = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
        updatePayload
      );

      expect(result.statusCode).toBe(500);
      expect(result.body.reason).toContain(`Community integration for telegram:${AUTHORIZED_TEST_CHAT_ID} is disabled.`);

      // Verify zero history records
      const histories = await historyRepo.getAllDiscussions('c_managed_cohort');
      expect(histories.length).toBe(0);

      // Re-enable integration
      await integrationService.enableIntegration('telegram', AUTHORIZED_TEST_CHAT_ID);

      // Ingest next message
      const nextUpdate: TelegramUpdate = {
        update_id: 3002,
        message: {
          message_id: 702,
          date: 1700000400,
          chat: { id: Number(AUTHORIZED_TEST_CHAT_ID), type: 'supergroup', title: 'Test Group' },
          from: { id: 99, is_bot: false, first_name: 'Alice' },
          text: 'Message sent after integration was re-enabled',
        },
      };

      const nextResult = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
        nextUpdate
      );

      expect(nextResult.statusCode).toBe(200);
      expect(nextResult.body.action).toBe('processed');

      // History record created now
      const activeHistories = await historyRepo.getAllDiscussions('c_managed_cohort');
      expect(activeHistories.length).toBe(1);
      expect(activeHistories[0].content).toBe('Message sent after integration was re-enabled');
    });
  });

  describe('3. Multi-Community Isolation with Overlapping Message IDs', () => {
    it('isolates Community A and Community B completely, even with identical message and update IDs', async () => {
      // Map Chat A -> Community A, Chat B -> Community B
      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_community_alpha',
      });

      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: SECOND_TEST_CHAT_ID,
        communityId: 'c_community_beta',
      });

      const handler = new TelegramWebhookHandler(telegramConfig, ingestionService);

      // Identical message_id (100) and update_id (5000) sent to both Chat A and Chat B
      const updateA: TelegramUpdate = {
        update_id: 5000,
        message: {
          message_id: 100,
          date: 1700000500,
          chat: { id: Number(AUTHORIZED_TEST_CHAT_ID), type: 'supergroup', title: 'Alpha Chat' },
          from: { id: 99, is_bot: false, first_name: 'Alice' },
          text: 'Alpha community architecture post: https://github.com/alpha/repo',
        },
      };

      const updateB: TelegramUpdate = {
        update_id: 5000, // Same update ID on Telegram side for distinct chat context
        message: {
          message_id: 100, // Same message ID in separate group
          date: 1700000505,
          chat: { id: Number(SECOND_TEST_CHAT_ID), type: 'supergroup', title: 'Beta Chat' },
          from: { id: 99, is_bot: false, first_name: 'Alice' },
          text: 'Beta community architecture post: https://github.com/beta/repo',
        },
      };

      const resA = await handler.processWebhook({ 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, updateA);
      const resB = await handler.processWebhook({ 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, updateB);

      expect(resA.statusCode).toBe(200);
      expect(resB.statusCode).toBe(200);

      const alphaDiscussions = await historyRepo.getAllDiscussions('c_community_alpha');
      const betaDiscussions = await historyRepo.getAllDiscussions('c_community_beta');

      expect(alphaDiscussions.length).toBe(1);
      expect(betaDiscussions.length).toBe(1);

      expect(alphaDiscussions[0].content).toContain('Alpha community architecture post');
      expect(betaDiscussions[0].content).toContain('Beta community architecture post');
      expect(alphaDiscussions[0].communityId).toBe('c_community_alpha');
      expect(betaDiscussions[0].communityId).toBe('c_community_beta');
      expect(alphaDiscussions[0].id).not.toBe(betaDiscussions[0].id);
    });
  });

  describe('4. Webhook & Reconciliation Equivalence', () => {
    it('produces identical state whether an update arrives via Webhook or Reconciliation first or both', async () => {
      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_idempotency_audit',
      });

      const reconciliationService = new TelegramUpdateReconciliationService(
        mockClient,
        telegramConfig,
        ingestionService,
        checkpointRepo,
        integrationRepo
      );
      const webhookHandler = new TelegramWebhookHandler(telegramConfig, ingestionService);

      const testUpdate: TelegramUpdate = {
        update_id: 88001,
        message: {
          message_id: 301,
          date: 1700001000,
          chat: { id: Number(AUTHORIZED_TEST_CHAT_ID), type: 'supergroup', title: 'Idempotency Audit' },
          from: { id: 77, is_bot: false, first_name: 'Bob' },
          text: 'Critical RFC proposal for discussion: https://ietf.org/rfc/rfc9999.txt',
        },
      };

      // 1. Arrives via Webhook
      const webhookRes = await webhookHandler.processWebhook(
        { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
        testUpdate
      );
      expect(webhookRes.statusCode).toBe(200);
      expect(webhookRes.body.action).toBe('processed');

      const discussionsAfterWebhook = await historyRepo.getAllDiscussions('c_idempotency_audit');
      expect(discussionsAfterWebhook.length).toBe(1);
      const firstDisc = discussionsAfterWebhook[0];

      // 2. Mock client queues the exact same update for reconciliation
      mockClient.seedUpdates([testUpdate]);

      // 3. Reconcile updates
      const reconResult = await reconciliationService.reconcileUpdates();
      expect(reconResult.updatesFetched).toBe(1);
      expect(reconResult.duplicatesSkipped).toBe(1);
      expect(reconResult.eventsIngested).toBe(0);

      // Verify no duplicate discussion, no duplicate history
      const discussionsAfterRecon = await historyRepo.getAllDiscussions('c_idempotency_audit');
      expect(discussionsAfterRecon.length).toBe(1);
      expect(discussionsAfterRecon[0].id).toBe(firstDisc.id);
      expect(discussionsAfterRecon[0].resources?.length).toBe(1);
      expect(discussionsAfterRecon[0].replies.length).toBe(0);
    });
  });

  describe('5. Full Message Lifecycle with Normalized History', () => {
    it('handles root message, nested reply, in-place edit, and deletion tombstone cleanly', async () => {
      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_lifecycle_full',
      });

      const handler = new TelegramWebhookHandler(telegramConfig, ingestionService);

      // 1. Root message
      const rootUpdate: TelegramUpdate = {
        update_id: 9001,
        message: {
          message_id: 1101,
          date: 1700002000,
          chat: { id: Number(AUTHORIZED_TEST_CHAT_ID), type: 'supergroup' },
          from: { id: 10, is_bot: false, first_name: 'Carol' },
          text: 'Initial design document draft',
        },
      };
      await handler.processWebhook({ 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, rootUpdate);

      let discussions = await historyRepo.getAllDiscussions('c_lifecycle_full');
      expect(discussions.length).toBe(1);
      expect(discussions[0].content).toBe('Initial design document draft');
      expect(discussions[0].replyCount).toBe(0);

      // 2. Reply to root message
      const replyUpdate: TelegramUpdate = {
        update_id: 9002,
        message: {
          message_id: 1102,
          date: 1700002060,
          chat: { id: Number(AUTHORIZED_TEST_CHAT_ID), type: 'supergroup' },
          from: { id: 11, is_bot: false, first_name: 'Dave' },
          reply_to_message: {
            message_id: 1101,
            date: 1700002000,
            chat: { id: Number(AUTHORIZED_TEST_CHAT_ID), type: 'supergroup' },
            from: { id: 10, is_bot: false, first_name: 'Carol' },
            text: 'Initial design document draft',
          },
          text: 'LGTM! Great work on section 3.',
        },
      };
      await handler.processWebhook({ 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, replyUpdate);

      discussions = await historyRepo.getAllDiscussions('c_lifecycle_full');
      expect(discussions.length).toBe(1);
      expect(discussions[0].replyCount).toBe(1);
      expect(discussions[0].replies[0].content).toBe('LGTM! Great work on section 3.');

      // 3. Edit root message
      const editUpdate: TelegramUpdate = {
        update_id: 9003,
        edited_message: {
          message_id: 1101,
          date: 1700002120,
          chat: { id: Number(AUTHORIZED_TEST_CHAT_ID), type: 'supergroup' },
          from: { id: 10, is_bot: false, first_name: 'Carol' },
          text: 'Initial design document draft (v2 with performance benchmarks)',
        },
      };
      await handler.processWebhook({ 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, editUpdate);

      discussions = await historyRepo.getAllDiscussions('c_lifecycle_full');
      expect(discussions[0].content).toContain('(v2 with performance benchmarks)');
      expect(discussions[0].sourceProvenance?.isEdited).toBe(true);

      // 4. Delete root message
      const deleteEvent = {
        provider: 'telegram',
        externalCommunityId: AUTHORIZED_TEST_CHAT_ID,
        externalEventId: 'del_1101',
        externalMessageId: '1101',
        eventType: 'message_deleted' as const,
        timestamp: new Date(1700002200 * 1000),
      };
      await ingestionService.ingestEvent(deleteEvent);

      discussions = await historyRepo.getAllDiscussions('c_lifecycle_full');
      expect(discussions[0].isDeleted).toBe(true);
    });
  });

  describe('6. Persistence Across Process Restarts', () => {
    it('survives simulated shutdown and restart without losing configuration or active/disabled state', async () => {
      // 1. Create integrations
      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_persistent_alpha',
        isActive: true,
      });

      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: SECOND_TEST_CHAT_ID,
        communityId: 'c_persistent_beta',
        isActive: false, // Disabled
      });

      // 2. Simulate process restart by instantiating new repositories from disk
      const newIntegrationRepo = new DurableFileCommunityIntegrationRepository(integrationsPath);
      const newIntegrationService = new CommunityIntegrationService(newIntegrationRepo);

      const all = await newIntegrationService.listAllIntegrations();
      expect(all.length).toBe(2);

      const alpha = await newIntegrationService.getIntegration('telegram', AUTHORIZED_TEST_CHAT_ID);
      expect(alpha).not.toBeNull();
      expect(alpha?.communityId).toBe('c_persistent_alpha');
      expect(alpha?.isActive).toBe(true);

      const beta = await newIntegrationService.getIntegration('telegram', SECOND_TEST_CHAT_ID);
      expect(beta).not.toBeNull();
      expect(beta?.communityId).toBe('c_persistent_beta');
      expect(beta?.isActive).toBe(false);
    });
  });

  describe('7. Security & Secret Sanitization Audit', () => {
    it('ensures bot token and webhook secret never leak in health reports or error summaries', async () => {
      await integrationService.createIntegration({
        providerType: 'telegram',
        providerCommunityId: AUTHORIZED_TEST_CHAT_ID,
        communityId: 'c_secure_comm',
      });

      // Simulate a raw error containing bot token and webhook secret
      const rawErrorWithSecrets = `Failed request to https://api.telegram.org/bot${BOT_TOKEN}/setWebhook with secret ${WEBHOOK_SECRET}`;
      
      // Inject failure with raw string
      const int = await integrationRepo.findByProviderCommunityId('telegram', AUTHORIZED_TEST_CHAT_ID);
      if (int) {
        int.lastProcessingError = rawErrorWithSecrets;
        int.lastFailedIngestionAt = new Date();
        await integrationRepo.saveIntegration(int);
      }

      // Query health through sanitized observability service
      const healthReport = await observabilityService.getHealthReport();
      const intSummary = healthReport.integrations.find(
        (i) => i.providerCommunityId === AUTHORIZED_TEST_CHAT_ID
      );

      expect(intSummary?.lastProcessingError).toBeDefined();
      expect(intSummary?.lastProcessingError).not.toContain(BOT_TOKEN);
      expect(intSummary?.lastProcessingError).not.toContain(WEBHOOK_SECRET);
      expect(intSummary?.lastProcessingError).toContain('***REDACTED_BOT_TOKEN***');
      expect(intSummary?.lastProcessingError).toContain('***REDACTED***');

      // Check single integration health query
      const singleHealth = await integrationService.getIntegrationHealth('telegram', AUTHORIZED_TEST_CHAT_ID);
      expect(singleHealth?.lastProcessingError).not.toContain(BOT_TOKEN);
      expect(singleHealth?.lastProcessingError).not.toContain(WEBHOOK_SECRET);
      expect(singleHealth?.lastProcessingError).toContain('***REDACTED_BOT_TOKEN***');
    });
  });
});
