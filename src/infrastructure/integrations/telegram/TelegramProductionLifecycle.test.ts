import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TelegramConfig } from './TelegramConfig';
import { TelegramWebhookHandler } from './TelegramWebhookHandler';
import { TelegramSourceAdapter } from './TelegramSourceAdapter';
import { TelegramUpdateReconciliationService } from './TelegramUpdateReconciliationService';
import { TelegramSecretSanitizer } from './TelegramSecretSanitizer';
import { MockTelegramClient } from './MockTelegramClient';
import { MockTelegramBotCheckpointRepository } from './MockTelegramBotCheckpointRepository';
import { CommunityEventIngestionService } from '../../../core/services/CommunityEventIngestionService';
import { IngestionRecoveryService } from '../../../core/services/IngestionRecoveryService';
import { IngestionObservabilityService } from '../../../core/services/IngestionObservabilityService';
import { DiscussionEvidenceAnalyzer } from '../../../core/evidence/DiscussionEvidenceAnalyzer';
import { CatchUpService } from '../../../core/services/CatchUpService';
import { MockCatchUpGenerator } from '../../ai/MockCatchUpGenerator';
import { MockIngestionEventRepository } from '../../db/mock/MockIngestionEventRepository';
import { MockCommunityHistoryRepository } from '../../db/mock/MockCommunityHistoryRepository';
import { MockCommunityIntegrationRepository } from '../../db/mock/MockCommunityIntegrationRepository';
import { DurableFileIngestionEventRepository } from '../../db/durable/DurableFileIngestionEventRepository';
import { DurableFileCommunityHistoryRepository } from '../../db/durable/DurableFileCommunityHistoryRepository';
import { DurableFileCommunityIntegrationRepository } from '../../db/durable/DurableFileCommunityIntegrationRepository';
import { DurableFileTelegramBotCheckpointRepository } from './DurableFileTelegramBotCheckpointRepository';
import { IMembershipRepository } from '../../../core/repositories/IMembershipRepository';
import { Community } from '../../../core/domain/community';
import { Membership } from '../../../core/domain/membership';
import { HistoricalTopicEvent } from '../../../core/domain/history';
import { TelegramUpdate } from './TelegramTypes';
import { ExternalCommunitySourceEvent } from '../../../core/source/ExternalCommunitySourceEvent';

describe('Phase 13.6 — End-to-End Telegram Production Simulation & Operational Integrity', () => {
  let tempDir: string;
  const FAKE_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567890';
  const FAKE_WEBHOOK_SECRET = 'secret_production_audit_token_xyz99';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohorta-phase13-6-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  });

  // =========================================================================
  // Section 1: Authorized Community End-to-End Test
  // =========================================================================
  describe('1. Authorized Community End-to-End Pipeline', () => {
    it('ingests realistic multi-message sequence, attaches replies, extracts resources, and feeds CatchUpService', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_prod_alpha',
          communityId: 'comm_prod_alpha',
          providerType: 'telegram',
          providerCommunityId: '-100999001',
          isActive: true,
          metadata: {},
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
      ]);

      const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo, {
        defaultRoadmapItemId: 'rm_vector_index',
      });

      const config: TelegramConfig = {
        botToken: FAKE_BOT_TOKEN,
        webhookSecret: FAKE_WEBHOOK_SECRET,
        authorizedChatIds: new Set(['-100999001']),
      };

      const handler = new TelegramWebhookHandler(config, ingestionService);

      // Realistic Telegram update sequence:
      // Update 1: Root Question
      const update1: TelegramUpdate = {
        update_id: 1001,
        message: {
          message_id: 101,
          date: 1705000000,
          chat: { id: -100999001, type: 'supergroup', title: 'Vector Index Architecture' },
          from: { id: 501, first_name: 'Alice', is_bot: false },
          text: 'How should we configure vector indexing for 10M embeddings?',
        },
      };

      // Update 2: Root Discussion
      const update2: TelegramUpdate = {
        update_id: 1002,
        message: {
          message_id: 102,
          date: 1705000100,
          chat: { id: -100999001, type: 'supergroup', title: 'Vector Index Architecture' },
          from: { id: 502, first_name: 'Bob', is_bot: false },
          text: 'Comparing HNSW vs IVF-Flat memory and recall trade-offs.',
        },
      };

      // Update 3: Reply to Message 102
      const update3: TelegramUpdate = {
        update_id: 1003,
        message: {
          message_id: 103,
          date: 1705000200,
          chat: { id: -100999001, type: 'supergroup', title: 'Vector Index Architecture' },
          from: { id: 503, first_name: 'Charlie', is_bot: false },
          text: 'HNSW provides 98% recall at 2ms latency: https://github.com/pgvector/pgvector',
          reply_to_message: update2.message,
          entities: [
            {
              type: 'url',
              offset: 41,
              length: 37,
            },
          ],
        },
      };

      // Update 4: Root resource post with documentation link
      const update4: TelegramUpdate = {
        update_id: 1004,
        message: {
          message_id: 104,
          date: 1705000300,
          chat: { id: -100999001, type: 'supergroup', title: 'Vector Index Architecture' },
          from: { id: 504, first_name: 'Diana', is_bot: false },
          text: 'Reference documentation: https://docs.pgvector.com/guide',
          entities: [
            {
              type: 'url',
              offset: 25,
              length: 31,
            },
          ],
        },
      };

      const headers = { 'x-telegram-bot-api-secret-token': FAKE_WEBHOOK_SECRET };

      // Ingest sequentially
      const res1 = await handler.processWebhook(headers, update1);
      const res2 = await handler.processWebhook(headers, update2);
      const res3 = await handler.processWebhook(headers, update3);
      const res4 = await handler.processWebhook(headers, update4);

      expect(res1.statusCode).toBe(200);
      expect(res1.body.action).toBe('processed');
      expect(res2.statusCode).toBe(200);
      expect(res2.body.action).toBe('processed');
      expect(res3.statusCode).toBe(200);
      expect(res3.body.action).toBe('processed');
      expect(res4.statusCode).toBe(200);
      expect(res4.body.action).toBe('processed');

      // Verify discussions in history repository
      const allDiscussions = await historyRepo.getAllDiscussions('comm_prod_alpha');
      expect(allDiscussions).toHaveLength(3); // 101 (question), 102 (discussion with reply), 104 (resource)

      const rootQuestion = allDiscussions.find((d) => d.sourceProvenance?.externalMessageId === '101');
      expect(rootQuestion).toBeDefined();
      expect(rootQuestion?.communityId).toBe('comm_prod_alpha');
      expect(rootQuestion?.type).toBe('question');
      expect(rootQuestion?.createdAt).toEqual(new Date(1705000000 * 1000));
      expect(rootQuestion?.sourceProvenance?.provider).toBe('telegram');
      expect(rootQuestion?.sourceProvenance?.rawEventIds).toContain('1001');

      const parentDiscussion = allDiscussions.find((d) => d.sourceProvenance?.externalMessageId === '102');
      expect(parentDiscussion).toBeDefined();
      expect(parentDiscussion?.replies).toHaveLength(1);
      expect(parentDiscussion?.replyCount).toBe(1);
      expect(parentDiscussion?.replies[0].sourceProvenance?.externalMessageId).toBe('103');
      expect(parentDiscussion?.replies[0].sourceProvenance?.externalParentMessageId).toBe('102');
      expect(parentDiscussion?.replies[0].createdAt).toEqual(new Date(1705000200 * 1000));
      expect(parentDiscussion?.resources).toHaveLength(1);
      expect(parentDiscussion?.resources?.[0].url).toBe('https://github.com/pgvector/pgvector');
      expect(parentDiscussion?.resources?.[0].type).toBe('github');

      const resourceDiscussion = allDiscussions.find((d) => d.sourceProvenance?.externalMessageId === '104');
      expect(resourceDiscussion).toBeDefined();
      expect(resourceDiscussion?.resources).toHaveLength(1);
      expect(resourceDiscussion?.resources?.[0].url).toBe('https://docs.pgvector.com/guide');
      expect(resourceDiscussion?.resources?.[0].type).toBe('guide');

      // Verify DiscussionEvidenceAnalyzer consumes normalized entities
      const analyzedQuestion = DiscussionEvidenceAnalyzer.analyzeDiscussion(rootQuestion!);
      expect(analyzedQuestion.classification).toBe('unresolved_inquiry');
      expect(analyzedQuestion.confidence).toBe('high');
      expect(analyzedQuestion.openQuestion?.authorName).toBe('Alice');

      const analyzedDiscussion = DiscussionEvidenceAnalyzer.analyzeDiscussion(parentDiscussion!);
      expect(analyzedDiscussion.classification).toBe('informational');
      expect(analyzedDiscussion.resources).toHaveLength(1);

      // Verify CatchUpService consumption
      const mockMembershipRepo: IMembershipRepository = {
        getCommunity: async (cId: string): Promise<Community | null> => ({
          id: cId,
          creatorId: 'u_creator',
          categoryId: 'cat_ai',
          name: 'AI Agent Architecture',
          description: 'Production Vector Infrastructure',
          skillLevel: 'Advanced',
          status: 'active',
          currentTopic: 'Active Sharding',
          tags: ['vector', 'pgvector'],
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        }),
        getMembership: async (uId: string, cId: string): Promise<Membership | null> => ({
          id: 'm_member_1',
          userId: uId,
          communityId: cId,
          planId: 'plan_std',
          role: 'member',
          joinedAt: new Date('2024-01-20T00:00:00Z'),
          status: 'active',
        }),
        getPlan: async () => null,
        getPlansForCommunity: async () => [],
        getRoadmapItemIds: async () => ['rm_vector_index'],
        createMembership: async () => {},
        initializeProgress: async () => {},
      };

      const mockHistoricalTopic: HistoricalTopicEvent = {
        id: 'ht_vector_index',
        communityId: 'comm_prod_alpha',
        roadmapItemId: 'rm_vector_index',
        topicTitle: 'Vector Index Architecture',
        description: 'Comprehensive Vector Ingestion',
        orderIndex: 1,
        status: 'completed',
        startedAt: new Date('2024-01-05T00:00:00Z'),
        completedAt: new Date('2024-01-15T00:00:00Z'),
        keyIdea: 'HNSW indexes deliver high recall for dense vectors.',
        summary: 'Benchmarking indexing algorithms.',
      };

      const historyQueryRepo = {
        getCommunityHistory: async () => null,
        getDiscussionsForTopic: async (_cId: string, _rId: string) => allDiscussions,
        getDiscussionById: async (_cId: string, dId: string) => allDiscussions.find((d) => d.id === dId) || null,
        getHistoricalTopics: async () => [mockHistoricalTopic],
      };

      const catchUpService = new CatchUpService(historyQueryRepo, mockMembershipRepo, new MockCatchUpGenerator());
      const catchUp = await catchUpService.getCatchUp('u_member_1', 'comm_prod_alpha');

      expect(catchUp.hasMissedContent).toBe(true);
      expect(catchUp.missedTopicsCount).toBe(1);
      expect(catchUp.missedTopics[0].title).toBe('Vector Index Architecture');
      expect(catchUp.missedTopics[0].topResources.length).toBeGreaterThanOrEqual(2);
      expect(catchUp.missedTopics[0].sourceDiscussionIds).toContain(parentDiscussion!.id);
      expect(catchUp.missedTopics[0].sourceDiscussionIds).toContain(rootQuestion!.id);
    });
  });

  // =========================================================================
  // Section 2: Unauthorized Community Test
  // =========================================================================
  describe('2. Unauthorized Community Rejection', () => {
    it('strictly rejects valid update from chat with no active Cohorta integration and never mutates history', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_auth_1',
          communityId: 'comm_legit',
          providerType: 'telegram',
          providerCommunityId: '-100111222',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const config: TelegramConfig = {
        botToken: FAKE_BOT_TOKEN,
        webhookSecret: FAKE_WEBHOOK_SECRET,
        // No authorizedChatIds restrictor at adapter level to test core service resolution
      };

      const handler = new TelegramWebhookHandler(config, ingestionService);

      const unauthorizedUpdate: TelegramUpdate = {
        update_id: 9901,
        message: {
          message_id: 901,
          date: 1705000000,
          chat: { id: -100888999, type: 'supergroup', title: 'Rogue Unauthorized Chat' },
          from: { id: 777, first_name: 'Attacker', is_bot: false },
          text: 'Attempting to inject unmapped data into Cohorta.',
        },
      };

      const res = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': FAKE_WEBHOOK_SECRET },
        unauthorizedUpdate
      );

      // Webhook handler returns 500 when ingestion service rejects with missing integration
      expect(res.statusCode).toBe(500);
      expect(res.body.reason).toContain('No active community integration found for telegram:-100888999.');

      // Verify zero history was created
      const rogueDiscussions = await historyRepo.getAllDiscussions('comm_telegram_-100888999');
      expect(rogueDiscussions).toHaveLength(0);

      const legitDiscussions = await historyRepo.getAllDiscussions('comm_legit');
      expect(legitDiscussions).toHaveLength(0);

      // Verify ingestion event is recorded as failed, NOT processed
      const eventKey = 'telegram:-100888999:9901';
      const record = await ingestionRepo.findByEventKey(eventKey);
      expect(record).toBeDefined();
      expect(record?.status).toBe('failed');
      expect(record?.error).toContain('No active community integration found for telegram:-100888999.');
    });
  });

  // =========================================================================
  // Section 3: Disabled Integration Test
  // =========================================================================
  describe('3. Disabled Integration Test', () => {
    it('rejects ingestion when integration exists but isActive is false, keeping history unchanged and event retryable', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_disabled_1',
          communityId: 'comm_paused',
          providerType: 'telegram',
          providerCommunityId: '-100777000',
          isActive: false, // Disabled
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const config: TelegramConfig = {
        botToken: FAKE_BOT_TOKEN,
        webhookSecret: FAKE_WEBHOOK_SECRET,
      };

      const handler = new TelegramWebhookHandler(config, ingestionService);

      const update: TelegramUpdate = {
        update_id: 7001,
        message: {
          message_id: 701,
          date: 1705000000,
          chat: { id: -100777000, type: 'supergroup', title: 'Paused Community' },
          from: { id: 301, first_name: 'Member', is_bot: false },
          text: 'Discussion post during maintenance window.',
        },
      };

      const res = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': FAKE_WEBHOOK_SECRET },
        update
      );

      expect(res.statusCode).toBe(500);
      expect(res.body.reason).toContain('Community integration for telegram:-100777000 is disabled.');

      // Zero history created
      const discussions = await historyRepo.getAllDiscussions('comm_paused');
      expect(discussions).toHaveLength(0);

      // Event is stored as failed and retryable
      const record = await ingestionRepo.findByEventKey('telegram:-100777000:7001');
      expect(record?.status).toBe('failed');
      expect(record?.retryCount).toBe(1);

      // Re-enable integration and retry
      const integration = await integrationRepo.findByProviderCommunityId('telegram', '-100777000');
      integration!.isActive = true;
      await integrationRepo.saveIntegration(integration!);

      const recoveryService = new IngestionRecoveryService(ingestionRepo, ingestionService);
      const recoverySummary = await recoveryService.retryFailedEvents(async (ev) => {
        if (ev.externalEventId === '7001') {
          return TelegramSourceAdapter.adaptUpdate(update, config);
        }
        return null;
      });

      expect(recoverySummary.recovered).toBe(1);

      // Now history is populated
      const restoredDiscussions = await historyRepo.getAllDiscussions('comm_paused');
      expect(restoredDiscussions).toHaveLength(1);
    });
  });

  // =========================================================================
  // Section 4: Webhook → Reconciliation Equivalence
  // =========================================================================
  describe('4. Webhook → Reconciliation Equivalence', () => {
    it('produces identical logical outcome with zero duplicates whether delivered via Webhook or Reconciliation', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_equiv_1',
          communityId: 'comm_equiv',
          providerType: 'telegram',
          providerCommunityId: '-100555666',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      const checkpointRepo = new MockTelegramBotCheckpointRepository();

      const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const config: TelegramConfig = {
        botToken: FAKE_BOT_TOKEN,
        webhookSecret: FAKE_WEBHOOK_SECRET,
      };

      const webhookHandler = new TelegramWebhookHandler(config, ingestionService);
      const mockClient = new MockTelegramClient();
      const reconciliationService = new TelegramUpdateReconciliationService(
        mockClient,
        config,
        ingestionService,
        checkpointRepo,
        integrationRepo
      );

      const sharedUpdate: TelegramUpdate = {
        update_id: 5001,
        message: {
          message_id: 501,
          date: 1705000000,
          chat: { id: -100555666, type: 'supergroup', title: 'Equivalence Group' },
          from: { id: 401, first_name: 'Eve', is_bot: false },
          text: 'Deterministic idempotent payload: https://github.com/example/repo',
          entities: [{ type: 'url', offset: 34, length: 31 }],
        },
      };

      // 1. Deliver via Webhook first
      const webhookRes = await webhookHandler.processWebhook(
        { 'x-telegram-bot-api-secret-token': FAKE_WEBHOOK_SECRET },
        sharedUpdate
      );
      expect(webhookRes.statusCode).toBe(200);
      expect(webhookRes.body.action).toBe('processed');

      const discussionsAfterWebhook = await historyRepo.getAllDiscussions('comm_equiv');
      expect(discussionsAfterWebhook).toHaveLength(1);
      expect(discussionsAfterWebhook[0].resources).toHaveLength(1);

      // 2. Deliver via Reconciliation getUpdates
      mockClient.seedUpdates([sharedUpdate]);
      const reconResult = await reconciliationService.reconcileUpdates();

      expect(reconResult.updatesFetched).toBe(1);
      expect(reconResult.duplicatesSkipped).toBe(1);
      expect(reconResult.eventsIngested).toBe(0);
      expect(reconResult.checkpointSaved).toBe(5001);

      // 3. Verify zero duplicate discussion, reply, or resource
      const discussionsAfterRecon = await historyRepo.getAllDiscussions('comm_equiv');
      expect(discussionsAfterRecon).toHaveLength(1);
      expect(discussionsAfterRecon[0].resources).toHaveLength(1);
      expect(discussionsAfterRecon[0].replies).toHaveLength(0);
    });
  });

  // =========================================================================
  // Section 5: Crash-Window Simulation (Cases A through F)
  // =========================================================================
  describe('5. Crash-Window Simulation & Ownership Fencing', () => {
    it('Case A (claim -> crash -> retry): successfully recovers in-flight processing', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_1',
          communityId: 'comm_1',
          providerType: 'telegram',
          providerCommunityId: '-100111',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo, {
        staleTimeoutMs: 50,
      });

      // Claim event as if worker started
      const claim = await ingestionRepo.claimEvent('telegram', '-100111', 'crash_a_1');
      expect(claim.outcome).toBe('claimed');

      // Server crashes before worker finishes. After stale timeout:
      await new Promise((r) => setTimeout(r, 60));

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100111',
        externalEventId: 'crash_a_1',
        externalMessageId: 'msg_crash_a',
        eventType: 'message_created',
        author: { externalUserId: '1', displayName: 'User 1' },
        content: 'Crash A recovered message',
        timestamp: new Date(),
      };

      const result = await service.ingestEvent(event);
      expect(result.outcome).toBe('processed');
      const discussions = await historyRepo.getAllDiscussions('comm_1');
      expect(discussions).toHaveLength(1);
    });

    it('Case B (claim -> history mutation -> crash before processed status -> retry): safely idempotently updates status without duplicate discussions', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_1',
          communityId: 'comm_1',
          providerType: 'telegram',
          providerCommunityId: '-100111',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo, {
        staleTimeoutMs: 50,
      });

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100111',
        externalEventId: 'crash_b_1',
        externalMessageId: 'msg_crash_b',
        eventType: 'message_created',
        author: { externalUserId: '1', displayName: 'User 1' },
        content: 'Crash B message with written history',
        timestamp: new Date(),
      };

      // Manually simulate partial execution: claim event + write discussion directly to history
      await ingestionRepo.claimEvent('telegram', '-100111', 'crash_b_1');
      await historyRepo.saveDiscussion({
        id: 'disc_telegram__100111_msg_crash_b',
        communityId: 'comm_1',
        roadmapItemId: 'general',
        topicTitle: 'General',
        author: { id: '1', name: 'User 1', avatarUrl: '', role: 'member' },
        title: 'Crash B message with written history',
        content: 'Crash B message with written history',
        type: 'discussion',
        signalQuality: 'high_signal',
        createdAt: new Date(),
        isDeleted: false,
        replies: [],
        replyCount: 0,
        sourceProvenance: {
          provider: 'telegram',
          externalCommunityId: '-100111',
          externalMessageId: 'msg_crash_b',
          originalTimestamp: new Date(),
          ingestedAt: new Date(),
          rawEventIds: ['crash_b_1'],
        },
      });

      // Stale timeout expires
      await new Promise((r) => setTimeout(r, 60));

      // Worker retries
      const retryResult = await service.ingestEvent(event);
      expect(retryResult.outcome).toBe('processed');

      // History must contain exactly 1 discussion
      const discussions = await historyRepo.getAllDiscussions('comm_1');
      expect(discussions).toHaveLength(1);
    });

    it('Case C (history mutation -> checkpoint not persisted -> restart -> reconciliation): deduplicates and advances checkpoint', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_1',
          communityId: 'comm_1',
          providerType: 'telegram',
          providerCommunityId: '-100111',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      const checkpointRepo = new MockTelegramBotCheckpointRepository();

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const config: TelegramConfig = { botToken: FAKE_BOT_TOKEN };

      const update: TelegramUpdate = {
        update_id: 3001,
        message: {
          message_id: 301,
          date: 1705000000,
          chat: { id: -100111, type: 'supergroup', title: 'Group 1' },
          from: { id: 1, first_name: 'Alice', is_bot: false },
          text: 'Update 3001 message content',
        },
      };

      // Ingest via service
      const sourceEvent = TelegramSourceAdapter.adaptUpdate(update, config);
      await service.ingestEvent(sourceEvent!);

      // Checkpoint was not saved yet (stays 0).
      expect(await checkpointRepo.getCheckpoint('bot_123456789')).toBeNull();

      // Reconciliation runs and receives update 3001 again
      const mockClient = new MockTelegramClient();
      mockClient.seedUpdates([update]);
      const reconService = new TelegramUpdateReconciliationService(
        mockClient,
        config,
        service,
        checkpointRepo,
        integrationRepo
      );

      const recon = await reconService.reconcileUpdates();
      expect(recon.duplicatesSkipped).toBe(1);
      expect(recon.checkpointSaved).toBe(3001);

      // Discussions count strictly 1
      const discussions = await historyRepo.getAllDiscussions('comm_1');
      expect(discussions).toHaveLength(1);
    });

    it('Case D (processed -> duplicate webhook): returns 200 duplicate_ignored', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_1',
          communityId: 'comm_1',
          providerType: 'telegram',
          providerCommunityId: '-100111',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const config: TelegramConfig = { botToken: FAKE_BOT_TOKEN, webhookSecret: FAKE_WEBHOOK_SECRET };
      const handler = new TelegramWebhookHandler(config, service);

      const update: TelegramUpdate = {
        update_id: 4001,
        message: {
          message_id: 401,
          date: 1705000000,
          chat: { id: -100111, type: 'supergroup', title: 'Group 1' },
          from: { id: 1, first_name: 'Alice', is_bot: false },
          text: 'Message 401',
        },
      };

      const res1 = await handler.processWebhook({ 'x-telegram-bot-api-secret-token': FAKE_WEBHOOK_SECRET }, update);
      expect(res1.body.action).toBe('processed');

      const res2 = await handler.processWebhook({ 'x-telegram-bot-api-secret-token': FAKE_WEBHOOK_SECRET }, update);
      expect(res2.statusCode).toBe(200);
      expect(res2.body.action).toBe('duplicate_ignored');

      const discussions = await historyRepo.getAllDiscussions('comm_1');
      expect(discussions).toHaveLength(1);
    });

    it('Case E & F (stale lease recovery & ownership token fencing): prevents stale worker from committing', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_1',
          communityId: 'comm_1',
          providerType: 'telegram',
          providerCommunityId: '-100111',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      // Worker 1 claims event
      const claim1 = await ingestionRepo.claimEvent('telegram', '-100111', 'fenced_event_1', {
        staleTimeoutMs: 50,
      });
      expect(claim1.outcome).toBe('claimed');
      const token1 = claim1.record.ownerToken!;

      // Wait for stale timeout
      await new Promise((r) => setTimeout(r, 60));

      // Worker 2 (Recovery Worker) claims event and receives new ownerToken
      const claim2 = await ingestionRepo.claimEvent('telegram', '-100111', 'fenced_event_1', {
        staleTimeoutMs: 50,
      });
      expect(claim2.outcome).toBe('recovered_stale');
      const token2 = claim2.record.ownerToken!;
      expect(token2).not.toBe(token1);

      // Worker 2 successfully completes
      await ingestionRepo.updateStatus(claim2.record.id, 'processed', undefined, new Date(), {
        expectedOwnerToken: token2,
      });

      // Worker 1 wakes up and attempts to commit with stale token1 -> MUST BE REJECTED
      await expect(
        ingestionRepo.updateStatus(claim1.record.id, 'processed', undefined, new Date(), {
          expectedOwnerToken: token1,
        })
      ).rejects.toThrow(/superseded or recovered|StaleOwnershipError/i);

      // Final status remains authoritative
      const finalRecord = await ingestionRepo.findByEventKey('telegram:-100111:fenced_event_1');
      expect(finalRecord?.status).toBe('processed');
    });
  });

  // =========================================================================
  // Section 6: Reconciliation Gap Verification & Resumption
  // =========================================================================
  describe('6. Reconciliation Gap Verification & Resumption', () => {
    it('halts checkpoint on failure in [101, 102, 103], requests offset 102 on next poll, and advances once 102 succeeds', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_alpha',
          communityId: 'comm_alpha',
          providerType: 'telegram',
          providerCommunityId: '-100111',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      const checkpointRepo = new MockTelegramBotCheckpointRepository();
      const mockClient = new MockTelegramClient();
      const config: TelegramConfig = { botToken: FAKE_BOT_TOKEN };

      let failUpdate102 = true;

      // Ingestion service that conditionally fails on update 102
      const service = {
        ingestEvent: async (event: ExternalCommunitySourceEvent) => {
          if (event.externalEventId === '102' && failUpdate102) {
            return {
              outcome: 'failed' as const,
              eventKey: 'telegram:-100111:102',
              externalEventId: '102',
              error: 'Simulated downstream failure on update 102',
            };
          }
          const normalService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
          return normalService.ingestEvent(event);
        },
        ingestBatch: async () => ({ totalReceived: 0, processedCount: 0, duplicateCount: 0, failedCount: 0, results: [] }),
      };

      const reconciliationService = new TelegramUpdateReconciliationService(
        mockClient,
        config,
        service,
        checkpointRepo,
        integrationRepo
      );

      const updates: TelegramUpdate[] = [
        {
          update_id: 101,
          message: {
            message_id: 1,
            date: 1705000000,
            chat: { id: -100111, type: 'supergroup', title: 'Alpha' },
            from: { id: 1, first_name: 'Alice', is_bot: false },
            text: 'Update 101 content',
          },
        },
        {
          update_id: 102,
          message: {
            message_id: 2,
            date: 1705000100,
            chat: { id: -100111, type: 'supergroup', title: 'Alpha' },
            from: { id: 2, first_name: 'Bob', is_bot: false },
            text: 'Update 102 content',
          },
        },
        {
          update_id: 103,
          message: {
            message_id: 3,
            date: 1705000200,
            chat: { id: -100111, type: 'supergroup', title: 'Alpha' },
            from: { id: 3, first_name: 'Charlie', is_bot: false },
            text: 'Update 103 content',
          },
        },
      ];

      mockClient.seedUpdates(updates);

      // First run: 102 fails -> checkpoint must be 101, but updates 101 and 103 were processed
      const res1 = await reconciliationService.reconcileUpdates();
      expect(res1.eventsIngested).toBe(2);
      expect(res1.failures).toBe(1);
      expect(res1.checkpointSaved).toBe(101);

      const cp1 = await checkpointRepo.getCheckpoint('bot_123456789');
      expect(cp1?.lastContiguousUpdateId).toBe(101);

      // Next poll requests offset = 102
      failUpdate102 = false; // Issue resolved

      const res2 = await reconciliationService.reconcileUpdates();
      expect(res2.checkpointSaved).toBe(103);

      const cp2 = await checkpointRepo.getCheckpoint('bot_123456789');
      expect(cp2?.lastContiguousUpdateId).toBe(103);
    });

    it('refuses to advance checkpoint across missing update in [101, 103] gap', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_alpha',
          communityId: 'comm_alpha',
          providerType: 'telegram',
          providerCommunityId: '-100111',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      const checkpointRepo = new MockTelegramBotCheckpointRepository();
      const mockClient = new MockTelegramClient();
      const config: TelegramConfig = { botToken: FAKE_BOT_TOKEN };
      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);

      const reconciliationService = new TelegramUpdateReconciliationService(
        mockClient,
        config,
        service,
        checkpointRepo,
        integrationRepo
      );

      // Gap batch: 101 and 103 (missing 102)
      mockClient.seedUpdates([
        {
          update_id: 101,
          message: {
            message_id: 1,
            date: 1705000000,
            chat: { id: -100111, type: 'supergroup', title: 'Alpha' },
            from: { id: 1, first_name: 'Alice', is_bot: false },
            text: 'Update 101 content',
          },
        },
        {
          update_id: 103,
          message: {
            message_id: 3,
            date: 1705000200,
            chat: { id: -100111, type: 'supergroup', title: 'Alpha' },
            from: { id: 3, first_name: 'Charlie', is_bot: false },
            text: 'Update 103 content',
          },
        },
      ]);

      const res = await reconciliationService.reconcileUpdates();
      // Checkpoint must NOT skip 102; it stops at 101
      expect(res.checkpointSaved).toBe(101);
      const cp = await checkpointRepo.getCheckpoint('bot_123456789');
      expect(cp?.lastContiguousUpdateId).toBe(101);
    });
  });

  // =========================================================================
  // Section 7: Dead-Letter Lifecycle & Operator Replay
  // =========================================================================
  describe('7. Dead-Letter Lifecycle & Operator Replay', () => {
    it('exhausts retries to permanently_failed, rejects unprivileged replay, and allows explicit operator override', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_dl_1',
          communityId: 'comm_dl',
          providerType: 'telegram',
          providerCommunityId: '-100444555',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      let shouldFail = true;
      const service = {
        ingestEvent: async (event: ExternalCommunitySourceEvent) => {
          if (shouldFail) {
            const claim = await ingestionRepo.claimEvent(event.provider, event.externalCommunityId, event.externalEventId, { maxRetries: 2 });
            if (claim.outcome === 'permanently_failed') {
              return { outcome: 'duplicate_ignored' as const, eventKey: `${event.provider}:${event.externalCommunityId}:${event.externalEventId}`, externalEventId: event.externalEventId };
            }
            await ingestionRepo.updateStatus(claim.record.id, 'failed', 'Unrecoverable schema parsing failure', undefined, { expectedOwnerToken: claim.record.ownerToken });
            return { outcome: 'failed' as const, eventKey: `${event.provider}:${event.externalCommunityId}:${event.externalEventId}`, externalEventId: event.externalEventId, error: 'Unrecoverable schema parsing failure' };
          }
          const normalService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
          return normalService.ingestEvent(event);
        },
        ingestBatch: async () => ({ totalReceived: 0, processedCount: 0, duplicateCount: 0, failedCount: 0, results: [] }),
      };

      const recoveryService = new IngestionRecoveryService(ingestionRepo, service);

      const sourceEvent: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100444555',
        externalEventId: 'dead_letter_99',
        externalMessageId: 'msg_dl_99',
        eventType: 'message_created',
        author: { externalUserId: '9', displayName: 'Dev' },
        content: 'Poison pill message payload',
        timestamp: new Date(),
      };

      // Attempt 1: Ingestion fails
      await service.ingestEvent(sourceEvent);
      let record = await ingestionRepo.findByEventKey('telegram:-100444555:dead_letter_99');
      expect(record?.status).toBe('failed');
      expect(record?.retryCount).toBe(1);

      // Attempt 2: Retry fails
      await recoveryService.retryFailedEvents(async () => sourceEvent, { maxRetries: 2 });
      // Attempt 3: Exhausted max retries (>= 2) -> marks permanently_failed
      await recoveryService.retryFailedEvents(async () => sourceEvent, { maxRetries: 2 });
      record = await ingestionRepo.findByEventKey('telegram:-100444555:dead_letter_99');
      expect(record?.status).toBe('permanently_failed');
      expect(record?.permanentlyFailedAt).toBeDefined();

      // Normal replay WITHOUT override must be rejected
      const unprivilegedReplay = await recoveryService.replayEvent(record!.id, async () => sourceEvent);
      expect(unprivilegedReplay.success).toBe(false);
      expect(unprivilegedReplay.outcome).toBe('permanently_failed');
      expect(unprivilegedReplay.error).toContain('Explicit override (allowPermanentlyFailed: true) is required');

      // Operator explicit override WITH reason
      shouldFail = false; // Bug resolved in source code
      const operatorReplay = await recoveryService.replayEvent(record!.id, async () => sourceEvent, {
        allowPermanentlyFailed: true,
        reason: 'Hotfix applied for payload parser (SEC-409)',
      });

      expect(operatorReplay.success).toBe(true);
      expect(operatorReplay.outcome).toBe('processed');

      const finalDiscussions = await historyRepo.getAllDiscussions('comm_dl');
      expect(finalDiscussions).toHaveLength(1);

      // Replaying an already processed event must be idempotent
      const replayProcessed = await recoveryService.replayEvent(record!.id, async () => sourceEvent);
      expect(replayProcessed.success).toBe(true);
      expect(replayProcessed.outcome).toBe('duplicate_ignored');
    });
  });

  // =========================================================================
  // Section 8: Secret-Safety Verification
  // =========================================================================
  describe('8. Secret-Safety Verification', () => {
    it('strictly sanitizes bot tokens, webhook secrets, and url credentials in logs and observability reports', () => {
      const rawError = `Failed request to https://api.telegram.org/bot${FAKE_BOT_TOKEN}/setWebhook with secret_token=${FAKE_WEBHOOK_SECRET}`;
      const sanitized = TelegramSecretSanitizer.sanitizeString(rawError);

      expect(sanitized).not.toContain(FAKE_BOT_TOKEN);
      expect(sanitized).not.toContain(FAKE_WEBHOOK_SECRET);
      expect(sanitized).toContain('***REDACTED_BOT_TOKEN***');
      expect(sanitized).toContain('***REDACTED***');

      // Test URL with basic auth
      const rawUrl = 'https://admin:myPassword123@api.telegram.org/bot123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567890/getWebhookInfo';
      const sanitizedUrl = TelegramSecretSanitizer.sanitizeUrl(rawUrl);
      expect(sanitizedUrl).not.toContain('myPassword123');
      expect(sanitizedUrl).not.toContain(FAKE_BOT_TOKEN);
    });

    it('verifies observability reports never expose raw secrets in dead-letter summaries', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_sec',
          communityId: 'comm_sec',
          providerType: 'telegram',
          providerCommunityId: '-100999888',
          isActive: true,
          lastProcessingError: `Telegram API error with token ${FAKE_BOT_TOKEN}`,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      await ingestionRepo.claimEvent('telegram', '-100999888', 'secret_event_1');
      const rec = await ingestionRepo.findByEventKey('telegram:-100999888:secret_event_1');
      await ingestionRepo.updateStatus(
        rec!.id,
        'permanently_failed',
        `Error calling webhook endpoint with secret ${FAKE_WEBHOOK_SECRET}`
      );

      const obsService = new IngestionObservabilityService(ingestionRepo, integrationRepo);
      const report = await obsService.getHealthReport();

      expect(report.status).toBe('unhealthy');
      expect(report.recentDeadLetterEvents[0].error).not.toContain(FAKE_WEBHOOK_SECRET);
      expect(report.recentDeadLetterEvents[0].error).toContain('***REDACTED***');

      const intSummary = report.integrations.find((i) => i.providerCommunityId === '-100999888');
      expect(intSummary?.lastProcessingError).not.toContain(FAKE_BOT_TOKEN);
      expect(intSummary?.lastProcessingError).toContain('***REDACTED_BOT_TOKEN***');
    });
  });

  // =========================================================================
  // Section 9: Persistence Restart Test (Full Disk Durability)
  // =========================================================================
  describe('9. Persistence Restart Test across Independent Instances', () => {
    it('persists all ingestion records, discussions, integrations, and checkpoints across simulated server restart', async () => {
      const ingestionFile = path.join(tempDir, 'ingestion.json');
      const historyFile = path.join(tempDir, 'history.json');
      const integrationFile = path.join(tempDir, 'integrations.json');
      const checkpointFile = path.join(tempDir, 'checkpoints.json');

      const config: TelegramConfig = { botToken: FAKE_BOT_TOKEN };

      // === SERVER INSTANCE 1 ===
      {
        const ingestionRepo1 = new DurableFileIngestionEventRepository(ingestionFile);
        const historyRepo1 = new DurableFileCommunityHistoryRepository(historyFile, false);
        const integrationRepo1 = new DurableFileCommunityIntegrationRepository(integrationFile, [
          {
            id: 'int_durable_1',
            communityId: 'comm_durable_1',
            providerType: 'telegram',
            providerCommunityId: '-100999111',
            isActive: true,
            metadata: {},
            createdAt: new Date('2024-01-01T00:00:00Z'),
          },
        ]);
        const checkpointRepo1 = new DurableFileTelegramBotCheckpointRepository(checkpointFile);

        const service1 = new CommunityEventIngestionService(ingestionRepo1, historyRepo1, integrationRepo1);

        const update1: TelegramUpdate = {
          update_id: 8001,
          message: {
            message_id: 801,
            date: 1705000000,
            chat: { id: -100999111, type: 'supergroup', title: 'Durable Group' },
            from: { id: 101, first_name: 'Durable User', is_bot: false },
            text: 'First durable message before server crash',
          },
        };

        const adapted1 = TelegramSourceAdapter.adaptUpdate(update1, config);
        const res1 = await service1.ingestEvent(adapted1!);
        expect(res1.outcome).toBe('processed');

        await checkpointRepo1.saveCheckpoint('bot_123456789', 8001);

        // Verify write was committed to disk
        expect(fs.existsSync(ingestionFile)).toBe(true);
        expect(fs.existsSync(historyFile)).toBe(true);
        expect(fs.existsSync(checkpointFile)).toBe(true);
      }
      // Server 1 destroyed / process terminated.

      // === SERVER INSTANCE 2 (Fresh instantiation reading same disk files) ===
      {
        const ingestionRepo2 = new DurableFileIngestionEventRepository(ingestionFile);
        const historyRepo2 = new DurableFileCommunityHistoryRepository(historyFile, false);
        const integrationRepo2 = new DurableFileCommunityIntegrationRepository(integrationFile);
        const checkpointRepo2 = new DurableFileTelegramBotCheckpointRepository(checkpointFile);

        const service2 = new CommunityEventIngestionService(ingestionRepo2, historyRepo2, integrationRepo2);

        // 1. Verify prior state survived intact
        const pastIntegrations = await integrationRepo2.getAllIntegrations();
        expect(pastIntegrations).toHaveLength(1);
        expect(pastIntegrations[0].communityId).toBe('comm_durable_1');

        const pastDiscussions = await historyRepo2.getAllDiscussions('comm_durable_1');
        expect(pastDiscussions).toHaveLength(1);
        expect(pastDiscussions[0].content).toBe('First durable message before server crash');
        expect(pastDiscussions[0].createdAt).toEqual(new Date(1705000000 * 1000));

        const pastCheckpoint = await checkpointRepo2.getCheckpoint('bot_123456789');
        expect(pastCheckpoint?.lastContiguousUpdateId).toBe(8001);

        // 2. Redeliver same update 8001 -> must be detected as duplicate
        const duplicateUpdate: TelegramUpdate = {
          update_id: 8001,
          message: {
            message_id: 801,
            date: 1705000000,
            chat: { id: -100999111, type: 'supergroup', title: 'Durable Group' },
            from: { id: 101, first_name: 'Durable User', is_bot: false },
            text: 'First durable message before server crash',
          },
        };
        const duplicateAdapted = TelegramSourceAdapter.adaptUpdate(duplicateUpdate, config);
        const dupRes = await service2.ingestEvent(duplicateAdapted!);
        expect(dupRes.outcome).toBe('duplicate_ignored');

        // 3. Deliver new update 8002 -> processes seamlessly
        const newUpdate: TelegramUpdate = {
          update_id: 8002,
          message: {
            message_id: 802,
            date: 1705000100,
            chat: { id: -100999111, type: 'supergroup', title: 'Durable Group' },
            from: { id: 102, first_name: 'Durable User 2', is_bot: false },
            text: 'Second durable message after restart',
          },
        };
        const newAdapted = TelegramSourceAdapter.adaptUpdate(newUpdate, config);
        const newRes = await service2.ingestEvent(newAdapted!);
        expect(newRes.outcome).toBe('processed');

        await checkpointRepo2.saveCheckpoint('bot_123456789', 8002);

        const allDiscussionsAfter = await historyRepo2.getAllDiscussions('comm_durable_1');
        expect(allDiscussionsAfter).toHaveLength(2);
      }
    });
  });

  // =========================================================================
  // Section 10: Community Isolation Stress Test
  // =========================================================================
  describe('10. Community Isolation Stress Test', () => {
    it('maintains strict data isolation across 3 distinct Telegram communities with overlapping IDs and timestamps', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_alpha',
          communityId: 'comm_alpha',
          providerType: 'telegram',
          providerCommunityId: '-100101',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: 'int_beta',
          communityId: 'comm_beta',
          providerType: 'telegram',
          providerCommunityId: '-100202',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: 'int_gamma',
          communityId: 'comm_gamma',
          providerType: 'telegram',
          providerCommunityId: '-100303',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const config: TelegramConfig = { botToken: FAKE_BOT_TOKEN };

      // Events with overlapping message IDs (message_id: 1) and timestamps across all 3 communities
      const timestamp = new Date('2024-01-10T12:00:00Z');

      const eventA: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100101',
        externalEventId: 'upd_901',
        externalMessageId: '1',
        eventType: 'message_created',
        author: { externalUserId: 'usr_99', displayName: 'Alice' },
        content: 'Alpha secret roadmap discussion',
        timestamp,
      };

      const eventB: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100202',
        externalEventId: 'upd_902',
        externalMessageId: '1',
        eventType: 'message_created',
        author: { externalUserId: 'usr_99', displayName: 'Alice' },
        content: 'Beta confidential architecture proposal',
        timestamp,
      };

      const eventC: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100303',
        externalEventId: 'upd_903',
        externalMessageId: '1',
        eventType: 'message_created',
        author: { externalUserId: 'usr_99', displayName: 'Alice' },
        content: 'Gamma financial planning meeting',
        timestamp,
      };

      // Ingest concurrently
      const [resA, resB, resC] = await Promise.all([
        service.ingestEvent(eventA),
        service.ingestEvent(eventB),
        service.ingestEvent(eventC),
      ]);

      expect(resA.outcome).toBe('processed');
      expect(resB.outcome).toBe('processed');
      expect(resC.outcome).toBe('processed');

      const discA = await historyRepo.getAllDiscussions('comm_alpha');
      const discB = await historyRepo.getAllDiscussions('comm_beta');
      const discC = await historyRepo.getAllDiscussions('comm_gamma');

      expect(discA).toHaveLength(1);
      expect(discA[0].content).toBe('Alpha secret roadmap discussion');
      expect(discA[0].sourceProvenance?.externalCommunityId).toBe('-100101');

      expect(discB).toHaveLength(1);
      expect(discB[0].content).toBe('Beta confidential architecture proposal');
      expect(discB[0].sourceProvenance?.externalCommunityId).toBe('-100202');

      expect(discC).toHaveLength(1);
      expect(discC[0].content).toBe('Gamma financial planning meeting');
      expect(discC[0].sourceProvenance?.externalCommunityId).toBe('-100303');
    });
  });

  // =========================================================================
  // Section 11: Message Lifecycle Verification (Create -> Edit -> Reply -> Resource -> Delete)
  // =========================================================================
  describe('11. Message Lifecycle Verification', () => {
    it('traces create -> edit -> edit -> reply -> resource update -> tombstone deletion without splitting logical identity', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_lifecycle',
          communityId: 'comm_lifecycle',
          providerType: 'telegram',
          providerCommunityId: '-100666777',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);

      // 1. Message Created
      const createEvent: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100666777',
        externalEventId: 'evt_1',
        externalMessageId: 'msg_root_1',
        eventType: 'message_created',
        author: { externalUserId: 'user_1', displayName: 'Alice' },
        content: 'Initial rough draft of caching strategy',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      };
      await service.ingestEvent(createEvent);

      let discussions = await historyRepo.getAllDiscussions('comm_lifecycle');
      expect(discussions).toHaveLength(1);
      expect(discussions[0].content).toBe('Initial rough draft of caching strategy');
      expect(discussions[0].sourceProvenance?.rawEventIds).toEqual(['evt_1']);

      // 2. Message Edited 1st time (adds resource)
      const editEvent1: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100666777',
        externalEventId: 'evt_2',
        externalMessageId: 'msg_root_1',
        eventType: 'message_edited',
        author: { externalUserId: 'user_1', displayName: 'Alice' },
        content: 'Draft with Redis benchmark: https://github.com/redis/redis',
        timestamp: new Date('2024-01-01T10:05:00Z'),
        resources: [{ url: 'https://github.com/redis/redis', type: 'github' }],
      };
      await service.ingestEvent(editEvent1);

      discussions = await historyRepo.getAllDiscussions('comm_lifecycle');
      expect(discussions).toHaveLength(1); // Same logical root
      expect(discussions[0].content).toBe('Draft with Redis benchmark: https://github.com/redis/redis');
      expect(discussions[0].resources).toHaveLength(1);
      expect(discussions[0].sourceProvenance?.isEdited).toBe(true);
      expect(discussions[0].sourceProvenance?.rawEventIds).toEqual(['evt_1', 'evt_2']);

      // 3. Message Edited 2nd time (replaces resource with paper)
      const editEvent2: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100666777',
        externalEventId: 'evt_3',
        externalMessageId: 'msg_root_1',
        eventType: 'message_edited',
        author: { externalUserId: 'user_1', displayName: 'Alice' },
        content: 'Finalized spec with caching paper: https://arxiv.org/abs/2301.00000.pdf',
        timestamp: new Date('2024-01-01T10:10:00Z'),
        resources: [{ url: 'https://arxiv.org/abs/2301.00000.pdf', type: 'paper' }],
      };
      await service.ingestEvent(editEvent2);

      discussions = await historyRepo.getAllDiscussions('comm_lifecycle');
      expect(discussions).toHaveLength(1);
      expect(discussions[0].resources?.[0].url).toBe('https://arxiv.org/abs/2301.00000.pdf');
      expect(discussions[0].sourceProvenance?.rawEventIds).toEqual(['evt_1', 'evt_2', 'evt_3']);

      // 4. Reply Attached
      const replyEvent: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100666777',
        externalEventId: 'evt_4',
        externalMessageId: 'msg_reply_1',
        externalParentMessageId: 'msg_root_1',
        eventType: 'reply_created',
        author: { externalUserId: 'user_2', displayName: 'Bob' },
        content: 'Great paper reference, agreed on LRU policy.',
        timestamp: new Date('2024-01-01T10:15:00Z'),
      };
      await service.ingestEvent(replyEvent);

      discussions = await historyRepo.getAllDiscussions('comm_lifecycle');
      expect(discussions).toHaveLength(1);
      expect(discussions[0].replies).toHaveLength(1);
      expect(discussions[0].replyCount).toBe(1);

      // 5. Message Deleted / Tombstoned
      const deleteEvent: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100666777',
        externalEventId: 'evt_5',
        externalMessageId: 'msg_root_1',
        eventType: 'message_deleted',
        author: { externalUserId: 'user_1', displayName: 'Alice' },
        content: '',
        timestamp: new Date('2024-01-01T10:30:00Z'),
      };
      await service.ingestEvent(deleteEvent);

      discussions = await historyRepo.getAllDiscussions('comm_lifecycle');
      expect(discussions).toHaveLength(1);
      expect(discussions[0].isDeleted).toBe(true);
      expect(discussions[0].resources).toHaveLength(0); // Clears active resources
      expect(discussions[0].replies).toHaveLength(1); // Structural reply preserved
      expect(discussions[0].sourceProvenance?.isDeleted).toBe(true);
      expect(discussions[0].sourceProvenance?.deletedAt).toBeDefined();

      // Evidence analyzer respects tombstone
      const analyzed = DiscussionEvidenceAnalyzer.analyzeDiscussion(discussions[0]);
      expect(analyzed.isNoise).toBe(true);
      expect(analyzed.classification).toBe('insufficient_data');
    });
  });

  // =========================================================================
  // Section 12: Observability Truthfulness & Health State Transitions
  // =========================================================================
  describe('12. Observability Truthfulness & Health State Transitions', () => {
    it('transitions deterministically across healthy -> degraded -> unhealthy -> healthy states', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_obs',
          communityId: 'comm_obs',
          providerType: 'telegram',
          providerCommunityId: '-100888111',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const obsService = new IngestionObservabilityService(ingestionRepo, integrationRepo);

      // 1. Initial Empty / Clean State -> Healthy
      let report = await obsService.getHealthReport();
      expect(report.status).toBe('healthy');
      expect(report.totalEvents).toBe(0);

      // 2. Inject transient failed event -> Degraded
      await ingestionRepo.claimEvent('telegram', '-100888111', 'ev_transient_1');
      const rec1 = await ingestionRepo.findByEventKey('telegram:-100888111:ev_transient_1');
      await ingestionRepo.updateStatus(rec1!.id, 'failed', 'Network timeout');

      report = await obsService.getHealthReport();
      expect(report.status).toBe('degraded');
      expect(report.failedCount).toBe(1);

      // 3. Mark event as permanently_failed -> Unhealthy
      await ingestionRepo.updateStatus(rec1!.id, 'permanently_failed', 'Max retries exhausted');

      report = await obsService.getHealthReport();
      expect(report.status).toBe('unhealthy');
      expect(report.permanentlyFailedCount).toBe(1);
      expect(report.recentDeadLetterEvents).toHaveLength(1);

      // 4. Resolve dead-letter event -> transitions back to Healthy
      await ingestionRepo.updateStatus(rec1!.id, 'processed', undefined, new Date());

      report = await obsService.getHealthReport();
      expect(report.status).toBe('healthy');
      expect(report.permanentlyFailedCount).toBe(0);
      expect(report.processedCount).toBe(1);
    });
  });
});
