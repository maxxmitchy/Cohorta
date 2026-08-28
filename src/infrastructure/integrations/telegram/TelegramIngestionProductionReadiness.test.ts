import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TelegramWebhookHandler } from './TelegramWebhookHandler';
import { validateTelegramConfig } from './TelegramConfig';
import { TelegramSourceAdapter } from './TelegramSourceAdapter';
import { validateTelegramWebhookPayload } from './TelegramPayloadValidator';
import { CommunityEventIngestionService } from '../../../core/services/CommunityEventIngestionService';
import { StaleOwnershipError } from '../../../core/repositories/IIngestionEventRepository';
import { DurableFileIngestionEventRepository } from '../../db/durable/DurableFileIngestionEventRepository';
import { DurableFileCommunityHistoryRepository } from '../../db/durable/DurableFileCommunityHistoryRepository';
import { DurableFileCommunityIntegrationRepository } from '../../db/durable/DurableFileCommunityIntegrationRepository';
import { DurableFileStorage } from '../../db/durable/DurableFileStorage';
import { MockIngestionEventRepository } from '../../db/mock/MockIngestionEventRepository';
import { MockCommunityHistoryRepository } from '../../db/mock/MockCommunityHistoryRepository';
import { MockCommunityIntegrationRepository } from '../../db/mock/MockCommunityIntegrationRepository';
import { MockMembershipRepository } from '../../db/mock/MockMembershipRepository';
import { IMembershipRepository } from '../../../core/repositories/IMembershipRepository';
import { CommunityHistoryService } from '../../../core/services/CommunityHistoryService';
import { ExternalCommunitySourceEvent } from '../../../core/source/ExternalCommunitySourceEvent';
import {
  FIXTURE_TELEGRAM_UPDATE_001,
  FIXTURE_TELEGRAM_UPDATE_002_QUESTION,
  FIXTURE_TELEGRAM_UPDATE_003_REPLY,
  FIXTURE_TELEGRAM_UPDATE_EDITED,
  TEST_CHAT_ID_STRING,
} from './TelegramFixtures';

describe('Phase 13.4 Production Readiness Audit: Telegram Ingestion & Persistence Integrity', () => {
  const TEST_SECRET = 'audit_webhook_secret_998877';
  let tempDir: string;
  let ingestionFile: string;
  let historyFile: string;
  let integrationFile: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohorta-audit-'));
    ingestionFile = path.join(tempDir, 'ingestion_events.json');
    historyFile = path.join(tempDir, 'community_history.json');
    integrationFile = path.join(tempDir, 'community_integrations.json');
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  // --- 1. CONCURRENT DUPLICATE DELIVERY & ATOMIC CLAIM ---
  describe('1 & 2. Concurrent Duplicate Delivery & Atomic Event Claim', () => {
    it('1. Atomic claim: first concurrent request claims, duplicate is identified as in-flight without double processing', async () => {
      const ingestionRepo = new DurableFileIngestionEventRepository(ingestionFile);
      const historyRepo = new DurableFileCommunityHistoryRepository(historyFile, false);
      const integrationRepo = new DurableFileCommunityIntegrationRepository(integrationFile, [
        {
          id: 'int_tg_1',
          communityId: 'com_defi_builders',
          providerType: 'telegram',
          providerCommunityId: '-100999000',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_concurrent_1',
        externalMessageId: 'msg_concurrent_1',
        eventType: 'message_created',
        author: { externalUserId: 'user_10', displayName: 'Alice' },
        content: 'Concurrent ingestion test message',
        timestamp: new Date('2026-08-28T10:00:00Z'),
      };

      // Launch 5 parallel ingestion requests for the EXACT SAME event simultaneously
      const results = await Promise.all([
        service.ingestEvent(event),
        service.ingestEvent(event),
        service.ingestEvent(event),
        service.ingestEvent(event),
        service.ingestEvent(event),
      ]);

      const processedResults = results.filter((r) => r.outcome === 'processed');
      const duplicateResults = results.filter((r) => r.outcome === 'duplicate_ignored');

      // Exactly ONE request must process the event, all other concurrent requests are safely ignored
      expect(processedResults.length).toBe(1);
      expect(duplicateResults.length).toBe(4);

      // Verify discussions in history repository: exactly one discussion exists
      const allDiscussions = await historyRepo.getAllDiscussions('com_defi_builders');
      expect(allDiscussions.length).toBe(1);
      expect(allDiscussions[0].content).toBe('Concurrent ingestion test message');
    });

    it('1b. High Concurrency: 50 simultaneous claimEvent calls on DurableFileIngestionEventRepository yield exactly 1 claimed and 49 in_flight', async () => {
      const repo = new DurableFileIngestionEventRepository(ingestionFile);
      const promises = Array.from({ length: 50 }, () =>
        repo.claimEvent('telegram', '-100888', 'evt_high_concurrency_50')
      );

      const claimResults = await Promise.all(promises);
      const claimed = claimResults.filter((r) => r.outcome === 'claimed');
      const inFlight = claimResults.filter((r) => r.outcome === 'in_flight');

      expect(claimed.length).toBe(1);
      expect(inFlight.length).toBe(49);
      expect(claimed[0].record.status).toBe('processing');
      expect(claimed[0].record.ownerToken).toBeDefined();
    });

    it('1c. High Concurrency on Already-Processed: 50 simultaneous claimEvent calls all return already_processed', async () => {
      const repo = new DurableFileIngestionEventRepository(ingestionFile);
      const initial = await repo.claimEvent('telegram', '-100888', 'evt_already_proc_50');
      await repo.updateStatus(initial.record.id, 'processed', undefined, new Date());

      const promises = Array.from({ length: 50 }, () =>
        repo.claimEvent('telegram', '-100888', 'evt_already_proc_50')
      );

      const claimResults = await Promise.all(promises);
      expect(claimResults.every((r) => r.outcome === 'already_processed')).toBe(true);
    });

    it('1d. High Concurrency on Stale In-Flight: 50 simultaneous claims yield exactly 1 recovered_stale and 49 in_flight', async () => {
      const repo = new DurableFileIngestionEventRepository(ingestionFile);
      const initial = await repo.claimEvent('telegram', '-100888', 'evt_stale_50', { staleTimeoutMs: 10 });
      const oldToken = initial.record.ownerToken;

      await new Promise((r) => setTimeout(r, 25)); // elapse beyond stale timeout

      const promises = Array.from({ length: 50 }, () =>
        repo.claimEvent('telegram', '-100888', 'evt_stale_50', { staleTimeoutMs: 10 })
      );

      const claimResults = await Promise.all(promises);
      const recovered = claimResults.filter((r) => r.outcome === 'recovered_stale');
      const inFlight = claimResults.filter((r) => r.outcome === 'in_flight');

      expect(recovered.length).toBe(1);
      expect(inFlight.length).toBe(49);
      expect(recovered[0].record.ownerToken).not.toBe(oldToken);
    });

    it('1e. Ownership Token Invalidation: Superseded stale processor cannot commit updateStatus after recovery worker claims', async () => {
      const repo = new DurableFileIngestionEventRepository(ingestionFile);

      // Worker 1 claims event
      const claim1 = await repo.claimEvent('telegram', '-100888', 'evt_owner_token_race', { staleTimeoutMs: 10 });
      const worker1Token = claim1.record.ownerToken!;

      // Simulate worker 1 hanging while time elapses
      await new Promise((r) => setTimeout(r, 25));

      // Worker 2 re-claims event via stale recovery and receives NEW owner token
      const claim2 = await repo.claimEvent('telegram', '-100888', 'evt_owner_token_race', { staleTimeoutMs: 10 });
      expect(claim2.outcome).toBe('recovered_stale');
      const worker2Token = claim2.record.ownerToken!;
      expect(worker2Token).not.toBe(worker1Token);

      // Delayed Worker 1 attempts to finalize processing using its obsolete worker1Token -> REJECTED
      await expect(
        repo.updateStatus(claim1.record.id, 'processed', undefined, new Date(), {
          expectedOwnerToken: worker1Token,
        })
      ).rejects.toThrow(StaleOwnershipError);

      // Worker 2 finalizes processing with valid worker2Token -> SUCCEEDS
      const finalResult = await repo.updateStatus(
        claim2.record.id,
        'processed',
        undefined,
        new Date(),
        { expectedOwnerToken: worker2Token }
      );
      expect(finalResult.status).toBe('processed');
    });

    it('2. Atomic claim outcome transitions in MockIngestionEventRepository', async () => {
      const repo = new MockIngestionEventRepository();

      const claim1 = await repo.claimEvent('telegram', '-100111', 'evt_claim_test');
      expect(claim1.outcome).toBe('claimed');
      expect(claim1.record.status).toBe('processing');

      // Concurrent in-flight attempt
      const claim2 = await repo.claimEvent('telegram', '-100111', 'evt_claim_test');
      expect(claim2.outcome).toBe('in_flight');

      // Mark processed
      await repo.updateStatus(claim1.record.id, 'processed');

      // Subsequent attempt
      const claim3 = await repo.claimEvent('telegram', '-100111', 'evt_claim_test');
      expect(claim3.outcome).toBe('already_processed');
    });
  });

  // --- 3 & 4. FAILED PROCESSING & RETRY AFTER FAILURE ---
  describe('3 & 4. Failed Processing & Retry After Failure', () => {
    it('3. Failed processing records error and allows subsequent retry to succeed', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository();

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_failure_test',
        externalMessageId: 'msg_failure_test',
        eventType: 'message_created',
        author: { externalUserId: 'user_11', displayName: 'Bob' },
        content: 'Testing error handling in ingestion pipeline',
        timestamp: new Date('2026-08-28T10:05:00Z'),
      };

      // Mock saveDiscussion to throw error on first attempt
      let shouldFail = true;
      const originalSave = historyRepo.saveDiscussion.bind(historyRepo);
      historyRepo.saveDiscussion = async (disc) => {
        if (shouldFail) {
          throw new Error('Simulated transient database write error');
        }
        return originalSave(disc);
      };

      // 1st attempt: fails
      const result1 = await service.ingestEvent(event);
      expect(result1.outcome).toBe('failed');
      expect(result1.error).toContain('Simulated transient database write error');

      const record1 = await ingestionRepo.findByEventKey('telegram:-100999000:upd_failure_test');
      expect(record1?.status).toBe('failed');
      expect(record1?.retryCount).toBe(1);

      // 2nd attempt: transient error cleared, retry succeeds
      shouldFail = false;
      const result2 = await service.ingestEvent(event);
      expect(result2.outcome).toBe('processed');

      const record2 = await ingestionRepo.findByEventKey('telegram:-100999000:upd_failure_test');
      expect(record2?.status).toBe('processed');
      expect(record2?.retryCount).toBe(2);
      expect(record2?.error).toBeUndefined();
    });
  });

  // --- 5 & 6. CRASH RECOVERY & STALE PROCESSING RECOVERY ---
  describe('5 & 6. Crash Recovery & Stale In-Flight Processing Recovery', () => {
    it('5. Survives simulated server restart when processing was interrupted', async () => {
      // === SERVER INSTANCE 1 ===
      const ingestionRepo1 = new DurableFileIngestionEventRepository(ingestionFile);
      const historyRepo1 = new DurableFileCommunityHistoryRepository(historyFile, false);
      const integrationRepo1 = new DurableFileCommunityIntegrationRepository(integrationFile);

      // Event was claimed and in 'processing' when server process terminates abruptly
      const claim = await ingestionRepo1.claimEvent('telegram', '-100999000', 'upd_crash_1');
      expect(claim.outcome).toBe('claimed');
      expect(claim.record.status).toBe('processing');

      // === SERVER RESTART (INSTANCE 2) ===
      const ingestionRepo2 = new DurableFileIngestionEventRepository(ingestionFile);
      const historyRepo2 = new DurableFileCommunityHistoryRepository(historyFile, false);
      const integrationRepo2 = new DurableFileCommunityIntegrationRepository(integrationFile);
      const service2 = new CommunityEventIngestionService(ingestionRepo2, historyRepo2, integrationRepo2, {
        staleTimeoutMs: 10, // short timeout for testing
      });

      // Wait 20ms so the in-flight state is considered stale
      await new Promise((resolve) => setTimeout(resolve, 20));

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_crash_1',
        externalMessageId: 'msg_crash_1',
        eventType: 'message_created',
        author: { externalUserId: 'user_12', displayName: 'Charlie' },
        content: 'Recovered message post server restart',
        timestamp: new Date('2026-08-28T10:10:00Z'),
      };

      const result = await service2.ingestEvent(event);
      expect(result.outcome).toBe('processed');

      const savedRecord = await ingestionRepo2.findByEventKey('telegram:-100999000:upd_crash_1');
      expect(savedRecord?.status).toBe('processed');
      expect(savedRecord?.retryCount).toBe(2);
    });

    it('6. In-flight processing within stale timeout returns duplicate_ignored, but beyond staleTimeout recovers', async () => {
      const repo = new MockIngestionEventRepository();

      // Claim at T0
      const claim1 = await repo.claimEvent('telegram', '-100111', 'evt_stale_test', {
        staleTimeoutMs: 50,
      });
      expect(claim1.outcome).toBe('claimed');

      // Immediate second attempt (<50ms)
      const claim2 = await repo.claimEvent('telegram', '-100111', 'evt_stale_test', {
        staleTimeoutMs: 50,
      });
      expect(claim2.outcome).toBe('in_flight');

      // Wait 60ms (>50ms stale timeout)
      await new Promise((r) => setTimeout(r, 60));

      const claim3 = await repo.claimEvent('telegram', '-100111', 'evt_stale_test', {
        staleTimeoutMs: 50,
      });
      expect(claim3.outcome).toBe('recovered_stale');
      expect(claim3.record.retryCount).toBe(2);
    });
  });

  // --- 7. DUPLICATE RETRY AFTER SUCCESS ---
  describe('7. Duplicate Retry After Success', () => {
    it('7. Re-sending an already processed event returns duplicate_ignored and does not mutate history', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository();

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo, {
        fallbackCommunityId: 'com_test',
      });

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_dup_test',
        externalMessageId: 'msg_dup_test',
        eventType: 'message_created',
        author: { externalUserId: 'user_13', displayName: 'David' },
        content: 'Original message content',
        timestamp: new Date('2026-08-28T10:15:00Z'),
      };

      const result1 = await service.ingestEvent(event);
      expect(result1.outcome).toBe('processed');

      const discussions1 = await historyRepo.getAllDiscussions('com_test');
      expect(discussions1.length).toBe(1);

      // Duplicate delivery
      const result2 = await service.ingestEvent(event);
      expect(result2.outcome).toBe('duplicate_ignored');

      const discussions2 = await historyRepo.getAllDiscussions('com_test');
      expect(discussions2.length).toBe(1);
      expect(discussions2[0].content).toBe('Original message content');
    });
  });

  // --- 8 & 9. EDITS UNDER RETRY & MULTIPLE EDITS ---
  describe('8 & 9. In-Place Message Edits & Multiple Edit Revisions', () => {
    it('8 & 9. Handles sequential message edits in-place with audit provenance without duplicating discussions', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository();

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo, {
        fallbackCommunityId: 'com_edit_test',
      });

      // 1. Initial message
      const createEvent: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_edit_0',
        externalMessageId: 'msg_edit_100',
        eventType: 'message_created',
        author: { externalUserId: 'user_14', displayName: 'Elena' },
        content: 'Initial discussion text with typo',
        timestamp: new Date('2026-08-28T10:20:00Z'),
      };
      await service.ingestEvent(createEvent);

      // 2. Edit 1: Fixes typo and adds a link
      const edit1: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_edit_1',
        externalMessageId: 'msg_edit_100',
        eventType: 'message_edited',
        author: { externalUserId: 'user_14', displayName: 'Elena' },
        content: 'Initial discussion text fixed https://github.com/ethereum/solidity',
        timestamp: new Date('2026-08-28T10:22:00Z'),
      };
      await service.ingestEvent(edit1);

      let discussions = await historyRepo.getAllDiscussions('com_edit_test');
      expect(discussions.length).toBe(1);
      expect(discussions[0].content).toBe('Initial discussion text fixed https://github.com/ethereum/solidity');
      expect(discussions[0].sourceProvenance?.isEdited).toBe(true);
      expect(discussions[0].sourceProvenance?.rawEventIds).toContain('upd_edit_0');
      expect(discussions[0].sourceProvenance?.rawEventIds).toContain('upd_edit_1');
      expect(discussions[0].resources?.length).toBe(1);
      expect(discussions[0].resources?.[0].type).toBe('github');

      // 3. Edit 2: Further refinement
      const edit2: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_edit_2',
        externalMessageId: 'msg_edit_100',
        eventType: 'message_edited',
        author: { externalUserId: 'user_14', displayName: 'Elena' },
        content: 'Final revised explanation https://ethereum.org/en/developers/docs/',
        timestamp: new Date('2026-08-28T10:25:00Z'),
      };
      await service.ingestEvent(edit2);

      discussions = await historyRepo.getAllDiscussions('com_edit_test');
      expect(discussions.length).toBe(1);
      expect(discussions[0].content).toBe('Final revised explanation https://ethereum.org/en/developers/docs/');
      expect(discussions[0].sourceProvenance?.rawEventIds?.length).toBe(3);
    });
  });

  // --- 10, 11 & 12. REPLY-BEFORE-PARENT & ORPHAN RECOVERY ---
  describe('10, 11 & 12. Reply-Before-Parent, Duplicate Orphan & Restart Resilience', () => {
    it('10 & 11. Out-of-order reply arrives before parent, held as orphan, and seamlessly attached when parent arrives', async () => {
      const ingestionRepo = new DurableFileIngestionEventRepository(ingestionFile);
      const historyRepo = new DurableFileCommunityHistoryRepository(historyFile, false);
      const integrationRepo = new DurableFileCommunityIntegrationRepository(integrationFile, [
        {
          id: 'int_1',
          communityId: 'com_reply_order',
          providerType: 'telegram',
          providerCommunityId: '-100999000',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);

      // 1. Reply arrives FIRST (e.g. parent 500 does not exist yet)
      const orphanReplyEvent: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_rep_501',
        externalMessageId: 'msg_501',
        externalParentMessageId: 'msg_500',
        eventType: 'reply_created',
        author: { externalUserId: 'user_reply', displayName: 'Frank' },
        content: 'This answers the question from parent msg 500',
        timestamp: new Date('2026-08-28T10:30:00Z'),
      };

      const replyResult = await service.ingestEvent(orphanReplyEvent);
      expect(replyResult.outcome).toBe('processed');

      // Orphan discussion should exist with hasMissingParent: true
      let discussions = await historyRepo.getAllDiscussions('com_reply_order');
      expect(discussions.length).toBe(1);
      expect(discussions[0].sourceProvenance?.hasMissingParent).toBe(true);
      expect(discussions[0].sourceProvenance?.externalParentMessageId).toBe('msg_500');

      // Duplicate orphan reply delivery -> should be ignored safely
      const dupReplyResult = await service.ingestEvent(orphanReplyEvent);
      expect(dupReplyResult.outcome).toBe('duplicate_ignored');

      // 2. Parent arrives LATER
      const parentEvent: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_parent_500',
        externalMessageId: 'msg_500',
        eventType: 'message_created',
        author: { externalUserId: 'user_parent', displayName: 'Grace' },
        content: 'How do rollup fraud proofs work in practice?',
        timestamp: new Date('2026-08-28T10:29:00Z'),
      };

      const parentResult = await service.ingestEvent(parentEvent);
      expect(parentResult.outcome).toBe('processed');

      // Reconciled state: exactly 1 root discussion with 1 attached reply (orphan placeholder deleted)
      discussions = await historyRepo.getAllDiscussions('com_reply_order');
      expect(discussions.length).toBe(1);
      expect(discussions[0].id).toBe('disc_telegram__100999000_msg_500');
      expect(discussions[0].replies.length).toBe(1);
      expect(discussions[0].replies[0].content).toBe('This answers the question from parent msg 500');
      expect(discussions[0].replies[0].sourceProvenance?.hasMissingParent).toBe(false);
    });

    it('12. Server restart while orphan reply is in storage preserves orphan until parent arrives', async () => {
      // === SERVER INSTANCE 1: Reply arrives ===
      const ingestionRepo1 = new DurableFileIngestionEventRepository(ingestionFile);
      const historyRepo1 = new DurableFileCommunityHistoryRepository(historyFile, false);
      const integrationRepo1 = new DurableFileCommunityIntegrationRepository(integrationFile, [
        {
          id: 'int_1',
          communityId: 'com_restart_orphan',
          providerType: 'telegram',
          providerCommunityId: '-100999000',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      const service1 = new CommunityEventIngestionService(ingestionRepo1, historyRepo1, integrationRepo1);

      await service1.ingestEvent({
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_rep_orphan_restart',
        externalMessageId: 'msg_601',
        externalParentMessageId: 'msg_600',
        eventType: 'reply_created',
        author: { externalUserId: 'user_orphan', displayName: 'Hank' },
        content: 'Reply waiting across restart',
        timestamp: new Date('2026-08-28T10:35:00Z'),
      });

      // === SERVER RESTART (INSTANCE 2): Parent arrives ===
      const ingestionRepo2 = new DurableFileIngestionEventRepository(ingestionFile);
      const historyRepo2 = new DurableFileCommunityHistoryRepository(historyFile, false);
      const integrationRepo2 = new DurableFileCommunityIntegrationRepository(integrationFile);
      const service2 = new CommunityEventIngestionService(ingestionRepo2, historyRepo2, integrationRepo2);

      await service2.ingestEvent({
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_parent_restart',
        externalMessageId: 'msg_600',
        eventType: 'message_created',
        author: { externalUserId: 'user_parent_2', displayName: 'Ivy' },
        content: 'Parent message that arrived after restart',
        timestamp: new Date('2026-08-28T10:34:00Z'),
      });

      const discussions = await historyRepo2.getAllDiscussions('com_restart_orphan');
      expect(discussions.length).toBe(1);
      expect(discussions[0].replies.length).toBe(1);
      expect(discussions[0].replies[0].content).toBe('Reply waiting across restart');
    });

    it('12b. Consecutive message merging idempotency: replay of merged message does not duplicate content', async () => {
      const ingestionRepo = new DurableFileIngestionEventRepository(ingestionFile);
      const historyRepo = new DurableFileCommunityHistoryRepository(historyFile, false);
      const integrationRepo = new DurableFileCommunityIntegrationRepository(integrationFile, [
        {
          id: 'int_merge_test',
          communityId: 'com_merge_test',
          providerType: 'telegram',
          providerCommunityId: '-100999000',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo, {
        multiMessageWindowMs: 5 * 60 * 1000,
      });

      // Message 1 from Alice
      const msg1: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_seq_1',
        externalMessageId: 'msg_seq_1',
        eventType: 'message_created',
        author: { externalUserId: 'user_alice', displayName: 'Alice' },
        content: 'Part 1: Overview of zero-knowledge proofs.',
        timestamp: new Date('2026-08-28T11:00:00Z'),
      };
      await service.ingestEvent(msg1);

      // Message 2 from Alice (sent 30s later, within 5 min window)
      const msg2: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_seq_2',
        externalMessageId: 'msg_seq_2',
        eventType: 'message_created',
        author: { externalUserId: 'user_alice', displayName: 'Alice' },
        content: 'Part 2: Practical implementation with Circom.',
        timestamp: new Date('2026-08-28T11:00:30Z'),
      };
      await service.ingestEvent(msg2);

      let discussions = await historyRepo.getAllDiscussions('com_merge_test');
      expect(discussions.length).toBe(1);
      expect(discussions[0].content).toContain('Part 1: Overview of zero-knowledge proofs.');
      expect(discussions[0].content).toContain('Part 2: Practical implementation with Circom.');
      expect(discussions[0].sourceProvenance?.mergedExternalMessageIds).toContain('msg_seq_2');

      // Replay / retry of msg2 after partial recovery
      const msg2Replay: ExternalCommunitySourceEvent = {
        ...msg2,
        externalEventId: 'upd_seq_2_retry', // New event ID simulating webhook redelivery
      };
      await service.ingestEvent(msg2Replay);

      discussions = await historyRepo.getAllDiscussions('com_merge_test');
      expect(discussions.length).toBe(1);
      // Content should NOT be duplicated again
      const occurrences = (discussions[0].content.match(/Part 2: Practical implementation/g) || []).length;
      expect(occurrences).toBe(1);
    });
  });

  // --- 13. CROSS-COMMUNITY IDENTITY ISOLATION ---
  describe('13. Cross-Community Identity Isolation', () => {
    it('13. Deliberately identical update_ids, message_ids, and user_ids across distinct chats do NOT collide', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository([
        {
          id: 'int_chat_a',
          communityId: 'com_cohort_alpha',
          providerType: 'telegram',
          providerCommunityId: '-100111',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: 'int_chat_b',
          communityId: 'com_cohort_beta',
          providerType: 'telegram',
          providerCommunityId: '-100222',
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);

      // Event in Community A
      const eventA: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100111',
        externalEventId: '99999', // Identical event ID
        externalMessageId: '555', // Identical message ID
        eventType: 'message_created',
        author: { externalUserId: '42', displayName: 'Shared User ID' },
        content: 'Content strictly in Community A',
        timestamp: new Date('2026-08-28T10:40:00Z'),
      };

      // Event in Community B
      const eventB: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100222',
        externalEventId: '99999', // Identical event ID
        externalMessageId: '555', // Identical message ID
        eventType: 'message_created',
        author: { externalUserId: '42', displayName: 'Shared User ID' },
        content: 'Content strictly in Community B',
        timestamp: new Date('2026-08-28T10:40:00Z'),
      };

      const resA = await service.ingestEvent(eventA);
      const resB = await service.ingestEvent(eventB);

      expect(resA.outcome).toBe('processed');
      expect(resB.outcome).toBe('processed');
      expect(resA.eventKey).toBe('telegram:-100111:99999');
      expect(resB.eventKey).toBe('telegram:-100222:99999');

      const discussionsA = await historyRepo.getAllDiscussions('com_cohort_alpha');
      const discussionsB = await historyRepo.getAllDiscussions('com_cohort_beta');

      expect(discussionsA.length).toBe(1);
      expect(discussionsA[0].content).toBe('Content strictly in Community A');
      expect(discussionsA[0].id).toBe('disc_telegram__100111_555');

      expect(discussionsB.length).toBe(1);
      expect(discussionsB[0].content).toBe('Content strictly in Community B');
      expect(discussionsB[0].id).toBe('disc_telegram__100222_555');
    });
  });

  // --- 14 & 15. DURABLE STORAGE CORRUPTION & WRITE QUEUE RECOVERY ---
  describe('14 & 15. Durable Storage Corruption & Write Queue Recovery', () => {
    it('14. Malformed/empty JSON file gracefully falls back to default factory without unhandled crashes', async () => {
      const corruptFile = path.join(tempDir, 'corrupt.json');
      fs.writeFileSync(corruptFile, '{"incomplete_json: [invalid');

      const storage = new DurableFileStorage<{ count: number }>(corruptFile, () => ({ count: 0 }));
      const readData = await storage.read();

      expect(readData).toEqual({ count: 0 });
    });

    it('15. Transient write failure does not poison future writes in DurableFileStorage queue', async () => {
      const testFile = path.join(tempDir, 'queue_test.json');
      const storage = new DurableFileStorage<{ value: string }>(testFile, () => ({ value: 'initial' }));

      await storage.write({ value: 'v1' });

      // Mock writeDirectly to fail on next call
      const originalWriteDirectly = (storage as any).writeDirectly.bind(storage);
      let failNext = true;
      (storage as any).writeDirectly = async (data: any) => {
        if (failNext) {
          failNext = false;
          throw new Error('Simulated disk full / EACCES error');
        }
        return originalWriteDirectly(data);
      };

      // Call write which rejects
      await expect(storage.write({ value: 'v2_failed' })).rejects.toThrow('Simulated disk full');

      // Subsequent write MUST succeed and not be permanently blocked by previous rejection
      await storage.write({ value: 'v3_recovered' });
      const current = await storage.read();
      expect(current.value).toBe('v3_recovered');
    });

    it('15b. Mutate failure invalidates in-memory cache and prevents dirty state retention', async () => {
      const testFile = path.join(tempDir, 'mutate_cache_test.json');
      const storage = new DurableFileStorage<{ count: number }>(testFile, () => ({ count: 10 }));
      await storage.write({ count: 20 });

      // Execute a mutator that modifies the in-memory object then throws
      await expect(
        storage.mutate((data) => {
          data.count = 999; // dirty mutation
          throw new Error('Mutation aborted halfway');
        })
      ).rejects.toThrow('Mutation aborted halfway');

      // Subsequent read MUST return persisted state (count: 20), not dirty state (999)
      const dataAfter = await storage.read();
      expect(dataAfter.count).toBe(20);
    });
  });

  // --- 16. CROSS-REPOSITORY PARTIAL STATE & RETRY IDEMPOTENCY ---
  describe('16. Cross-Repository Partial State & Retry Invariant', () => {
    it('16. Failure after history write before ingestion status update is safely recovered on retry without duplicate discussions', async () => {
      const ingestionRepo = new MockIngestionEventRepository();
      const historyRepo = new MockCommunityHistoryRepository();
      const integrationRepo = new MockCommunityIntegrationRepository();

      const service = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo, {
        fallbackCommunityId: 'com_partial_state',
      });

      const event: ExternalCommunitySourceEvent = {
        provider: 'telegram',
        externalCommunityId: '-100999000',
        externalEventId: 'upd_partial_state_1',
        externalMessageId: 'msg_partial_1',
        eventType: 'message_created',
        author: { externalUserId: 'user_jack', displayName: 'Jack' },
        content: 'Testing crash between history write and status update',
        timestamp: new Date('2026-08-28T10:45:00Z'),
      };

      // 1. Simulate crash right after history save (status remains 'processing')
      await ingestionRepo.claimEvent('telegram', '-100999000', 'upd_partial_state_1');
      await historyRepo.saveDiscussion({
        id: 'disc_telegram__100999000_msg_partial_1',
        communityId: 'com_partial_state',
        roadmapItemId: 'general',
        topicTitle: 'General',
        author: { id: 'user_jack', name: 'Jack', avatarUrl: '', role: 'member' },
        title: 'Testing crash between history write',
        content: 'Testing crash between history write and status update',
        type: 'discussion',
        signalQuality: 'high_signal',
        createdAt: new Date('2026-08-28T10:45:00Z'),
        isDeleted: false,
        sourceProvenance: {
          provider: 'telegram',
          externalCommunityId: '-100999000',
          externalMessageId: 'msg_partial_1',
          originalTimestamp: new Date('2026-08-28T10:45:00Z'),
          ingestedAt: new Date(),
          rawEventIds: ['upd_partial_state_1'],
        },
        resources: [],
        replies: [],
        replyCount: 0,
      });

      // Status is still 'processing' (unfinalized crash)
      const unfinalized = await ingestionRepo.findByEventKey('telegram:-100999000:upd_partial_state_1');
      expect(unfinalized?.status).toBe('processing');

      // 2. Telegram retries delivery with short stale timeout
      const retryService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo, {
        fallbackCommunityId: 'com_partial_state',
        staleTimeoutMs: 0, // force immediate stale recovery
      });

      const retryResult = await retryService.ingestEvent(event);
      expect(retryResult.outcome).toBe('processed');

      // Verify discussions: EXACTLY 1 discussion exists (NO duplicate was created)
      const discussions = await historyRepo.getAllDiscussions('com_partial_state');
      expect(discussions.length).toBe(1);
      expect(discussions[0].content).toBe('Testing crash between history write and status update');

      const finalized = await ingestionRepo.findByEventKey('telegram:-100999000:upd_partial_state_1');
      expect(finalized?.status).toBe('processed');
    });
  });

  // --- 17, 18, 19 & 20. WEBHOOK HTTP SEMANTICS & FULL END-TO-END PIPELINE ---
  describe('17, 18, 19 & 20. Webhook HTTP Semantics & Full End-to-End Pipeline', () => {
    const config = validateTelegramConfig({
      botToken: '123456789:ABCDefGhIjKlMnOpQrStUvWxYz',
      authorizedChatIds: new Set([TEST_CHAT_ID_STRING]),
      webhookSecret: TEST_SECRET,
    });

    it('17 & 18. Secret verification: 401 on bad/missing secret, timing safe rejection', async () => {
      const handler = new TelegramWebhookHandler(config);

      const noSecret = await handler.processWebhook({}, FIXTURE_TELEGRAM_UPDATE_001);
      expect(noSecret.statusCode).toBe(401);
      expect(noSecret.body.error).toBe('Unauthorized');

      const badSecret = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': 'wrong_secret_token' },
        FIXTURE_TELEGRAM_UPDATE_001
      );
      expect(badSecret.statusCode).toBe(401);
      expect(badSecret.body.error).toBe('Unauthorized');
    });

    it('19. Malformed payload returns 400 Bad Request', async () => {
      const handler = new TelegramWebhookHandler(config);

      const res = await handler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        { not_a_valid_update: true }
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });

    it('20. End-to-end: Raw Telegram Webhook -> Validator -> Adapter -> Ingestion Service -> Durable Repos -> History Service Read Model', async () => {
      const ingestionRepo = new DurableFileIngestionEventRepository(ingestionFile);
      const historyRepo = new DurableFileCommunityHistoryRepository(historyFile, false);
      const integrationRepo = new DurableFileCommunityIntegrationRepository(integrationFile, [
        {
          id: 'int_e2e',
          communityId: 'com_e2e_proof',
          providerType: 'telegram',
          providerCommunityId: TEST_CHAT_ID_STRING,
          isActive: true,
          metadata: {},
          createdAt: new Date(),
        },
      ]);
      const membershipRepo: IMembershipRepository = {
        async getCommunity(communityId: string) {
          return {
            id: communityId,
            name: 'ZK Research Cohort',
            description: 'Advanced cryptography group',
            categoryId: 'cat_tech',
            creatorId: 'user_creator_e2e',
            skillLevel: 'Advanced',
            status: 'active',
            tags: ['zk', 'crypto'],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
        async getPlan() { return null; },
        async getPlansForCommunity() { return []; },
        async getMembership(userId: string, communityId: string) {
          return {
            id: 'mem_e2e',
            userId,
            communityId,
            planId: 'plan_free',
            role: 'member',
            status: 'active' as const,
            joinedAt: new Date(),
          };
        },
        async createMembership() {},
        async initializeProgress() {},
        async getRoadmapItemIds() { return []; },
      };

      const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
      const historyService = new CommunityHistoryService(historyRepo, membershipRepo);
      const webhookHandler = new TelegramWebhookHandler(config, ingestionService);

      // Seed topic in history
      await historyRepo.saveHistoricalTopic({
        id: 'topic_general',
        communityId: 'com_e2e_proof',
        roadmapItemId: 'general',
        orderIndex: 1,
        topicTitle: 'General Architecture',
        description: 'Core concepts and memory persistence in decentralized agents',
        status: 'current',
        startedAt: new Date('2026-08-01T00:00:00Z'),
        keyIdea: 'Contextual memory and persistent state management',
        summary: 'Deep dive into decentralized systems and state mechanics',
      });

      // 1. Post initial root question update via webhook
      const req1 = await webhookHandler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_002_QUESTION
      );
      expect(req1.statusCode).toBe(200);
      expect(req1.body.action).toBe('processed');

      // 2. Post reply update via webhook
      const req2 = await webhookHandler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_003_REPLY
      );
      expect(req2.statusCode).toBe(200);
      expect(req2.body.action).toBe('processed');

      // 3. Post duplicate webhook delivery (simulating Telegram retry)
      const req3 = await webhookHandler.processWebhook(
        { 'x-telegram-bot-api-secret-token': TEST_SECRET },
        FIXTURE_TELEGRAM_UPDATE_002_QUESTION
      );
      expect(req3.statusCode).toBe(200);
      expect(req3.body.action).toBe('duplicate_ignored');

      // 4. Query high-level CommunityHistoryService read model (as creator)
      const historyModel = await historyService.getCommunityHistory('user_creator_e2e', 'com_e2e_proof');
      expect(historyModel).toBeDefined();
      expect(historyModel?.totalDiscussions).toBe(1); // 1 root discussion with attached reply

      const discussion = historyModel?.timeline[0]?.discussions[0];
      expect(discussion).toBeDefined();
      expect(discussion?.author.name).toBe('Elena Rostova');
      expect(discussion?.type).toBe('question');
      expect(discussion?.content).toBe('Can someone explain how AI agents use memory?');
      expect(discussion?.replies.length).toBe(1);
      expect(discussion?.replies[0].author.name).toBe('Marcus Vance');
      expect(discussion?.replies[0].content).toBe('I think persistent memory is important for maintaining context.');

      // 5. Verify ingestion events repository state
      const events = await ingestionRepo.getAllEvents();
      expect(events.length).toBe(2);
      expect(events.every((e) => e.status === 'processed')).toBe(true);
    });
  });
});

