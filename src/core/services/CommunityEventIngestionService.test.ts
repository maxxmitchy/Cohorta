import { describe, it, expect, beforeEach } from 'vitest';
import { CommunityEventIngestionService } from './CommunityEventIngestionService';
import { MockIngestionEventRepository } from '../../infrastructure/db/mock/MockIngestionEventRepository';
import { MockCommunityHistoryRepository } from '../../infrastructure/db/mock/MockCommunityHistoryRepository';
import { MockCommunityIntegrationRepository } from '../../infrastructure/db/mock/MockCommunityIntegrationRepository';
import { ExternalCommunitySourceEvent } from '../source/ExternalCommunitySourceEvent';

describe('CommunityEventIngestionService — Persistent Idempotent Ingestion', () => {
  let ingestionRepo: MockIngestionEventRepository;
  let historyRepo: MockCommunityHistoryRepository;
  let integrationRepo: MockCommunityIntegrationRepository;
  let ingestionService: CommunityEventIngestionService;

  beforeEach(() => {
    ingestionRepo = new MockIngestionEventRepository();
    historyRepo = new MockCommunityHistoryRepository(false); // empty history for testing
    integrationRepo = new MockCommunityIntegrationRepository([
      {
        id: 'int_tg_1001',
        communityId: 'com_ai_builders',
        providerType: 'telegram',
        providerCommunityId: '-1001999999999',
        isActive: true,
        metadata: { credentialsRef: 'env:TELEGRAM_BOT_TOKEN', syncIntervalMinutes: 5 },
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'int_tg_1002',
        communityId: 'com_rust_systems',
        providerType: 'telegram',
        providerCommunityId: '-1001888888888',
        isActive: true,
        metadata: { credentialsRef: 'env:TELEGRAM_BOT_TOKEN', syncIntervalMinutes: 5 },
        createdAt: new Date('2026-01-01'),
      },
    ]);

    ingestionService = new CommunityEventIngestionService(
      ingestionRepo,
      historyRepo,
      integrationRepo,
      { fallbackCommunityId: 'com_fallback' }
    );
  });

  it('1. Ingests a new root message and persists normalized discussion', async () => {
    const event: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_1001',
      externalMessageId: 'msg_501',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T10:00:00Z'),
      author: {
        externalUserId: 'user_123',
        displayName: 'Alice Engineer',
        roleHint: 'member',
      },
      content: 'How do we design deterministic state machines for autonomous LLM agents?',
      topicHint: 'Agent Foundations',
      metadata: {
        rawChatType: 'supergroup',
      },
    };

    const result = await ingestionService.ingestEvent(event);

    expect(result.outcome).toBe('processed');
    expect(result.eventKey).toBe('telegram:-1001999999999:upd_1001');

    // Verify ingestion record state
    const record = await ingestionRepo.findByEventKey('telegram:-1001999999999:upd_1001');
    expect(record).not.toBeNull();
    expect(record?.status).toBe('processed');
    expect(record?.processedAt).toBeDefined();

    // Verify discussion in history repository
    const discussions = await historyRepo.getAllDiscussions('com_ai_builders');
    expect(discussions).toHaveLength(1);
    const disc = discussions[0];
    expect(disc.id).toContain('msg_501');
    expect(disc.communityId).toBe('com_ai_builders');
    expect(disc.author.name).toBe('Alice Engineer');
    expect(disc.content).toContain('How do we design deterministic state machines');
    expect(disc.type).toBe('question');
    expect(disc.signalQuality).toBe('high_signal');
    expect(disc.sourceProvenance?.provider).toBe('telegram');
    expect(disc.sourceProvenance?.externalMessageId).toBe('msg_501');
  });

  it('2. Enforces idempotency when the exact same event arrives twice', async () => {
    const event: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_1002',
      externalMessageId: 'msg_502',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T10:05:00Z'),
      author: {
        externalUserId: 'user_456',
        displayName: 'Bob Architect',
      },
      content: 'Here is our new evaluation framework: https://github.com/example/agent-eval',
      topicHint: 'Agent Evaluation',
    };

    // First ingestion
    const firstResult = await ingestionService.ingestEvent(event);
    expect(firstResult.outcome).toBe('processed');

    // Duplicate ingestion (e.g. Telegram webhook retry)
    const secondResult = await ingestionService.ingestEvent(event);
    expect(secondResult.outcome).toBe('duplicate_ignored');
    expect(secondResult.eventKey).toBe('telegram:-1001999999999:upd_1002');

    // Ensure no duplicate discussion was created
    const discussions = await historyRepo.getAllDiscussions('com_ai_builders');
    expect(discussions).toHaveLength(1);
  });

  it('3. Preserves cross-community isolation when message IDs match across different chats', async () => {
    // Chat 1: AI Builders receives message ID 999
    const eventCommunity1: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_999_chat1',
      externalMessageId: '999',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T11:00:00Z'),
      author: { externalUserId: 'u1', displayName: 'AI Specialist' },
      content: 'Discussion about AI vector stores in AI Builders community.',
    };

    // Chat 2: Rust Systems receives the same message ID 999
    const eventCommunity2: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001888888888',
      externalEventId: 'upd_999_chat2',
      externalMessageId: '999',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T11:00:00Z'),
      author: { externalUserId: 'u2', displayName: 'Rust Developer' },
      content: 'Discussion about Tokio async runtimes in Rust Systems community.',
    };

    const res1 = await ingestionService.ingestEvent(eventCommunity1);
    const res2 = await ingestionService.ingestEvent(eventCommunity2);

    expect(res1.outcome).toBe('processed');
    expect(res2.outcome).toBe('processed');

    const chat1Discussions = await historyRepo.getAllDiscussions('com_ai_builders');
    const chat2Discussions = await historyRepo.getAllDiscussions('com_rust_systems');

    expect(chat1Discussions).toHaveLength(1);
    expect(chat2Discussions).toHaveLength(1);

    expect(chat1Discussions[0].content).toContain('AI vector stores');
    expect(chat2Discussions[0].content).toContain('Tokio async runtimes');
    expect(chat1Discussions[0].communityId).toBe('com_ai_builders');
    expect(chat2Discussions[0].communityId).toBe('com_rust_systems');
  });

  it('4. Handles message edits cleanly in-place without creating duplicate discussions', async () => {
    // 1. Initial message
    const createEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_edit_1',
      externalMessageId: 'msg_edit_test',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T12:00:00Z'),
      author: { externalUserId: 'u_editor', displayName: 'Carol Editor' },
      content: 'Draft note on LanceDB embeddings.',
    };

    await ingestionService.ingestEvent(createEvent);

    let discussions = await historyRepo.getAllDiscussions('com_ai_builders');
    expect(discussions).toHaveLength(1);
    expect(discussions[0].content).toBe('Draft note on LanceDB embeddings.');
    expect(discussions[0].sourceProvenance?.isEdited).toBeFalsy();
    expect(discussions[0].resources).toHaveLength(0);

    // 2. Message Edit event arrives (with updated text, new link, different update_id)
    const editEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_edit_2',
      externalMessageId: 'msg_edit_test',
      eventType: 'message_edited',
      timestamp: new Date('2026-03-01T12:05:00Z'),
      author: { externalUserId: 'u_editor', displayName: 'Carol Editor' },
      content: 'Comprehensive benchmark on LanceDB vs pgvector with code: https://github.com/lancedb/lancedb',
    };

    const editResult = await ingestionService.ingestEvent(editEvent);
    expect(editResult.outcome).toBe('processed');

    // Check history: still exactly 1 discussion, updated in-place
    discussions = await historyRepo.getAllDiscussions('com_ai_builders');
    expect(discussions).toHaveLength(1);
    const updatedDisc = discussions[0];
    expect(updatedDisc.content).toContain('Comprehensive benchmark on LanceDB');
    expect(updatedDisc.sourceProvenance?.isEdited).toBe(true);
    expect(updatedDisc.sourceProvenance?.editedAt).toEqual(new Date('2026-03-01T12:05:00Z'));
    expect(updatedDisc.sourceProvenance?.rawEventIds).toContain('upd_edit_1');
    expect(updatedDisc.sourceProvenance?.rawEventIds).toContain('upd_edit_2');
    expect(updatedDisc.resources).toHaveLength(1);
    expect(updatedDisc.resources[0].url).toBe('https://github.com/lancedb/lancedb');
  });

  it('5. Handles message replies and associates them with parent discussions', async () => {
    // 1. Root discussion
    const rootEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_root_1',
      externalMessageId: 'msg_parent_100',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T13:00:00Z'),
      author: { externalUserId: 'u_root', displayName: 'Dave Developer' },
      content: 'What is the recommended timeout budget for web search tools in LangChain?',
    };

    await ingestionService.ingestEvent(rootEvent);

    // 2. Reply to root discussion
    const replyEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_reply_1',
      externalMessageId: 'msg_reply_200',
      externalParentMessageId: 'msg_parent_100',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T13:02:00Z'),
      author: { externalUserId: 'u_replier', displayName: 'Eve Expert' },
      content: 'We set a hard timeout of 8 seconds with a 2-second fallback cache. See https://github.com/langchain-ai/langchain for details.',
      metadata: {
        isAnswerHint: true,
        stanceHint: 'supporting',
      },
    };

    const replyResult = await ingestionService.ingestEvent(replyEvent);
    expect(replyResult.outcome).toBe('processed');

    const discussions = await historyRepo.getAllDiscussions('com_ai_builders');
    expect(discussions).toHaveLength(1);

    const parent = discussions[0];
    expect(parent.replyCount).toBe(1);
    expect(parent.replies).toHaveLength(1);

    const reply = parent.replies[0];
    expect(reply.id).toContain('msg_reply_200');
    expect(reply.author.name).toBe('Eve Expert');
    expect(reply.content).toContain('hard timeout of 8 seconds');
    expect(reply.isAnswer).toBe(true);

    // Resource from reply is added to parent
    expect(parent.resources.some((r) => r.url.includes('github.com/langchain-ai/langchain'))).toBe(true);
  });

  it('6. Reconciles out-of-order replies when reply arrives before parent', async () => {
    // 1. Reply arrives FIRST (out-of-order)
    const replyFirstEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_ooo_reply',
      externalMessageId: 'msg_ooo_reply_50',
      externalParentMessageId: 'msg_ooo_root_10',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T14:02:00Z'),
      author: { externalUserId: 'u_fast', displayName: 'Fast Replier' },
      content: 'Agree, we should use pgvector with HNSW index.',
    };

    await ingestionService.ingestEvent(replyFirstEvent);

    // Discussion stored temporarily as placeholder/orphan
    let discussions = await historyRepo.getAllDiscussions('com_ai_builders');
    expect(discussions).toHaveLength(1);
    expect(discussions[0].sourceProvenance?.hasMissingParent).toBe(true);

    // 2. Parent arrives LATER
    const rootLateEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_ooo_root',
      externalMessageId: 'msg_ooo_root_10',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T14:00:00Z'),
      author: { externalUserId: 'u_orig', displayName: 'Original Author' },
      content: 'Should we index our embeddings using IVFFlat or HNSW?',
    };

    await ingestionService.ingestEvent(rootLateEvent);

    // Reconciled: exactly 1 root discussion with the reply attached
    discussions = await historyRepo.getAllDiscussions('com_ai_builders');
    expect(discussions).toHaveLength(1);

    const rootDisc = discussions[0];
    expect(rootDisc.id).toContain('msg_ooo_root_10');
    expect(rootDisc.content).toContain('Should we index our embeddings');
    expect(rootDisc.replyCount).toBe(1);
    expect(rootDisc.replies).toHaveLength(1);
    expect(rootDisc.replies[0].content).toContain('Agree, we should use pgvector');
  });

  it('7. Handles message deletion (tombstoning)', async () => {
    // 1. Create message
    const createEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_del_1',
      externalMessageId: 'msg_to_delete',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T15:00:00Z'),
      author: { externalUserId: 'u_del', displayName: 'User Delete' },
      content: 'This message will be deleted: https://spam.example.com',
    };

    await ingestionService.ingestEvent(createEvent);

    let discussions = await historyRepo.getAllDiscussions('com_ai_builders');
    expect(discussions[0].isDeleted).toBe(false);

    // 2. Delete message
    const deleteEvent: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_del_2',
      externalMessageId: 'msg_to_delete',
      eventType: 'message_deleted',
      timestamp: new Date('2026-03-01T15:05:00Z'),
    };

    const deleteResult = await ingestionService.ingestEvent(deleteEvent);
    expect(deleteResult.outcome).toBe('processed');

    discussions = await historyRepo.getAllDiscussions('com_ai_builders');
    expect(discussions[0].isDeleted).toBe(true);
    expect(discussions[0].resources).toHaveLength(0);
  });

  it('8. Safe failure handling and retry recovery', async () => {
    const event: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-1001999999999',
      externalEventId: 'upd_fail_retry',
      externalMessageId: 'msg_fail_retry',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T16:00:00Z'),
      author: { externalUserId: 'u_test', displayName: 'Tester' },
      content: 'Testing retry behavior after transient database failure.',
    };

    // Simulate transient failure by making historyRepo.saveDiscussion throw once
    let throwError = true;
    const originalSave = historyRepo.saveDiscussion.bind(historyRepo);
    historyRepo.saveDiscussion = async (disc) => {
      if (throwError) {
        throw new Error('Simulated transient DB connection timeout');
      }
      return originalSave(disc);
    };

    // First attempt fails
    const failResult = await ingestionService.ingestEvent(event);
    expect(failResult.outcome).toBe('failed');
    expect(failResult.error).toContain('Simulated transient DB connection timeout');

    // Ingestion record marked as failed
    let record = await ingestionRepo.findByEventKey('telegram:-1001999999999:upd_fail_retry');
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe('Simulated transient DB connection timeout');

    // Second attempt (retry) after DB heals
    throwError = false;
    const retryResult = await ingestionService.ingestEvent(event);
    expect(retryResult.outcome).toBe('processed');

    record = await ingestionRepo.findByEventKey('telegram:-1001999999999:upd_fail_retry');
    expect(record?.status).toBe('processed');
    expect(record?.retryCount).toBeGreaterThanOrEqual(2);
  });
});
