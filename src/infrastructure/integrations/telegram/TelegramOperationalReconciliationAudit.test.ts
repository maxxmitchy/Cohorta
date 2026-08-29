import { describe, it, expect, beforeEach } from 'vitest';
import { TelegramUpdateReconciliationService } from './TelegramUpdateReconciliationService';
import { MockTelegramClient } from './MockTelegramClient';
import { MockTelegramBotCheckpointRepository } from './MockTelegramBotCheckpointRepository';
import { TelegramConfig } from './TelegramConfig';
import { CommunityEventIngestionService } from '../../../core/services/CommunityEventIngestionService';
import { IngestionRecoveryService } from '../../../core/services/IngestionRecoveryService';
import { IngestionObservabilityService } from '../../../core/services/IngestionObservabilityService';
import { MockIngestionEventRepository } from '../../db/mock/MockIngestionEventRepository';
import { MockCommunityHistoryRepository } from '../../db/mock/MockCommunityHistoryRepository';
import { MockCommunityIntegrationRepository } from '../../db/mock/MockCommunityIntegrationRepository';
import { TelegramSecretSanitizer } from './TelegramSecretSanitizer';
import { TelegramSourceAdapter } from './TelegramSourceAdapter';
import { TelegramWebhookService } from './TelegramWebhookService';
import { ExternalCommunitySourceEvent } from '../../../core/source/ExternalCommunitySourceEvent';

describe('Phase 13.5.1 — Reconciliation Safety, Community Resolution & Operational Integrity', () => {
  let mockClient: MockTelegramClient;
  let checkpointRepo: MockTelegramBotCheckpointRepository;
  let ingestionRepo: MockIngestionEventRepository;
  let historyRepo: MockCommunityHistoryRepository;
  let integrationRepo: MockCommunityIntegrationRepository;
  let ingestionService: CommunityEventIngestionService;
  let reconciliationService: TelegramUpdateReconciliationService;
  let recoveryService: IngestionRecoveryService;
  let observabilityService: IngestionObservabilityService;
  let config: TelegramConfig;

  const BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567';
  const WEBHOOK_SECRET = 'super_secret_webhook_token_999';

  beforeEach(async () => {
    config = {
      botToken: BOT_TOKEN,
      webhookSecret: WEBHOOK_SECRET,
      authorizedChatIds: new Set(['-100111', '-100222', '-100333']),
    };

    mockClient = new MockTelegramClient();
    checkpointRepo = new MockTelegramBotCheckpointRepository();
    ingestionRepo = new MockIngestionEventRepository();
    historyRepo = new MockCommunityHistoryRepository();
    integrationRepo = new MockCommunityIntegrationRepository();

    // Map communities
    await integrationRepo.saveIntegration({
      id: 'int_alpha',
      providerType: 'telegram',
      providerCommunityId: '-100111',
      communityId: 'comm_alpha',
      isActive: true,
      metadata: {},
      createdAt: new Date(),
    });

    await integrationRepo.saveIntegration({
      id: 'int_beta',
      providerType: 'telegram',
      providerCommunityId: '-100222',
      communityId: 'comm_beta',
      isActive: true,
      metadata: {},
      createdAt: new Date(),
    });

    ingestionService = new CommunityEventIngestionService(
      ingestionRepo,
      historyRepo,
      integrationRepo
    );

    reconciliationService = new TelegramUpdateReconciliationService(
      mockClient,
      config,
      ingestionService,
      checkpointRepo,
      integrationRepo
    );

    recoveryService = new IngestionRecoveryService(ingestionRepo, ingestionService);
    observabilityService = new IngestionObservabilityService(ingestionRepo, integrationRepo);
  });

  // =========================================================================
  // 1. RECONCILIATION CHECKPOINT SAFETY
  // =========================================================================

  it('Scenario 1: [101 processed, 102 failed, 103 processed] -> Checkpoint halts at 101, offset becomes 102', async () => {
    // 101: Chat -100111 (valid integration -> will succeed)
    // 102: Chat -100999 (no integration -> will fail in CommunityEventIngestionService)
    // 103: Chat -100111 (valid integration -> would succeed)
    mockClient.seedUpdates([
      {
        update_id: 101,
        message: {
          message_id: 1,
          date: 1700000001,
          chat: { id: -100111, type: 'supergroup', title: 'Alpha Community' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Message 101',
        },
      },
      {
        update_id: 102,
        message: {
          message_id: 2,
          date: 1700000002,
          chat: { id: -100333, type: 'supergroup', title: 'Unmapped Community' }, // Authorized chat in adapter, but unmapped in integrationRepo!
          from: { id: 20, first_name: 'Bob', is_bot: false },
          text: 'Message 102 (will fail resolution)',
        },
      },
      {
        update_id: 103,
        message: {
          message_id: 3,
          date: 1700000003,
          chat: { id: -100111, type: 'supergroup', title: 'Alpha Community' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Message 103',
        },
      },
    ]);

    const result = await reconciliationService.reconcileUpdates();

    // Invariants:
    // Update 101 succeeded.
    // Update 102 failed (unmapped integration).
    // Update 103 succeeded, but checkpoint MUST NOT skip 102!
    expect(result.updatesFetched).toBe(3);
    expect(result.eventsIngested).toBe(2);
    expect(result.failures).toBe(1);
    expect(result.checkpointSaved).toBe(101);

    const botCp = await checkpointRepo.getCheckpoint('bot_123456789');
    expect(botCp?.lastContiguousUpdateId).toBe(101);
  });

  it('Scenario 2: [101 processed, 102 processed, 103 failed] -> Checkpoint advances to 102', async () => {
    mockClient.seedUpdates([
      {
        update_id: 101,
        message: {
          message_id: 1,
          date: 1700000001,
          chat: { id: -100111, type: 'supergroup', title: 'Alpha' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Message 101',
        },
      },
      {
        update_id: 102,
        message: {
          message_id: 2,
          date: 1700000002,
          chat: { id: -100111, type: 'supergroup', title: 'Alpha' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Message 102',
        },
      },
      {
        update_id: 103,
        message: {
          message_id: 3,
          date: 1700000003,
          chat: { id: -100333, type: 'supergroup', title: 'Unmapped' },
          from: { id: 20, first_name: 'Bob', is_bot: false },
          text: 'Message 103 (fails)',
        },
      },
    ]);

    const result = await reconciliationService.reconcileUpdates();

    expect(result.eventsIngested).toBe(2);
    expect(result.failures).toBe(1);
    expect(result.checkpointSaved).toBe(102);

    const botCp = await checkpointRepo.getCheckpoint('bot_123456789');
    expect(botCp?.lastContiguousUpdateId).toBe(102);
  });

  it('Scenario 3: Gap in updates [101, 103] missing 102 -> Checkpoint does not advance past 101', async () => {
    mockClient.seedUpdates([
      {
        update_id: 101,
        message: {
          message_id: 1,
          date: 1700000001,
          chat: { id: -100111, type: 'supergroup' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Message 101',
        },
      },
      {
        update_id: 103, // Missing 102!
        message: {
          message_id: 3,
          date: 1700000003,
          chat: { id: -100111, type: 'supergroup' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Message 103',
        },
      },
    ]);

    const result = await reconciliationService.reconcileUpdates();

    // Checkpoint must halt at 101 because 102 was missing from the stream
    expect(result.eventsIngested).toBe(2);
    expect(result.checkpointSaved).toBe(101);

    const botCp = await checkpointRepo.getCheckpoint('bot_123456789');
    expect(botCp?.lastContiguousUpdateId).toBe(101);
  });

  it('Scenario 4: Out-of-order updates [103, 101, 102] are sorted and correctly finalized to 103', async () => {
    mockClient.seedUpdates([
      {
        update_id: 103,
        message: {
          message_id: 3,
          date: 1700000003,
          chat: { id: -100111, type: 'supergroup' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Message 103',
        },
      },
      {
        update_id: 101,
        message: {
          message_id: 1,
          date: 1700000001,
          chat: { id: -100111, type: 'supergroup' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Message 101',
        },
      },
      {
        update_id: 102,
        message: {
          message_id: 2,
          date: 1700000002,
          chat: { id: -100111, type: 'supergroup' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Message 102',
        },
      },
    ]);

    const result = await reconciliationService.reconcileUpdates();

    expect(result.eventsIngested).toBe(3);
    expect(result.checkpointSaved).toBe(103);

    const botCp = await checkpointRepo.getCheckpoint('bot_123456789');
    expect(botCp?.lastContiguousUpdateId).toBe(103);
  });

  // =========================================================================
  // 2. COMMUNITY RESOLUTION & NO SYNTHETIC IDS
  // =========================================================================

  it('Scenario 5: Ingestion with no integration -> rejected; NEVER fabricates synthetic community IDs', async () => {
    const unmappedEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalEventId: 'upd_9999',
      externalCommunityId: '-100999_unmapped',
      externalMessageId: 'msg_9999',
      eventType: 'message_created',
      author: { externalUserId: 'user_1', displayName: 'Ghost' },
      content: 'Hello unmapped world',
      timestamp: new Date(),
    };

    const res = await ingestionService.ingestEvent(unmappedEvent);

    expect(res.outcome).toBe('failed');
    expect(res.error).toContain('No active community integration found');

    // Confirm no discussion was saved in any synthetic community
    const allSyntheticDiscussions = await historyRepo.getAllDiscussions('com_telegram_-100999_unmapped');
    expect(allSyntheticDiscussions.length).toBe(0);

    const allDiscussionsAlpha = await historyRepo.getAllDiscussions('comm_alpha');
    expect(allDiscussionsAlpha.length).toBe(0);
  });

  it('Scenario 6: Ingestion with disabled integration -> rejected; no mutation to history', async () => {
    await integrationRepo.saveIntegration({
      id: 'int_gamma',
      providerType: 'telegram',
      providerCommunityId: '-100333',
      communityId: 'comm_gamma',
      isActive: false, // Disabled
      metadata: {},
      createdAt: new Date(),
    });

    const disabledEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalEventId: 'upd_7777',
      externalCommunityId: '-100333',
      externalMessageId: 'msg_7777',
      eventType: 'message_created',
      author: { externalUserId: 'user_2', displayName: 'Alice' },
      content: 'Message to disabled community',
      timestamp: new Date(),
    };

    const res = await ingestionService.ingestEvent(disabledEvent);

    expect(res.outcome).toBe('failed');
    expect(res.error).toContain('disabled');

    const gammaDiscussions = await historyRepo.getAllDiscussions('comm_gamma');
    expect(gammaDiscussions.length).toBe(0);
  });

  it('Scenario 7: Multi-Community isolation between distinct Telegram chats', async () => {
    const eventAlpha: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalEventId: 'ev_a1',
      externalCommunityId: '-100111',
      externalMessageId: 'msg_a1',
      eventType: 'message_created',
      author: { externalUserId: 'user_a', displayName: 'Alpha User' },
      content: 'Alpha discussion topic',
      timestamp: new Date(),
    };

    const eventBeta: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalEventId: 'ev_b1',
      externalCommunityId: '-100222',
      externalMessageId: 'msg_b1',
      eventType: 'message_created',
      author: { externalUserId: 'user_b', displayName: 'Beta User' },
      content: 'Beta discussion topic',
      timestamp: new Date(),
    };

    await ingestionService.ingestEvent(eventAlpha);
    await ingestionService.ingestEvent(eventBeta);

    const alphaDiscussions = await historyRepo.getAllDiscussions('comm_alpha');
    const betaDiscussions = await historyRepo.getAllDiscussions('comm_beta');

    expect(alphaDiscussions.length).toBe(1);
    expect(alphaDiscussions[0].title).toContain('Alpha discussion topic');

    expect(betaDiscussions.length).toBe(1);
    expect(betaDiscussions[0].title).toContain('Beta discussion topic');
  });

  // =========================================================================
  // 3. MANUAL REPLAY & RETRY SEMANTICS
  // =========================================================================

  it('Scenario 8: Replay of processed event -> duplicate ignored, discussion not duplicated', async () => {
    const event: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalEventId: 'ev_proc1',
      externalCommunityId: '-100111',
      externalMessageId: 'msg_proc1',
      eventType: 'message_created',
      author: { externalUserId: 'user_1', displayName: 'Alice' },
      content: 'Original message',
      timestamp: new Date(),
    };

    const initialResult = await ingestionService.ingestEvent(event);
    expect(initialResult.outcome).toBe('processed');

    const eventRecord = initialResult.ingestionRecord!;
    expect(eventRecord.status).toBe('processed');

    const replayResult = await recoveryService.replayEvent(eventRecord.id, async () => event);

    expect(replayResult.success).toBe(true);
    expect(replayResult.outcome).toBe('duplicate_ignored');

    const discussions = await historyRepo.getAllDiscussions('comm_alpha');
    expect(discussions.length).toBe(1);
  });

  it('Scenario 9: Replay of permanently_failed without override is rejected', async () => {
    const deadLetterEvent = await ingestionRepo.claimEvent('telegram', '-100111', 'dead_1');
    await ingestionRepo.markPermanentlyFailed(deadLetterEvent.record.id, 'Fatal poison pill');

    const replayResult = await recoveryService.replayEvent(
      deadLetterEvent.record.id,
      async () => ({
        provider: 'telegram',
        externalEventId: 'dead_1',
        externalCommunityId: '-100111',
        externalMessageId: 'msg_dead_1',
        eventType: 'message_created',
        author: { externalUserId: 'u1', displayName: 'User' },
        content: 'Dead content',
        timestamp: new Date(),
      })
    );

    expect(replayResult.success).toBe(false);
    expect(replayResult.outcome).toBe('permanently_failed');
    expect(replayResult.error).toContain('Explicit override');
  });

  it('Scenario 10: Replay of permanently_failed with explicit override succeeds and restores processing', async () => {
    const deadLetterEvent = await ingestionRepo.claimEvent('telegram', '-100111', 'dead_2');
    await ingestionRepo.markPermanentlyFailed(deadLetterEvent.record.id, 'Fatal schema glitch now fixed');

    const replayResult = await recoveryService.replayEvent(
      deadLetterEvent.record.id,
      async () => ({
        provider: 'telegram',
        externalEventId: 'dead_2',
        externalCommunityId: '-100111',
        externalMessageId: 'msg_dead_2',
        eventType: 'message_created',
        author: { externalUserId: 'u1', displayName: 'User' },
        content: 'Fixed content',
        timestamp: new Date(),
      }),
      { allowPermanentlyFailed: true, reason: 'Schema bug patched by engineer' }
    );

    expect(replayResult.success).toBe(true);
    expect(replayResult.outcome).toBe('processed');

    const discussions = await historyRepo.getAllDiscussions('comm_alpha');
    expect(discussions.some((d) => d.title.includes('Fixed content'))).toBe(true);
  });

  it('Scenario 11: Replay of active in-flight processing event within stale timeout is rejected', async () => {
    const inFlight = await ingestionRepo.claimEvent('telegram', '-100111', 'inflight_1', {
      staleTimeoutMs: 30_000,
    });
    expect(inFlight.outcome).toBe('claimed');
    expect(inFlight.record.status).toBe('processing');

    const replayResult = await recoveryService.replayEvent(
      inFlight.record.id,
      async () => ({
        provider: 'telegram',
        externalEventId: 'inflight_1',
        externalCommunityId: '-100111',
        externalMessageId: 'msg_inf_1',
        eventType: 'message_created',
        author: { externalUserId: 'u1', displayName: 'User' },
        content: 'Inflight content',
        timestamp: new Date(),
      })
    );

    expect(replayResult.success).toBe(false);
    expect(replayResult.outcome).toBe('in_flight');
    expect(replayResult.error).toContain('actively in-flight');
  });

  // =========================================================================
  // 4. SECRET SANITIZATION & SECURITY
  // =========================================================================

  it('Scenario 12: TelegramSecretSanitizer strictly redacts bot token, webhook secrets, and url credentials', () => {
    const rawError = `Failed connecting to https://api.telegram.org/bot${BOT_TOKEN}/setWebhook with secret ${WEBHOOK_SECRET} and auth Bearer abc_token_123`;
    const sanitized = TelegramSecretSanitizer.sanitizeString(rawError, [BOT_TOKEN, WEBHOOK_SECRET]);

    expect(sanitized).not.toContain(BOT_TOKEN);
    expect(sanitized).not.toContain(WEBHOOK_SECRET);
    expect(sanitized).toContain('***REDACTED***');
  });

  it('Scenario 13: WebhookService sanitizes last_error_message containing embedded tokens', async () => {
    mockClient.setWebhookInfoResult({
      url: `https://webhook.cohorta.io/api/telegram?token=${BOT_TOKEN}`,
      has_custom_certificate: false,
      pending_update_count: 3,
      last_error_date: 1700000000,
      last_error_message: `Unauthorized access using bot token ${BOT_TOKEN} with secret_token=${WEBHOOK_SECRET}`,
    });

    const webhookService = new TelegramWebhookService(mockClient, config);
    const info = await webhookService.getWebhookInfo();

    expect(info.url).not.toContain(BOT_TOKEN);
    expect(info.lastErrorMessage).not.toContain(BOT_TOKEN);
    expect(info.lastErrorMessage).not.toContain(WEBHOOK_SECRET);
    expect(info.lastErrorMessage).toContain('***REDACTED***');
  });

  it('Scenario 14: Stored replay payload does not leak transport headers or secrets', () => {
    const mockUpdate = {
      update_id: 5001,
      message: {
        message_id: 10,
        date: 1700000000,
        chat: { id: -100111, type: 'supergroup' as const, title: 'Community Alpha' },
        from: { id: 99, first_name: 'Alice', is_bot: false },
        text: 'Clean discussion post content',
      },
    };

    const payload = TelegramSecretSanitizer.extractReplaySafePayload(mockUpdate, config);

    expect(payload.update_id).toBe(5001);
    expect((payload.message as any).text).toBe('Clean discussion post content');
    expect(JSON.stringify(payload)).not.toContain(BOT_TOKEN);
    expect(JSON.stringify(payload)).not.toContain(WEBHOOK_SECRET);
  });

  // =========================================================================
  // 5. OBSERVABILITY HEALTH SEMANTICS
  // =========================================================================

  it('Scenario 15: Observability health transitions deterministically (healthy -> degraded -> unhealthy -> healthy)', async () => {
    // Initial state: healthy
    const report1 = await observabilityService.getHealthReport();
    expect(report1.status).toBe('healthy');

    // Introduce 1 transient failure -> degraded
    const failClaim = await ingestionRepo.claimEvent('telegram', '-100111', 'transient_fail_1');
    await ingestionRepo.updateStatus(failClaim.record.id, 'failed', 'Temporary 500 error from downstream');

    const report2 = await observabilityService.getHealthReport();
    expect(report2.status).toBe('degraded');

    // Introduce 1 permanently failed event -> unhealthy
    const deadClaim = await ingestionRepo.claimEvent('telegram', '-100111', 'perm_fail_1');
    await ingestionRepo.markPermanentlyFailed(deadClaim.record.id, 'Exhausted retry budget');

    const report3 = await observabilityService.getHealthReport();
    expect(report3.status).toBe('unhealthy');
    expect(report3.recentDeadLetterEvents.length).toBe(1);
    expect(report3.permanentlyFailedCount).toBe(1);

    // Resolve both -> healthy
    await ingestionRepo.updateStatus(failClaim.record.id, 'processed');
    await ingestionRepo.updateStatus(deadClaim.record.id, 'processed');

    const report4 = await observabilityService.getHealthReport();
    expect(report4.status).toBe('healthy');
  });

  // =========================================================================
  // 6. SERVER RESTART / CRASH RECOVERY IDEMPOTENCY
  // =========================================================================

  it('Scenario 16: Crash between ingestion and checkpoint persistence -> re-poll deduplicated with zero duplication', async () => {
    // 1. First run: Update 201 processed in DB, but crash occurs before checkpoint saved (checkpoint stays 0)
    mockClient.seedUpdates([
      {
        update_id: 201,
        message: {
          message_id: 50,
          date: 1700000050,
          chat: { id: -100111, type: 'supergroup' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Crash recovery message',
        },
      },
    ]);

    // Simulate direct ingestion
    const event = TelegramSourceAdapter.adaptUpdate(mockClient.getDeliveredUpdates()[0] || {
      update_id: 201,
      message: {
        message_id: 50,
        date: 1700000050,
        chat: { id: -100111, type: 'supergroup' },
        from: { id: 10, first_name: 'Alice', is_bot: false },
        text: 'Crash recovery message',
      },
    }, config)!;

    const firstIngest = await ingestionService.ingestEvent(event);
    expect(firstIngest.outcome).toBe('processed');

    // Verify checkpoint was NOT saved
    const cpBefore = await checkpointRepo.getCheckpoint('bot_123456789');
    expect(cpBefore).toBeNull();

    // 2. Server restarts and runs reconciliation starting from offset 0
    mockClient.seedUpdates([
      {
        update_id: 201,
        message: {
          message_id: 50,
          date: 1700000050,
          chat: { id: -100111, type: 'supergroup' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Crash recovery message',
        },
      },
    ]);

    const reconResult = await reconciliationService.reconcileUpdates();

    expect(reconResult.updatesFetched).toBe(1);
    expect(reconResult.duplicatesSkipped).toBe(1);
    expect(reconResult.eventsIngested).toBe(0);
    expect(reconResult.checkpointSaved).toBe(201);

    // Ensure discussion is not duplicated
    const discussions = await historyRepo.getAllDiscussions('comm_alpha');
    expect(discussions.length).toBe(1);

    const cpAfter = await checkpointRepo.getCheckpoint('bot_123456789');
    expect(cpAfter?.lastContiguousUpdateId).toBe(201);
  });
});
