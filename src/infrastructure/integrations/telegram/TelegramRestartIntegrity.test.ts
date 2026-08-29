import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DurableFileStorage } from '../../db/durable/DurableFileStorage';
import { DurableFileIngestionEventRepository } from '../../db/durable/DurableFileIngestionEventRepository';
import { DurableFileCommunityHistoryRepository } from '../../db/durable/DurableFileCommunityHistoryRepository';
import { DurableFileCommunityIntegrationRepository } from '../../db/durable/DurableFileCommunityIntegrationRepository';
import { DurableFileTelegramBotCheckpointRepository } from './DurableFileTelegramBotCheckpointRepository';
import { CommunityEventIngestionService } from '../../../core/services/CommunityEventIngestionService';
import { TelegramUpdateReconciliationService } from './TelegramUpdateReconciliationService';
import { TelegramWebhookHandler } from './TelegramWebhookHandler';
import { TelegramSecretSanitizer } from './TelegramSecretSanitizer';
import { SecretSanitizer } from '../../../core/security/SecretSanitizer';
import { IngestionRecoveryService } from '../../../core/services/IngestionRecoveryService';
import { IngestionObservabilityService } from '../../../core/services/IngestionObservabilityService';
import { TelegramSourceAdapter } from './TelegramSourceAdapter';
import { ITelegramClient, TelegramUpdate } from './ITelegramClient';
import { TelegramConfig } from './TelegramConfig';
import { StaleOwnershipError } from '../../../core/repositories/IIngestionEventRepository';
import { ExternalCommunitySourceEvent } from '../../../core/source/ExternalCommunitySourceEvent';

describe('Phase 13.6.1 — Adversarial Production Verification & Restart Integrity', () => {
  let tempDir: string;
  let ingestPath: string;
  let historyPath: string;
  let integrationPath: string;
  let checkpointPath: string;

  const validChatId = -1001234567890;
  const targetCommunityId = 'comm_production_cohort';
  const botToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567890';
  const webhookSecret = 'prod_super_secret_webhook_token_999';

  const defaultTelegramConfig: TelegramConfig = {
    botToken,
    webhookSecret,
    authorizedChatIds: new Set([String(validChatId), '-100222333', '-100444555', '-100777888']),
  };

  const defaultMockWebhookInfo = {
    url: '',
    has_custom_certificate: false,
    pending_update_count: 0,
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telegram-adversarial-'));
    ingestPath = path.join(tempDir, 'ingestion_events.json');
    historyPath = path.join(tempDir, 'community_history.json');
    integrationPath = path.join(tempDir, 'community_integrations.json');
    checkpointPath = path.join(tempDir, 'telegram_checkpoints.json');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error in temp dir
    }
  });

  // Helper to construct fresh repositories pointing to the exact same filesystem directory
  function createDurableRepositories() {
    const ingestionRepo = new DurableFileIngestionEventRepository(ingestPath);
    const historyRepo = new DurableFileCommunityHistoryRepository(historyPath, false);
    const integrationRepo = new DurableFileCommunityIntegrationRepository(integrationPath, [
      {
        id: 'int_tg_main',
        communityId: targetCommunityId,
        providerType: 'telegram',
        providerCommunityId: String(validChatId),
        isActive: true,
        metadata: {},
        createdAt: new Date(),
      },
      {
        id: 'int_tg_alpha',
        communityId: 'comm_alpha',
        providerType: 'telegram',
        providerCommunityId: '-100222333',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
      },
      {
        id: 'int_tg_beta',
        communityId: 'comm_beta',
        providerType: 'telegram',
        providerCommunityId: '-100444555',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
      },
      {
        id: 'int_tg_gamma',
        communityId: 'comm_gamma',
        providerType: 'telegram',
        providerCommunityId: '-100777888',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
      },
    ]);
    const checkpointRepo = new DurableFileTelegramBotCheckpointRepository(checkpointPath);

    return { ingestionRepo, historyRepo, integrationRepo, checkpointRepo };
  }

  // =========================================================================
  // 1. Real Persistence Restart Verification
  // =========================================================================
  describe('1. Real Persistence Restart Verification', () => {
    it('persists state to disk, clears in-memory instances, and completely recovers state in fresh instances', async () => {
      // --- Phase A: Initial Process Life ---
      let repos: ReturnType<typeof createDurableRepositories> | null = createDurableRepositories();
      let ingestionService: CommunityEventIngestionService | null = new CommunityEventIngestionService(
        repos.ingestionRepo,
        repos.historyRepo,
        repos.integrationRepo
      );

      const update1: TelegramUpdate = {
        update_id: 501,
        message: {
          message_id: 1001,
          date: 1700000000,
          chat: { id: validChatId, type: 'supergroup', title: 'Main Supergroup' },
          from: { id: 101, first_name: 'Alice', is_bot: false },
          text: 'Root topic question: How do we handle durable restarts in production?',
        },
      };

      const sourceEvent1 = TelegramSourceAdapter.adaptUpdate(update1, defaultTelegramConfig)!;
      const res1 = await ingestionService.ingestEvent(sourceEvent1);
      expect(res1.outcome).toBe('processed');

      // Persist checkpoint
      await repos.checkpointRepo.saveCheckpoint('bot_123456789', 501);

      // Record a failed/retry event
      const failClaim = await repos.ingestionRepo.claimEvent('telegram', String(validChatId), 'upd_failed_item');
      await repos.ingestionRepo.updateStatus(failClaim.record.id, 'permanently_failed', 'Simulated max retries reached');

      // Verify file existence on disk
      expect(fs.existsSync(ingestPath)).toBe(true);
      expect(fs.existsSync(historyPath)).toBe(true);
      expect(fs.existsSync(checkpointPath)).toBe(true);

      // --- Phase B: Destroy all in-memory references ---
      repos = null;
      ingestionService = null;

      // --- Phase C: Reconstruct fresh instances from the same file paths ---
      const freshRepos = createDurableRepositories();
      const freshIngestionService = new CommunityEventIngestionService(
        freshRepos.ingestionRepo,
        freshRepos.historyRepo,
        freshRepos.integrationRepo
      );

      // 1. Verify recovered discussion history
      const discussions = await freshRepos.historyRepo.getAllDiscussions(targetCommunityId);
      expect(discussions).toHaveLength(1);
      expect(discussions[0].content).toContain('How do we handle durable restarts in production?');
      expect(discussions[0].sourceProvenance?.externalMessageId).toBe('1001');
      expect(discussions[0].sourceProvenance?.provider).toBe('telegram');

      // 2. Verify recovered ingestion event
      const eventKey = `telegram:${validChatId}:501`;
      const ingestRecord = await freshRepos.ingestionRepo.findByEventKey(eventKey);
      expect(ingestRecord).not.toBeNull();
      expect(ingestRecord?.status).toBe('processed');
      expect(ingestRecord?.retryCount).toBe(1);

      // 3. Verify recovered dead-letter event
      const deadLetterKey = `telegram:${validChatId}:upd_failed_item`;
      const deadLetter = await freshRepos.ingestionRepo.findByEventKey(deadLetterKey);
      expect(deadLetter?.status).toBe('permanently_failed');
      expect(deadLetter?.error).toContain('Simulated max retries');

      // 4. Verify recovered checkpoint
      const cp = await freshRepos.checkpointRepo.getCheckpoint('bot_123456789');
      expect(cp).not.toBeNull();
      expect(cp?.lastContiguousUpdateId).toBe(501);

      // 5. Verify ongoing processing continues seamlessly
      const update2: TelegramUpdate = {
        update_id: 502,
        message: {
          message_id: 1002,
          date: 1700000060,
          chat: { id: validChatId, type: 'supergroup', title: 'Main Supergroup' },
          from: { id: 102, first_name: 'Bob', is_bot: false },
          text: 'Here is a reply with advice.',
          reply_to_message: {
            message_id: 1001,
            date: 1700000000,
            chat: { id: validChatId, type: 'supergroup', title: 'Main Supergroup' },
            from: { id: 101, first_name: 'Alice', is_bot: false },
            text: 'Root topic question: How do we handle durable restarts in production?',
          },
        },
      };

      const sourceEvent2 = TelegramSourceAdapter.adaptUpdate(update2, defaultTelegramConfig)!;
      const res2 = await freshIngestionService.ingestEvent(sourceEvent2);
      expect(res2.outcome).toBe('processed');

      const updatedDiscussions = await freshRepos.historyRepo.getAllDiscussions(targetCommunityId);
      expect(updatedDiscussions).toHaveLength(1);
      expect(updatedDiscussions[0].replies).toHaveLength(1);
      expect(updatedDiscussions[0].replies[0].content).toBe('Here is a reply with advice.');
    });
  });

  // =========================================================================
  // 2. Genuine Crash-Window Simulations (Deterministic Injected Failures)
  // =========================================================================
  describe('2. Genuine Crash-Window Simulations', () => {
    it('Crash A: process terminates after claim before history mutation -> fresh process retries -> exactly 1 history record and processed', async () => {
      // Step 1: Worker 1 claims event, but process crashes before mutating history
      const repos1 = createDurableRepositories();
      const claim = await repos1.ingestionRepo.claimEvent('telegram', String(validChatId), 'crash_a_upd');
      expect(claim.outcome).toBe('claimed');
      expect(claim.record.status).toBe('processing');

      // (Process 1 abruptly terminates without writing to history or updating status)

      // Step 2: Fresh Process 2 starts after stale timeout
      const repos2 = createDurableRepositories();
      const service2 = new CommunityEventIngestionService(
        repos2.ingestionRepo,
        repos2.historyRepo,
        repos2.integrationRepo,
        { staleTimeoutMs: 10 } // short timeout for testing
      );

      await new Promise((r) => setTimeout(r, 20));

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: String(validChatId),
        externalEventId: 'crash_a_upd',
        externalMessageId: 'crash_a_msg',
        author: { externalUserId: '101', displayName: 'Alice' },
        content: 'Post-crash recovered message',
        timestamp: new Date(),
        eventType: 'message_created',
      };

      const result = await service2.ingestEvent(event);
      expect(result.outcome).toBe('processed');

      // Verify exactly one discussion was created
      const allDiscussions = await repos2.historyRepo.getAllDiscussions(targetCommunityId);
      expect(allDiscussions).toHaveLength(1);
      expect(allDiscussions[0].content).toBe('Post-crash recovered message');

      const record = await repos2.ingestionRepo.findByEventKey(`telegram:${validChatId}:crash_a_upd`);
      expect(record?.status).toBe('processed');
    });

    it('Crash B: history mutation succeeds but process crashes before status marked processed -> fresh process retries -> detects existing history without duplication', async () => {
      // Step 1: Worker 1 claims event and writes to history, but crashes before updateStatus('processed')
      const repos1 = createDurableRepositories();
      const claim = await repos1.ingestionRepo.claimEvent('telegram', String(validChatId), 'crash_b_upd');

      const initialDiscussion = {
        id: `disc_telegram__1001234567890_crash_b_msg`,
        communityId: targetCommunityId,
        roadmapItemId: 'general',
        topicTitle: 'General',
        author: { id: 'u_101', name: 'Alice', avatarUrl: '', role: 'member' as const },
        title: 'Crash B Discussion',
        content: 'Crash B Discussion Content',
        type: 'discussion' as const,
        signalQuality: 'high_signal' as const,
        createdAt: new Date(),
        isDeleted: false,
        sourceProvenance: {
          provider: 'telegram' as const,
          externalCommunityId: String(validChatId),
          externalMessageId: 'crash_b_msg',
          originalTimestamp: new Date(),
          ingestedAt: new Date(),
          rawEventIds: ['crash_b_upd'],
        },
        resources: [],
        replies: [],
        replyCount: 0,
      };

      await repos1.historyRepo.saveDiscussion(initialDiscussion);
      // Process 1 crashes right here! Status remains 'processing'.

      // Step 2: Fresh Process 2 boots up and processes retry
      await new Promise((r) => setTimeout(r, 20));
      const repos2 = createDurableRepositories();
      const service2 = new CommunityEventIngestionService(
        repos2.ingestionRepo,
        repos2.historyRepo,
        repos2.integrationRepo,
        { staleTimeoutMs: 10 }
      );

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: String(validChatId),
        externalEventId: 'crash_b_upd',
        externalMessageId: 'crash_b_msg',
        author: { externalUserId: '101', displayName: 'Alice' },
        content: 'Crash B Discussion Content',
        timestamp: new Date(),
        eventType: 'message_created',
      };

      const res = await service2.ingestEvent(event);
      expect(res.outcome).toBe('processed');

      // Verify zero duplicate discussions
      const allDiscussions = await repos2.historyRepo.getAllDiscussions(targetCommunityId);
      expect(allDiscussions).toHaveLength(1);
      expect(allDiscussions[0].id).toBe(initialDiscussion.id);

      const finalRecord = await repos2.ingestionRepo.findByEventKey(`telegram:${validChatId}:crash_b_upd`);
      expect(finalRecord?.status).toBe('processed');
    });

    it('Crash C: history and processed status succeed, but process crashes before checkpoint write -> fresh reconciliation detects duplicate and advances checkpoint', async () => {
      // Step 1: Webhook or worker processed update 301 successfully, but died before checkpoint save
      const repos1 = createDurableRepositories();
      const service1 = new CommunityEventIngestionService(
        repos1.ingestionRepo,
        repos1.historyRepo,
        repos1.integrationRepo
      );

      const update: TelegramUpdate = {
        update_id: 301,
        message: {
          message_id: 701,
          date: 1700000000,
          chat: { id: validChatId, type: 'supergroup', title: 'Cohort Group' },
          from: { id: 101, first_name: 'Alice', is_bot: false },
          text: 'Crash C Message',
        },
      };

      const sourceEvent = TelegramSourceAdapter.adaptUpdate(update, defaultTelegramConfig)!;
      const res = await service1.ingestEvent(sourceEvent);
      expect(res.outcome).toBe('processed');

      // Checkpoint is still 0 (not written)
      const cpBefore = await repos1.checkpointRepo.getCheckpoint('bot_123456789');
      expect(cpBefore).toBeNull();

      // Step 2: Fresh reconciliation process starts, receives update 301 again
      const repos2 = createDurableRepositories();
      const service2 = new CommunityEventIngestionService(
        repos2.ingestionRepo,
        repos2.historyRepo,
        repos2.integrationRepo
      );

      const mockClient: ITelegramClient = {
        fetchUpdates: async () => [update],
        getMe: async () => ({ id: 123, is_bot: true, first_name: 'TestBot' }),
        getWebhookInfo: async () => defaultMockWebhookInfo,
        setWebhook: async () => true,
        deleteWebhook: async () => true,
      };

      const reconciliation = new TelegramUpdateReconciliationService(
        mockClient,
        defaultTelegramConfig,
        service2,
        repos2.checkpointRepo
      );

      const reconResult = await reconciliation.reconcileUpdates({ botId: 'bot_123456789' });
      expect(reconResult.duplicatesSkipped).toBe(1);
      expect(reconResult.checkpointSaved).toBe(301);

      // Verify no duplicate history created
      const discussions = await repos2.historyRepo.getAllDiscussions(targetCommunityId);
      expect(discussions).toHaveLength(1);

      // Checkpoint is now safely persisted
      const cpAfter = await repos2.checkpointRepo.getCheckpoint('bot_123456789');
      expect(cpAfter?.lastContiguousUpdateId).toBe(301);
    });

    it('Crash D: worker A becomes stale -> worker B recovers with new ownerToken -> worker A cannot commit status', async () => {
      const repos = createDurableRepositories();

      // Worker A claims event
      const claimA = await repos.ingestionRepo.claimEvent('telegram', String(validChatId), 'event_crash_d');
      const tokenA = claimA.record.ownerToken!;
      expect(claimA.record.retryCount).toBe(1);

      // Simulate lease expiration
      await new Promise((r) => setTimeout(r, 25));

      // Worker B detects stale lease and claims event
      const claimB = await repos.ingestionRepo.claimEvent('telegram', String(validChatId), 'event_crash_d', {
        staleTimeoutMs: 15,
      });
      expect(claimB.outcome).toBe('recovered_stale');
      const tokenB = claimB.record.ownerToken!;
      expect(tokenB).not.toBe(tokenA);
      expect(claimB.record.retryCount).toBe(2);

      // Worker B commits success
      await repos.ingestionRepo.updateStatus(claimB.record.id, 'processed', undefined, new Date(), {
        expectedOwnerToken: tokenB,
      });

      // Now delayed Worker A tries to commit using stale tokenA
      await expect(
        repos.ingestionRepo.updateStatus(claimA.record.id, 'processed', undefined, new Date(), {
          expectedOwnerToken: tokenA,
        })
      ).rejects.toThrow(StaleOwnershipError);

      // Final status remains authoritative under Worker B
      const finalEvent = await repos.ingestionRepo.findByEventKey(`telegram:${validChatId}:event_crash_d`);
      expect(finalEvent?.status).toBe('processed');
      expect(finalEvent?.ownerToken).toBe(tokenB);
      expect(finalEvent?.retryCount).toBe(2);
    });
  });

  // =========================================================================
  // 3. Old Worker Fencing After Actual Reinstantiation
  // =========================================================================
  describe('3. Old Worker Fencing After Actual Reinstantiation', () => {
    it('strictly fences old worker across separate repository instances', async () => {
      // Instance 1: Worker A claims
      const repoInstanceA = new DurableFileIngestionEventRepository(ingestPath);
      const claimA = await repoInstanceA.claimEvent('telegram', String(validChatId), 'fenced_item');
      const tokenA = claimA.record.ownerToken!;

      await new Promise((r) => setTimeout(r, 20));

      // Instance 2: Worker B recovers and finishes
      const repoInstanceB = new DurableFileIngestionEventRepository(ingestPath);
      const claimB = await repoInstanceB.claimEvent('telegram', String(validChatId), 'fenced_item', {
        staleTimeoutMs: 10,
      });
      const tokenB = claimB.record.ownerToken!;

      await repoInstanceB.updateStatus(claimB.record.id, 'processed', undefined, new Date(), {
        expectedOwnerToken: tokenB,
      });

      // Worker A attempts multiple illegal state mutations
      await expect(
        repoInstanceA.updateStatus(claimA.record.id, 'failed', 'Worker A error', undefined, {
          expectedOwnerToken: tokenA,
        })
      ).rejects.toThrow(StaleOwnershipError);

      await expect(
        repoInstanceA.updateStatus(claimA.record.id, 'processing', undefined, undefined, {
          expectedOwnerToken: tokenA,
        })
      ).rejects.toThrow(StaleOwnershipError);

      // Verify authoritative state in fresh 3rd instance
      const repoInstanceC = new DurableFileIngestionEventRepository(ingestPath);
      const authoritative = await repoInstanceC.findByEventKey(`telegram:${validChatId}:fenced_item`);
      expect(authoritative?.status).toBe('processed');
      expect(authoritative?.ownerToken).toBe(tokenB);
    });
  });

  // =========================================================================
  // 4. Concurrent Same-Event Stress Test (100 Concurrent Calls)
  // =========================================================================
  describe('4. Concurrent Same-Event Stress Test (100 Concurrent Ingestion Calls)', () => {
    it('executes 100 concurrent ingestion calls on the same event and guarantees exactly 1 history mutation', async () => {
      const repos = createDurableRepositories();
      const service = new CommunityEventIngestionService(
        repos.ingestionRepo,
        repos.historyRepo,
        repos.integrationRepo
      );

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: String(validChatId),
        externalEventId: 'concurrent_same_event_100',
        externalMessageId: 'msg_concurrent_100',
        author: { externalUserId: '99', displayName: 'ConcurrencyTester' },
        content: 'Deterministic thread-safe payload',
        timestamp: new Date(1700000000000),
        eventType: 'message_created',
      };

      // Launch 100 concurrent ingestion requests
      const promises = Array.from({ length: 100 }, () => service.ingestEvent(event));
      const results = await Promise.all(promises);

      const processedResults = results.filter((r) => r.outcome === 'processed');
      const duplicateResults = results.filter((r) => r.outcome === 'duplicate_ignored');

      expect(processedResults).toHaveLength(1);
      expect(duplicateResults).toHaveLength(99);

      // Verify durable history contains exactly 1 discussion
      const discussions = await repos.historyRepo.getAllDiscussions(targetCommunityId);
      expect(discussions).toHaveLength(1);
      expect(discussions[0].content).toBe('Deterministic thread-safe payload');

      // Verify durable ingestion repository has exactly 1 record
      const allIngestRecords = await repos.ingestionRepo.getAllEvents();
      const matchingEvents = allIngestRecords.filter((e) => e.externalEventId === 'concurrent_same_event_100');
      expect(matchingEvents).toHaveLength(1);
      expect(matchingEvents[0].status).toBe('processed');
    });
  });

  // =========================================================================
  // 5. Same-Community Concurrent Mutation Test
  // =========================================================================
  describe('5. Same-Community Concurrent Mutation Test', () => {
    it('processes concurrent distinct messages and replies without lost writes or cross-discussion corruption', async () => {
      const repos = createDurableRepositories();
      const service = new CommunityEventIngestionService(
        repos.ingestionRepo,
        repos.historyRepo,
        repos.integrationRepo
      );

      // First create parent discussions A and B
      const msgA: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: String(validChatId),
        externalEventId: 'evt_a',
        externalMessageId: 'msg_a',
        author: { externalUserId: '1', displayName: 'User1' },
        content: 'Root Discussion A',
        timestamp: new Date(1700000001000),
        eventType: 'message_created',
      };

      const msgB: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: String(validChatId),
        externalEventId: 'evt_b',
        externalMessageId: 'msg_b',
        author: { externalUserId: '2', displayName: 'User2' },
        content: 'Root Discussion B',
        timestamp: new Date(1700000002000),
        eventType: 'message_created',
      };

      await service.ingestEvent(msgA);
      await service.ingestEvent(msgB);

      // Concurrently submit: Message C, Reply to A, Reply to B, Message D
      const concurrentBatch: ExternalCommunitySourceEvent[] = [
        {
          provider: 'telegram',
          externalCommunityId: String(validChatId),
          externalEventId: 'evt_c',
          externalMessageId: 'msg_c',
          author: { externalUserId: '3', displayName: 'User3' },
          content: 'Root Discussion C with resource https://example.com/c',
          resources: [{ url: 'https://example.com/c', title: 'Resource C', type: 'link' }],
          timestamp: new Date(1700000003000),
          eventType: 'message_created',
        },
        {
          provider: 'telegram',
          externalCommunityId: String(validChatId),
          externalEventId: 'evt_rep_a',
          externalMessageId: 'rep_a',
          externalParentMessageId: 'msg_a',
          author: { externalUserId: '4', displayName: 'User4' },
          content: 'Answer for Discussion A',
          timestamp: new Date(1700000004000),
          eventType: 'reply_created',
        },
        {
          provider: 'telegram',
          externalCommunityId: String(validChatId),
          externalEventId: 'evt_rep_b',
          externalMessageId: 'rep_b',
          externalParentMessageId: 'msg_b',
          author: { externalUserId: '5', displayName: 'User5' },
          content: 'Feedback for Discussion B',
          timestamp: new Date(1700000005000),
          eventType: 'reply_created',
        },
        {
          provider: 'telegram',
          externalCommunityId: String(validChatId),
          externalEventId: 'evt_d',
          externalMessageId: 'msg_d',
          author: { externalUserId: '6', displayName: 'User6' },
          content: 'Root Discussion D',
          timestamp: new Date(1700000006000),
          eventType: 'message_created',
        },
      ];

      const results = await Promise.all(concurrentBatch.map((evt) => service.ingestEvent(evt)));
      for (const res of results) {
        expect(res.outcome).toBe('processed');
      }

      // Verify all discussions and replies
      const allDiscussions = await repos.historyRepo.getAllDiscussions(targetCommunityId);
      expect(allDiscussions).toHaveLength(4); // A, B, C, D

      const discA = allDiscussions.find((d) => d.sourceProvenance?.externalMessageId === 'msg_a')!;
      expect(discA.replies).toHaveLength(1);
      expect(discA.replies[0].content).toBe('Answer for Discussion A');

      const discB = allDiscussions.find((d) => d.sourceProvenance?.externalMessageId === 'msg_b')!;
      expect(discB.replies).toHaveLength(1);
      expect(discB.replies[0].content).toBe('Feedback for Discussion B');

      const discC = allDiscussions.find((d) => d.sourceProvenance?.externalMessageId === 'msg_c')!;
      expect(discC.resources).toHaveLength(1);
      expect(discC.resources[0].url).toBe('https://example.com/c');

      const discD = allDiscussions.find((d) => d.sourceProvenance?.externalMessageId === 'msg_d')!;
      expect(discD.content).toBe('Root Discussion D');
    });
  });

  // =========================================================================
  // 6. Multi-Community Stress Test (100 Events Across Communities)
  // =========================================================================
  describe('6. Multi-Community Stress Test', () => {
    it('processes 100 concurrent events across 3 communities with overlapping message IDs without tenant leakage', async () => {
      const repos = createDurableRepositories();
      const service = new CommunityEventIngestionService(
        repos.ingestionRepo,
        repos.historyRepo,
        repos.integrationRepo
      );

      const communities = [
        { communityId: 'comm_alpha', chatId: '-100222333' },
        { communityId: 'comm_beta', chatId: '-100444555' },
        { communityId: 'comm_gamma', chatId: '-100777888' },
      ];

      // Generate 90 root events (30 per community) + 30 replies with overlapping message IDs
      const events: ExternalCommunitySourceEvent[] = [];

      for (let i = 1; i <= 30; i++) {
        for (const comm of communities) {
          // Root event with distinct author per message to test independent discussion creation
          events.push({
            provider: 'telegram',
            externalCommunityId: comm.chatId,
            externalEventId: `evt_${comm.communityId}_${i}`,
            externalMessageId: `msg_${i}`,
            author: { externalUserId: `user_${comm.communityId}_${i}`, displayName: `User_${comm.communityId}_${i}` },
            content: `Message ${i} for ${comm.communityId}`,
            timestamp: new Date(1700000000000 + i * 1000),
            eventType: 'message_created',
          });
        }
      }

      // Shuffle events to maximize concurrency interweaving
      const shuffled = [...events].sort(() => Math.random() - 0.5);
      const results = await Promise.all(shuffled.map((e) => service.ingestEvent(e)));

      for (const res of results) {
        expect(res.outcome).toBe('processed');
      }

      // Add replies concurrently
      const replyEvents: ExternalCommunitySourceEvent[] = [];
      for (let i = 1; i <= 10; i++) {
        for (const comm of communities) {
          replyEvents.push({
            provider: 'telegram',
            externalCommunityId: comm.chatId,
            externalEventId: `reply_${comm.communityId}_${i}`,
            externalMessageId: `rep_msg_${i}`,
            externalParentMessageId: `msg_${i}`,
            author: { externalUserId: 'reply_author', displayName: 'Replier' },
            content: `Reply to message ${i} strictly within ${comm.communityId}`,
            timestamp: new Date(1700000100000 + i * 1000),
            eventType: 'reply_created',
          });
        }
      }

      const replyResults = await Promise.all(replyEvents.map((e) => service.ingestEvent(e)));
      for (const res of replyResults) {
        expect(res.outcome).toBe('processed');
      }

      // Verify strict isolation
      for (const comm of communities) {
        const discs = await repos.historyRepo.getAllDiscussions(comm.communityId);
        expect(discs).toHaveLength(30);

        for (const disc of discs) {
          expect(disc.communityId).toBe(comm.communityId);
          expect(disc.content).toContain(comm.communityId);
          expect(disc.sourceProvenance?.externalCommunityId).toBe(comm.chatId);

          // If it has replies, verify reply tenant isolation
          if (disc.replies.length > 0) {
            expect(disc.replies).toHaveLength(1);
            expect(disc.replies[0].content).toContain(comm.communityId);
            expect(disc.replies[0].sourceProvenance?.externalCommunityId).toBe(comm.chatId);
          }
        }
      }
    });
  });

  // =========================================================================
  // 7. Reconciliation Failure with Real Ingestion Service
  // =========================================================================
  describe('7. Reconciliation Failure with Real Ingestion Service', () => {
    it('halts checkpoint progression on ingestion failure and contiguously resumes on resolution', async () => {
      const repos = createDurableRepositories();
      const service = new CommunityEventIngestionService(
        repos.ingestionRepo,
        repos.historyRepo,
        repos.integrationRepo
      );

      // Create 3 updates: 101 (valid), 102 (from disabled/unmapped integration -> fails), 103 (valid)
      const update101: TelegramUpdate = {
        update_id: 101,
        message: {
          message_id: 2001,
          date: 1700000001,
          chat: { id: validChatId, type: 'supergroup', title: 'Main' },
          from: { id: 10, first_name: 'Alice', is_bot: false },
          text: 'Update 101',
        },
      };

      // 102 is from an unmapped/unauthorized chat that adapter rejects or service fails
      const update102: TelegramUpdate = {
        update_id: 102,
        message: {
          message_id: 2002,
          date: 1700000002,
          chat: { id: -1009999999, type: 'supergroup', title: 'Unauthorized Chat' },
          from: { id: 20, first_name: 'Mallory', is_bot: false },
          text: 'Update 102 - unmapped chat',
        },
      };

      const update103: TelegramUpdate = {
        update_id: 103,
        message: {
          message_id: 2003,
          date: 1700000003,
          chat: { id: validChatId, type: 'supergroup', title: 'Main' },
          from: { id: 30, first_name: 'Charlie', is_bot: false },
          text: 'Update 103',
        },
      };

      // Note: If update102 is filtered by adapter (unauthorized chat), adapter returns null and reconciliation considers it safe to drop.
      // To test an actual domain/infrastructure failure, let's configure an active integration for -100222333, but then disable it.
      await repos.integrationRepo.setIntegrationActive('telegram', '-100222333', false);

      const failingUpdate102: TelegramUpdate = {
        update_id: 102,
        message: {
          message_id: 2002,
          date: 1700000002,
          chat: { id: -100222333, type: 'supergroup', title: 'Disabled Integration Chat' },
          from: { id: 20, first_name: 'Bob', is_bot: false },
          text: 'Update 102 from disabled integration',
        },
      };

      const mockClient: ITelegramClient = {
        fetchUpdates: async (opts) => {
          const offset = opts?.offset || 0;
          const all = [update101, failingUpdate102, update103];
          return all.filter((u) => u.update_id >= offset);
        },
        getMe: async () => ({ id: 123, is_bot: true, first_name: 'TestBot' }),
        getWebhookInfo: async () => defaultMockWebhookInfo,
        setWebhook: async () => true,
        deleteWebhook: async () => true,
      };

      const reconciliation = new TelegramUpdateReconciliationService(
        mockClient,
        defaultTelegramConfig,
        service,
        repos.checkpointRepo
      );

      // First run: 101 succeeds, 102 fails (disabled integration), 103 succeeds.
      // Contiguous chain is broken by 102, so checkpoint halts at 101.
      const result1 = await reconciliation.reconcileUpdates({ botId: 'bot_test' });
      expect(result1.eventsIngested).toBe(2);
      expect(result1.failures).toBe(1);
      expect(result1.checkpointSaved).toBe(101);

      const cp1 = await repos.checkpointRepo.getCheckpoint('bot_test');
      expect(cp1?.lastContiguousUpdateId).toBe(101);

      // Re-enable integration for -100222333
      await repos.integrationRepo.setIntegrationActive('telegram', '-100222333', true);

      // Second run: resumes from offset 102 (101 + 1).
      // 102 now succeeds, 103 is duplicate_ignored, checkpoint advances to 103 contiguously.
      const result2 = await reconciliation.reconcileUpdates({ botId: 'bot_test' });
      expect(result2.failures).toBe(0);
      expect(result2.eventsIngested).toBe(1);
      expect(result2.duplicatesSkipped).toBe(1);
      expect(result2.checkpointSaved).toBe(103);

      const cp2 = await repos.checkpointRepo.getCheckpoint('bot_test');
      expect(cp2?.lastContiguousUpdateId).toBe(103);
    });
  });

  // =========================================================================
  // 8. Gap Recovery Verification
  // =========================================================================
  describe('8. Gap Recovery Verification', () => {
    it('halts checkpoint progression on missing intermediate update IDs and resumes when gaps are filled', async () => {
      const repos = createDurableRepositories();
      const service = new CommunityEventIngestionService(
        repos.ingestionRepo,
        repos.historyRepo,
        repos.integrationRepo
      );

      let availableUpdates: TelegramUpdate[] = [
        {
          update_id: 101,
          message: {
            message_id: 1,
            date: 1700000001,
            chat: { id: validChatId, type: 'supergroup', title: 'Main' },
            from: { id: 1, first_name: 'A', is_bot: false },
            text: 'Msg 101',
          },
        },
        // 102 is missing!
        {
          update_id: 103,
          message: {
            message_id: 3,
            date: 1700000003,
            chat: { id: validChatId, type: 'supergroup', title: 'Main' },
            from: { id: 3, first_name: 'C', is_bot: false },
            text: 'Msg 103',
          },
        },
      ];

      const mockClient: ITelegramClient = {
        fetchUpdates: async (opts) => {
          const offset = opts?.offset || 0;
          return availableUpdates.filter((u) => u.update_id >= offset);
        },
        getMe: async () => ({ id: 123, is_bot: true, first_name: 'TestBot' }),
        getWebhookInfo: async () => defaultMockWebhookInfo,
        setWebhook: async () => true,
        deleteWebhook: async () => true,
      };

      const reconciliation = new TelegramUpdateReconciliationService(
        mockClient,
        defaultTelegramConfig,
        service,
        repos.checkpointRepo
      );

      // Run 1: with gap [101, 103], checkpoint must NOT advance past 101
      const res1 = await reconciliation.reconcileUpdates({ botId: 'bot_gap' });
      expect(res1.checkpointSaved).toBe(101);

      const cp1 = await repos.checkpointRepo.getCheckpoint('bot_gap');
      expect(cp1?.lastContiguousUpdateId).toBe(101);

      // Now 102 becomes available
      availableUpdates = [
        {
          update_id: 102,
          message: {
            message_id: 2,
            date: 1700000002,
            chat: { id: validChatId, type: 'supergroup', title: 'Main' },
            from: { id: 2, first_name: 'B', is_bot: false },
            text: 'Msg 102',
          },
        },
        {
          update_id: 103,
          message: {
            message_id: 3,
            date: 1700000003,
            chat: { id: validChatId, type: 'supergroup', title: 'Main' },
            from: { id: 3, first_name: 'C', is_bot: false },
            text: 'Msg 103',
          },
        },
      ];

      // Run 2: progresses 101 -> 102 -> 103 contiguously
      const res2 = await reconciliation.reconcileUpdates({ botId: 'bot_gap' });
      expect(res2.checkpointSaved).toBe(103);

      const cp2 = await repos.checkpointRepo.getCheckpoint('bot_gap');
      expect(cp2?.lastContiguousUpdateId).toBe(103);
    });

    it('handles large gap [101, 105] without falsely skipping missing sequence', async () => {
      const repos = createDurableRepositories();
      const service = new CommunityEventIngestionService(
        repos.ingestionRepo,
        repos.historyRepo,
        repos.integrationRepo
      );

      const mockClient: ITelegramClient = {
        fetchUpdates: async () => [
          {
            update_id: 101,
            message: {
              message_id: 1,
              date: 1700000001,
              chat: { id: validChatId, type: 'supergroup', title: 'Main' },
              from: { id: 1, first_name: 'A', is_bot: false },
              text: 'Msg 101',
            },
          },
          {
            update_id: 105,
            message: {
              message_id: 5,
              date: 1700000005,
              chat: { id: validChatId, type: 'supergroup', title: 'Main' },
              from: { id: 5, first_name: 'E', is_bot: false },
              text: 'Msg 105',
            },
          },
        ],
        getMe: async () => ({ id: 123, is_bot: true, first_name: 'TestBot' }),
        getWebhookInfo: async () => defaultMockWebhookInfo,
        setWebhook: async () => true,
        deleteWebhook: async () => true,
      };

      const reconciliation = new TelegramUpdateReconciliationService(
        mockClient,
        defaultTelegramConfig,
        service,
        repos.checkpointRepo
      );

      const res = await reconciliation.reconcileUpdates({ botId: 'bot_large_gap' });
      expect(res.checkpointSaved).toBe(101);

      const cp = await repos.checkpointRepo.getCheckpoint('bot_large_gap');
      expect(cp?.lastContiguousUpdateId).toBe(101);
    });
  });

  // =========================================================================
  // 9. Webhook + Reconciliation Race
  // =========================================================================
  describe('9. Webhook + Reconciliation Race', () => {
    it('simultaneously delivers the same update via Webhook and Reconciliation and preserves exact-once semantics', async () => {
      const repos = createDurableRepositories();
      const service = new CommunityEventIngestionService(
        repos.ingestionRepo,
        repos.historyRepo,
        repos.integrationRepo
      );

      const update: TelegramUpdate = {
        update_id: 888,
        message: {
          message_id: 9999,
          date: 1700000000,
          chat: { id: validChatId, type: 'supergroup', title: 'Race Group' },
          from: { id: 50, first_name: 'Racer', is_bot: false },
          text: 'Simultaneous delivery update: https://example.com/race',
          entities: [{ type: 'url', offset: 30, length: 24 }],
        },
      };

      const webhookHandler = new TelegramWebhookHandler(defaultTelegramConfig, service);
      const mockClient: ITelegramClient = {
        fetchUpdates: async () => [update],
        getMe: async () => ({ id: 123, is_bot: true, first_name: 'TestBot' }),
        getWebhookInfo: async () => defaultMockWebhookInfo,
        setWebhook: async () => true,
        deleteWebhook: async () => true,
      };

      const reconciliation = new TelegramUpdateReconciliationService(
        mockClient,
        defaultTelegramConfig,
        service,
        repos.checkpointRepo
      );

      // Execute webhook and reconciliation simultaneously
      const [webhookRes, reconRes] = await Promise.all([
        webhookHandler.processWebhook(
          { 'x-telegram-bot-api-secret-token': webhookSecret },
          update
        ),
        reconciliation.reconcileUpdates({ botId: 'bot_race' }),
      ]);

      expect(webhookRes.statusCode).toBe(200);

      // Exactly one was processed, one was duplicate_ignored
      const isWebhookProcessed = webhookRes.body.action === 'processed';
      const isReconProcessed = reconRes.eventsIngested === 1;

      expect(isWebhookProcessed !== isReconProcessed).toBe(true);

      // Verify exactly one discussion exists
      const discussions = await repos.historyRepo.getAllDiscussions(targetCommunityId);
      expect(discussions).toHaveLength(1);
      expect(discussions[0].content).toContain('Simultaneous delivery update');
      expect(discussions[0].resources).toHaveLength(1);

      // Verify exactly one ingestion record in repository
      const allEvents = await repos.ingestionRepo.getAllEvents();
      const matching = allEvents.filter((e) => e.externalEventId === '888');
      expect(matching).toHaveLength(1);
      expect(matching[0].status).toBe('processed');
    });
  });

  // =========================================================================
  // 10. Failed Event Replay Semantics
  // =========================================================================
  describe('10. Failed Event Replay Semantics', () => {
    it('exercises full state machine: failure -> retry -> dead-letter -> operator override replay -> idempotent repeat', async () => {
      const repos = createDurableRepositories();
      const service = new CommunityEventIngestionService(
        repos.ingestionRepo,
        repos.historyRepo,
        repos.integrationRepo,
        { maxRetries: 2 }
      );
      const recoveryService = new IngestionRecoveryService(repos.ingestionRepo, service);

      const eventPayload: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: String(validChatId),
        externalEventId: 'replay_lifecycle_evt',
        externalMessageId: 'replay_msg_1',
        author: { externalUserId: '1', displayName: 'User1' },
        content: 'Replay Lifecycle Test',
        timestamp: new Date(),
        eventType: 'message_created',
      };

      // Disable integration to force ingestion failures
      await repos.integrationRepo.setIntegrationActive('telegram', String(validChatId), false);

      // Attempt 1: initial ingestion fails (retryCount = 1, status = failed)
      const res1 = await service.ingestEvent(eventPayload);
      expect(res1.outcome).toBe('failed');
      expect(res1.ingestionRecord?.retryCount).toBe(1);
      expect(res1.ingestionRecord?.status).toBe('failed');

      // Attempt 2: retry 1 fails (retryCount = 2, status = failed)
      const res2 = await service.ingestEvent(eventPayload);
      expect(res2.outcome).toBe('failed');
      expect(res2.ingestionRecord?.retryCount).toBe(2);
      expect(res2.ingestionRecord?.status).toBe('failed');

      // Attempt 3: retry 2 exceeds maxRetries (2) -> transitions to permanently_failed (dead-lettered)
      // Standard ingestion pipeline ignores permanently_failed events without operator override
      const res3 = await service.ingestEvent(eventPayload);
      expect(res3.outcome).toBe('duplicate_ignored');
      expect(res3.ingestionRecord?.status).toBe('permanently_failed');

      const deadLetterId = res3.ingestionRecord!.id;

      // Re-enable integration
      await repos.integrationRepo.setIntegrationActive('telegram', String(validChatId), true);

      // Attempt replay without override -> MUST BE REJECTED
      const unauthReplay = await recoveryService.replayEvent(
        deadLetterId,
        async () => eventPayload,
        { allowPermanentlyFailed: false }
      );
      expect(unauthReplay.success).toBe(false);
      expect(unauthReplay.outcome).toBe('permanently_failed');
      expect(unauthReplay.error).toContain('Explicit override');

      // Attempt replay with explicit operator override -> SUCCEEDS
      const authReplay = await recoveryService.replayEvent(
        deadLetterId,
        async () => eventPayload,
        { allowPermanentlyFailed: true, reason: 'Operator verified integration is restored' }
      );
      expect(authReplay.success).toBe(true);
      expect(authReplay.outcome).toBe('processed');

      // Verify discussion exists
      const discs = await repos.historyRepo.getAllDiscussions(targetCommunityId);
      expect(discs).toHaveLength(1);

      // Repeat replay on already processed event -> idempotent duplicate_ignored
      const repeatReplay = await recoveryService.replayEvent(
        deadLetterId,
        async () => eventPayload,
        { allowPermanentlyFailed: true }
      );
      expect(repeatReplay.success).toBe(true);
      expect(repeatReplay.outcome).toBe('duplicate_ignored');

      // Still exactly 1 discussion
      const finalDiscs = await repos.historyRepo.getAllDiscussions(targetCommunityId);
      expect(finalDiscs).toHaveLength(1);
    });
  });

  // =========================================================================
  // 11. Secret Sanitization Adversarial Testing
  // =========================================================================
  describe('11. Secret Sanitization Adversarial Testing', () => {
    it('defends against credential leakage across strings, URLs, headers, nested objects, errors, and stacks', () => {
      const sensitiveBotToken = '987654321:AAEFGHIJKLMNOPQRSTUVWxyz123456789';
      const sensitiveWebhookSecret = 'super_secret_webhook_key_45678';
      const sensitivePassword = 'adminSuperSecretPassword#123';

      // 1. Plain String with Embedded Secrets
      const text = `Telegram API error with bot token ${sensitiveBotToken} and secret ${sensitiveWebhookSecret}`;
      const sanitizedText = TelegramSecretSanitizer.sanitizeString(text, [sensitiveWebhookSecret]);
      expect(sanitizedText).not.toContain(sensitiveBotToken);
      expect(sanitizedText).not.toContain(sensitiveWebhookSecret);
      expect(sanitizedText).toContain('***REDACTED');

      // 2. URL with embedded credentials and query params
      const url = `https://botUser:${sensitivePassword}@api.telegram.org/bot${sensitiveBotToken}/sendMessage?chat_id=-100123&token=${sensitiveBotToken}&secret=${sensitiveWebhookSecret}`;
      const sanitizedUrl = TelegramSecretSanitizer.sanitizeUrl(url, [sensitiveWebhookSecret]);
      expect(sanitizedUrl).not.toContain(sensitiveBotToken);
      expect(sanitizedUrl).not.toContain(sensitiveWebhookSecret);
      expect(sanitizedUrl).not.toContain(sensitivePassword);

      // 3. Authorization & Bearer Headers
      const authHeader = `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123`;
      const sanitizedHeader = TelegramSecretSanitizer.sanitizeString(authHeader);
      expect(sanitizedHeader).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123');

      // 4. Nested Object with Secret Keys and Values
      const complexObject = {
        id: 'evt_123',
        metadata: {
          bot_token: sensitiveBotToken,
          nested: {
            webhook_secret: sensitiveWebhookSecret,
            api_key: 'secret-key-xyz',
            authorization: 'Bearer 12345',
            normalData: 'Safe Public String',
            errorLog: `Failed request to /bot${sensitiveBotToken}/getUpdates`,
          },
        },
        tags: ['tag1', `secret:${sensitiveWebhookSecret}`],
      };

      const sanitizedObj = TelegramSecretSanitizer.sanitizePayload(complexObject, {
        botToken: sensitiveBotToken,
        webhookSecret: sensitiveWebhookSecret,
      }) as typeof complexObject;

      const serialized = JSON.stringify(sanitizedObj);
      expect(serialized).not.toContain(sensitiveBotToken);
      expect(serialized).not.toContain(sensitiveWebhookSecret);
      expect(serialized).not.toContain('secret-key-xyz');
      expect(serialized).toContain('Safe Public String');

      // 5. Error objects
      const err = new Error(`Connection timeout calling https://api.telegram.org/bot${sensitiveBotToken}/setWebhook`);
      const sanitizedErrMsg = TelegramSecretSanitizer.sanitizeString(err.message);
      expect(sanitizedErrMsg).not.toContain(sensitiveBotToken);

      // 6. Provider-neutral SecretSanitizer in core
      const coreSanitized = SecretSanitizer.sanitizeString(`Error token=${sensitiveBotToken}`);
      expect(coreSanitized).not.toContain(sensitiveBotToken);
    });
  });

  // =========================================================================
  // 12. DurableFileStorage Failure Injection
  // =========================================================================
  describe('12. DurableFileStorage Failure Injection', () => {
    it('isolates mutation errors, prevents queue poisoning, and falls back gracefully on corrupt data', async () => {
      const testFile = path.join(tempDir, 'failure_test.json');
      const storage = new DurableFileStorage<{ items: string[] }>(testFile, () => ({ items: [] }));

      // 1. Successful initial mutation
      await storage.mutate((data) => {
        data.items.push('item_1');
      });

      const initialData = await storage.read();
      expect(initialData.items).toEqual(['item_1']);

      // 2. Injected failure in a mutation callback
      await expect(
        storage.mutate(() => {
          throw new Error('Simulated database deadlock / disk failure');
        })
      ).rejects.toThrow('Simulated database deadlock / disk failure');

      // 3. Verify queue is NOT poisoned: subsequent mutation executes cleanly
      await storage.mutate((data) => {
        data.items.push('item_2');
      });

      const recoveredData = await storage.read();
      expect(recoveredData.items).toEqual(['item_1', 'item_2']);

      // 4. Corrupt file on disk
      fs.writeFileSync(testFile, 'INVALID JSON {{{{ CORRUPTED', 'utf-8');
      storage.invalidateCache();

      // Read falls back safely to default factory instead of crashing
      const fallbackData = await storage.read();
      expect(fallbackData.items).toEqual([]);

      // Subsequent mutation successfully overwrites corrupt file with valid JSON
      await storage.mutate((data) => {
        data.items.push('repaired_item');
      });

      const repairedData = await storage.read();
      expect(repairedData.items).toEqual(['repaired_item']);
      expect(JSON.parse(fs.readFileSync(testFile, 'utf-8')).items).toEqual(['repaired_item']);
    });
  });

  // =========================================================================
  // 13. Observability Accuracy Against Real Persisted State
  // =========================================================================
  describe('13. Observability Accuracy Against Real Persisted State', () => {
    it('accurately reflects healthy, degraded, and unhealthy states based on real persisted data', async () => {
      const repos = createDurableRepositories();
      const observability = new IngestionObservabilityService(repos.ingestionRepo, repos.integrationRepo);

      // Initial clean state -> healthy
      const health1 = await observability.getHealthReport();
      expect(health1.status).toBe('healthy');
      expect(health1.permanentlyFailedCount).toBe(0);
      expect(health1.failedCount).toBe(0);

      // Add a transient failed event -> degraded
      const claim1 = await repos.ingestionRepo.claimEvent('telegram', String(validChatId), 'transient_fail');
      await repos.ingestionRepo.updateStatus(claim1.record.id, 'failed', 'Network timeout');

      const health2 = await observability.getHealthReport();
      expect(health2.status).toBe('degraded');
      expect(health2.failedCount).toBe(1);

      // Add a permanently failed (dead-letter) event -> unhealthy
      const claim2 = await repos.ingestionRepo.claimEvent('telegram', String(validChatId), 'dead_letter_fail');
      await repos.ingestionRepo.updateStatus(claim2.record.id, 'permanently_failed', 'Bot token expired');

      const health3 = await observability.getHealthReport();
      expect(health3.status).toBe('unhealthy');
      expect(health3.permanentlyFailedCount).toBe(1);
      expect(health3.recentDeadLetterEvents).toHaveLength(1);
      expect(health3.recentDeadLetterEvents[0].error).toBe('Bot token expired');

      // Verify dead letters list
      const deadLetters = await observability.getDeadLetterEvents();
      expect(deadLetters).toHaveLength(1);
      expect(deadLetters[0].externalEventId).toBe('dead_letter_fail');
    });
  });
});
