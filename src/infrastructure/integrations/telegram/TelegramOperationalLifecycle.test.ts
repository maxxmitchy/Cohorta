import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TelegramWebhookService } from './TelegramWebhookService';
import { ITelegramClient, TelegramUpdate } from './ITelegramClient';
import { TelegramConfig } from './TelegramConfig';
import { TelegramUpdateReconciliationService } from './TelegramUpdateReconciliationService';
import { IngestionRecoveryService } from '../../../core/services/IngestionRecoveryService';
import { IngestionObservabilityService } from '../../../core/services/IngestionObservabilityService';
import { CommunityEventIngestionService } from '../../../core/services/CommunityEventIngestionService';
import { DurableFileIngestionEventRepository } from '../../db/durable/DurableFileIngestionEventRepository';
import { DurableFileCommunityHistoryRepository } from '../../db/durable/DurableFileCommunityHistoryRepository';
import { DurableFileCommunityIntegrationRepository } from '../../db/durable/DurableFileCommunityIntegrationRepository';
import { MockIngestionEventRepository } from '../../db/mock/MockIngestionEventRepository';
import { MockCommunityHistoryRepository } from '../../db/mock/MockCommunityHistoryRepository';
import { MockCommunityIntegrationRepository } from '../../db/mock/MockCommunityIntegrationRepository';
import { ExternalCommunitySourceEvent } from '../../../core/source/ExternalCommunitySourceEvent';

describe('Phase 13.5 Telegram Operational Lifecycle, Reconciliation & Observability', () => {
  let tempDir: string;
  let ingestionFile: string;
  let historyFile: string;
  let integrationFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohorta-ops-'));
    ingestionFile = path.join(tempDir, 'ingestion_events.json');
    historyFile = path.join(tempDir, 'community_history.json');
    integrationFile = path.join(tempDir, 'community_integrations.json');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  // =========================================================================
  // 1. TELEGRAM WEBHOOK LIFECYCLE & SECRET SAFETY
  // =========================================================================
  describe('1. Telegram Webhook Lifecycle & Secret Safety', () => {
    it('registers webhook securely and validates HTTPS protocol', async () => {
      const mockClient: ITelegramClient = {
        setWebhook: vi.fn().mockResolvedValue(true),
        getWebhookInfo: vi.fn().mockResolvedValue({
          url: 'https://example.com/api/webhooks/telegram',
          has_custom_certificate: false,
          pending_update_count: 0,
        }),
        deleteWebhook: vi.fn().mockResolvedValue(true),
        fetchUpdates: vi.fn().mockResolvedValue([]),
        getMe: vi.fn().mockResolvedValue({ id: 123, is_bot: true, first_name: 'CohortaBot' }),
      };

      const config: TelegramConfig = {
        botToken: '123456:SECRET_BOT_TOKEN_ABC',
        webhookSecret: 'secret_token_xyz_999',
      };

      const webhookService = new TelegramWebhookService(mockClient, config);

      // Insecure HTTP to non-localhost should fail
      await expect(
        webhookService.setWebhook({ url: 'http://insecure-domain.com/webhook' })
      ).rejects.toThrow('Webhook URL must use HTTPS protocol');

      // Valid HTTPS registration
      const result = await webhookService.setWebhook({
        url: 'https://app.cohorta.io/api/webhooks/telegram',
        dropPendingUpdates: true,
      });

      expect(result.success).toBe(true);
      expect(mockClient.setWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://app.cohorta.io/api/webhooks/telegram',
          secret_token: 'secret_token_xyz_999',
          drop_pending_updates: true,
        })
      );
    });

    it('redacts bot tokens and webhook secrets in error messages', async () => {
      const sensitiveToken = '987654:SENSITIVE_BOT_TOKEN';
      const sensitiveSecret = 'VERY_SECRET_TOKEN_12345';

      const mockClient: ITelegramClient = {
        setWebhook: vi.fn().mockRejectedValue(new Error(`Failed communicating with token ${sensitiveToken} using ${sensitiveSecret}`)),
        getWebhookInfo: vi.fn(),
        deleteWebhook: vi.fn(),
        fetchUpdates: vi.fn(),
        getMe: vi.fn(),
      };

      const config: TelegramConfig = {
        botToken: sensitiveToken,
        webhookSecret: sensitiveSecret,
      };

      const webhookService = new TelegramWebhookService(mockClient, config);

      let thrownError: Error | null = null;
      try {
        await webhookService.setWebhook({ url: 'https://app.cohorta.io/webhook' });
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).not.toContain(sensitiveToken);
      expect(thrownError?.message).not.toContain(sensitiveSecret);
      expect(thrownError?.message).toContain('***REDACTED***');
    });

    it('retrieves webhook info and deletes webhook safely', async () => {
      const mockClient: ITelegramClient = {
        setWebhook: vi.fn(),
        getWebhookInfo: vi.fn().mockResolvedValue({
          url: 'https://user:password123@app.cohorta.io/webhook',
          has_custom_certificate: false,
          pending_update_count: 5,
          last_error_date: 1724832000,
          last_error_message: 'Connection timed out',
        }),
        deleteWebhook: vi.fn().mockResolvedValue(true),
        fetchUpdates: vi.fn(),
        getMe: vi.fn(),
      };

      const webhookService = new TelegramWebhookService(mockClient, {
        botToken: 'fake_bot_token',
      });

      const info = await webhookService.getWebhookInfo();
      expect(info.isConfigured).toBe(true);
      expect(info.pendingUpdateCount).toBe(5);
      expect(info.url).not.toContain('password123'); // Password in URL is sanitized
      expect(info.lastErrorMessage).toBe('Connection timed out');

      const delResult = await webhookService.deleteWebhook({ dropPendingUpdates: true });
      expect(delResult.success).toBe(true);
      expect(mockClient.deleteWebhook).toHaveBeenCalledWith({ dropPendingUpdates: true });
    });
  });

  // =========================================================================
  // 2. INGESTION RECOVERY, DEAD-LETTER & RETRY CEILING
  // =========================================================================
  describe('2. Ingestion Recovery Service & Dead-Letter Boundaries', () => {
    it('retries recoverable failed events and marks unrecoverable ones permanently_failed', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_1',
          communityId: 'com_defi',
          providerType: 'telegram',
          providerCommunityId: '-100888999',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const recoveryService = new IngestionRecoveryService(ingestionRepo, ingestionService);

      // Seed 1 recoverable failed event and 1 event that has reached max retries
      const event1 = await ingestionRepo.claimEvent('telegram', '-100888999', 'upd_recoverable');
      await ingestionRepo.updateStatus(event1.record.id, 'failed', 'Network timeout', undefined, {
        payload: { text: 'Hello recoverable world' },
      });

      const event2 = await ingestionRepo.claimEvent('telegram', '-100888999', 'upd_exhausted');
      await ingestionRepo.updateStatus(event2.record.id, 'failed', 'Persistent 500 error', undefined, {
        payload: { text: 'Exhausted event' },
      });
      // Manually simulate retryCount = 3 using seedEvent
      const target2 = (await ingestionRepo.getAllEvents()).find((e) => e.id === event2.record.id)!;
      target2.retryCount = 3;
      ingestionRepo.seedEvent(target2);

      const reconstructor = async (event: any): Promise<ExternalCommunitySourceEvent | null> => {
        if (!event.payload) return null;
        return {
          provider: event.provider,
          externalCommunityId: event.externalCommunityId,
          externalEventId: event.externalEventId,
          externalMessageId: `msg_${event.externalEventId}`,
          eventType: 'message_created',
          author: { externalUserId: 'usr_1', displayName: 'Dave' },
          content: event.payload.text,
          timestamp: new Date(),
        };
      };

      const summary = await recoveryService.retryFailedEvents(reconstructor, {
        maxRetries: 3,
      });

      expect(summary.scanned).toBe(2);
      expect(summary.retried).toBe(1);
      expect(summary.recovered).toBe(1);
      expect(summary.permanentlyFailed).toBe(1); // event2 was permanently failed

      const updatedEvents = await ingestionRepo.getAllEvents();
      const updated1 = updatedEvents.find((e) => e.externalEventId === 'upd_recoverable')!;
      const updated2 = updatedEvents.find((e) => e.externalEventId === 'upd_exhausted')!;

      expect(updated1.status).toBe('processed');
      expect(updated2.status).toBe('permanently_failed');
      expect(updated2.permanentlyFailedAt).toBeDefined();
    });

    it('recovers stale in-flight events after processing timeout', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_1',
          communityId: 'com_defi',
          providerType: 'telegram',
          providerCommunityId: '-100888999',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const recoveryService = new IngestionRecoveryService(ingestionRepo, ingestionService);

      // Create an in-flight event with old timestamp
      const eventClaim = await ingestionRepo.claimEvent('telegram', '-100888999', 'upd_stale_1');
      const all = await ingestionRepo.getAllEvents();
      const target = all.find((e) => e.id === eventClaim.record.id)!;
      target.lastAttemptAt = new Date(Date.now() - 60_000); // 60s ago
      ingestionRepo.seedEvent(target);

      const summary = await recoveryService.recoverStaleEvents(
        async (event) => ({
          provider: event.provider,
          externalCommunityId: event.externalCommunityId,
          externalEventId: event.externalEventId,
          externalMessageId: 'msg_stale_1',
          eventType: 'message_created',
          author: { externalUserId: 'usr_2', displayName: 'Elena' },
          content: 'Recovered from stale lock',
          timestamp: new Date(),
        }),
        { staleTimeoutMs: 30_000 }
      );

      expect(summary.scanned).toBe(1);
      expect(summary.retried).toBe(1);
      expect(summary.recovered).toBe(1);

      const refreshed = (await ingestionRepo.getAllEvents()).find((e) => e.id === eventClaim.record.id)!;
      expect(refreshed.status).toBe('processed');
      expect(refreshed.retryCount).toBe(2);
    });

    it('single event replayEvent allows targeted replay of specific event', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_1',
          communityId: 'com_defi',
          providerType: 'telegram',
          providerCommunityId: '-100888999',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const recoveryService = new IngestionRecoveryService(ingestionRepo, ingestionService);

      const eventClaim = await ingestionRepo.claimEvent('telegram', '-100888999', 'upd_manual_replay');
      await ingestionRepo.updateStatus(eventClaim.record.id, 'failed', 'Manual intervention needed');

      const replayResult = await recoveryService.replayEvent(
        eventClaim.record.id,
        async (e) => ({
          provider: e.provider,
          externalCommunityId: e.externalCommunityId,
          externalEventId: e.externalEventId,
          externalMessageId: 'msg_manual_1',
          eventType: 'message_created',
          author: { externalUserId: 'usr_3', displayName: 'Frank' },
          content: 'Manually replayed discussion topic',
          timestamp: new Date(),
        })
      );

      expect(replayResult.success).toBe(true);
      expect(replayResult.event.status).toBe('processed');
    });
  });

  // =========================================================================
  // 3. TELEGRAM UPDATE RECONCILIATION (GETUPDATES BACKLOG)
  // =========================================================================
  describe('3. Telegram Update Reconciliation & Checkpoints', () => {
    it('fetches missed updates, ingests through canonical pipeline, and advances checkpoint', async () => {
      const sampleUpdates: TelegramUpdate[] = [
        {
          update_id: 1001,
          message: {
            message_id: 501,
            date: 1724832000,
            chat: { id: -100888999, type: 'supergroup', title: 'DeFi Builders' },
            from: { id: 201, is_bot: false, first_name: 'Grace' },
            text: 'Reconciled message #1',
          },
        },
        {
          update_id: 1002,
          message: {
            message_id: 502,
            date: 1724832010,
            chat: { id: -100888999, type: 'supergroup', title: 'DeFi Builders' },
            from: { id: 202, is_bot: false, first_name: 'Hank' },
            text: 'Reconciled message #2',
          },
        },
      ];

      const mockClient: ITelegramClient = {
        setWebhook: vi.fn(),
        getWebhookInfo: vi.fn(),
        deleteWebhook: vi.fn(),
        fetchUpdates: vi.fn().mockImplementation(async ({ offset }) => {
          if (offset && offset > 1002) return [];
          return sampleUpdates;
        }),
        getMe: vi.fn(),
      };

      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_tg_1',
          communityId: 'com_defi',
          providerType: 'telegram',
          providerCommunityId: '-100888999',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
          lastCheckpoint: 1000,
        },
      ]);

      const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const reconciliationService = new TelegramUpdateReconciliationService(
        mockClient,
        { botToken: 'test_token' },
        ingestionService,
        integrationRepo
      );

      const result = await reconciliationService.reconcileUpdates({ maxBatches: 2 });

      expect(result.updatesFetched).toBe(2);
      expect(result.eventsIngested).toBe(2);
      expect(result.checkpointSaved).toBe(1002);

      // Verify integration checkpoint was updated in repository
      const updatedIntegration = await integrationRepo.findByProviderCommunityId('telegram', '-100888999');
      expect(updatedIntegration?.lastCheckpoint).toBe(1002);
      expect(updatedIntegration?.lastSuccessfulIngestionAt).toBeDefined();

      // Running reconciliation again with same updates should skip duplicates
      const result2 = await reconciliationService.reconcileUpdates({ offset: 1001, maxBatches: 1 });
      expect(result2.duplicatesSkipped).toBe(2);
    });
  });

  // =========================================================================
  // 4. OBSERVABILITY & PIPELINE HEALTH MONITORING
  // =========================================================================
  describe('4. Ingestion Observability & Health Reporting', () => {
    it('produces an accurate health report with active metrics and dead-letter summaries', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_1',
          communityId: 'com_ai',
          providerType: 'telegram',
          providerCommunityId: '-100111222',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
          lastCheckpoint: 500,
        },
        {
          id: 'int_2',
          communityId: 'com_gaming',
          providerType: 'telegram',
          providerCommunityId: '-100333444',
          isActive: false,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const obsService = new IngestionObservabilityService(ingestionRepo, integrationRepo);

      // Seed processed, failed, permanently failed, and active events
      const e1 = await ingestionRepo.claimEvent('telegram', '-100111222', 'evt_1');
      await ingestionRepo.updateStatus(e1.record.id, 'processed');

      const e2 = await ingestionRepo.claimEvent('telegram', '-100111222', 'evt_2');
      await ingestionRepo.updateStatus(e2.record.id, 'failed', 'Transient error');

      const e3 = await ingestionRepo.claimEvent('telegram', '-100111222', 'evt_3');
      await ingestionRepo.markPermanentlyFailed(e3.record.id, 'Fatal schema error');

      const report = await obsService.getHealthReport();

      expect(report.totalEvents).toBe(3);
      expect(report.processedCount).toBe(1);
      expect(report.failedCount).toBe(1);
      expect(report.permanentlyFailedCount).toBe(1);
      expect(report.activeIntegrationsCount).toBe(1);
      expect(report.status).toBe('unhealthy'); // Because of permanentlyFailedCount > 0
      expect(report.recentDeadLetterEvents.length).toBe(1);
      expect(report.recentDeadLetterEvents[0].error).toBe('Fatal schema error');

      const deadLetters = await obsService.getDeadLetterEvents();
      expect(deadLetters.length).toBe(1);
      expect(deadLetters[0].externalEventId).toBe('evt_3');
    });
  });

  // =========================================================================
  // 5. COMMUNITY INTEGRATION ACTIVE / DISABLED ENFORCEMENT
  // =========================================================================
  describe('5. Community Integration Active / Disabled Enforcement', () => {
    it('rejects ingestion when community integration is disabled and allows when re-enabled', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_disabled',
          communityId: 'com_vault',
          providerType: 'telegram',
          providerCommunityId: '-100777888',
          isActive: false, // DISABLED
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100777888',
        externalEventId: 'upd_disabled_test',
        externalMessageId: 'msg_disabled_test',
        eventType: 'message_created',
        author: { externalUserId: 'usr_disabled', displayName: 'Ghost' },
        content: 'Should fail because integration is disabled',
        timestamp: new Date(),
      };

      const result1 = await service.ingestEvent(event);
      expect(result1.outcome).toBe('failed');
      expect(result1.error).toContain('disabled');

      // Verify integration recorded the failure
      const intg = await integrationRepo.findByProviderCommunityId('telegram', '-100777888');
      expect(intg?.lastFailedIngestionAt).toBeDefined();
      expect(intg?.lastProcessingError).toContain('disabled');

      // Re-enable integration
      await integrationRepo.setIntegrationActive('telegram', '-100777888', true);

      // Retry ingestion
      const result2 = await service.ingestEvent(event);
      expect(result2.outcome).toBe('processed');

      const intgAfter = await integrationRepo.findByProviderCommunityId('telegram', '-100777888');
      expect(intgAfter?.lastSuccessfulIngestionAt).toBeDefined();
      expect(intgAfter?.lastProcessingError).toBeUndefined();
    });
  });
});
