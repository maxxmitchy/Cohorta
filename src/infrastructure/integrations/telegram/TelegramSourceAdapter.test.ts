import { describe, it, expect } from 'vitest';
import { TelegramSourceAdapter } from './TelegramSourceAdapter';
import { validateTelegramConfig, loadTelegramConfigFromEnv } from './TelegramConfig';
import { HttpTelegramClient } from './HttpTelegramClient';
import { CommunityHistoryNormalizer } from '../../../core/source/CommunityHistoryNormalizer';
import { DiscussionEvidenceAnalyzer } from '../../../core/evidence/DiscussionEvidenceAnalyzer';
import { CatchUpService } from '../../../core/services/CatchUpService';
import { ICommunityHistoryQueryRepository } from '../../../core/repositories/ICommunityHistoryQueryRepository';
import { IMembershipRepository } from '../../../core/repositories/IMembershipRepository';
import { MockCatchUpGenerator } from '../../ai/MockCatchUpGenerator';
import { Community } from '../../../core/domain/community';
import { Membership } from '../../../core/domain/membership';
import { HistoricalTopicEvent } from '../../../core/domain/history';
import {
  FIXTURE_TELEGRAM_UPDATE_001,
  FIXTURE_TELEGRAM_UPDATE_002_QUESTION,
  FIXTURE_TELEGRAM_UPDATE_003_REPLY,
  FIXTURE_TELEGRAM_UPDATE_PRIVATE_START,
  FIXTURE_TELEGRAM_UPDATE_UNAUTHORIZED,
  FIXTURE_TELEGRAM_UPDATE_EDITED,
  FIXTURE_TELEGRAM_UPDATE_RESOURCE,
  FIXTURE_TELEGRAM_UPDATE_STICKER_NO_TEXT,
  FIXTURE_TELEGRAM_UPDATE_TOPIC_RESEMBLING_CHAT_TITLE,
  TEST_CHAT_ID_STRING,
} from './TelegramFixtures';

describe('Phase 13.1 — Telegram Boundary Hardening & Identity Integrity', () => {
  const testConfig = validateTelegramConfig({
    authorizedChatIds: new Set([TEST_CHAT_ID_STRING]),
  });

  describe('1. Fail-Closed Telegram Configuration & Boundary Isolation', () => {
    it('TEST 1.A: Missing authorizedChatIds throws configuration error', () => {
      expect(() => {
        validateTelegramConfig({});
      }).toThrow('authorizedChatIds must be provided and cannot be empty');
    });

    it('TEST 1.B: Empty authorizedChatIds throws configuration error', () => {
      expect(() => {
        validateTelegramConfig({ authorizedChatIds: new Set() });
      }).toThrow('authorizedChatIds must contain at least one authorized chat ID');
    });

    it('TEST 1.C: Malformed non-numeric chat ID throws configuration error', () => {
      expect(() => {
        validateTelegramConfig({ authorizedChatIds: new Set(['not-a-numeric-chat-id']) });
      }).toThrow('Invalid Telegram chat ID format "not-a-numeric-chat-id". Telegram chat IDs must be numeric strings');
    });

    it('TEST 1.D: Valid multiple chat IDs are accepted', () => {
      const config = validateTelegramConfig({
        authorizedChatIds: new Set(['-5456731754', '-100987654321', '123456789']),
      });
      expect(config.authorizedChatIds.size).toBe(3);
      expect(config.authorizedChatIds.has('-5456731754')).toBe(true);
      expect(config.authorizedChatIds.has('-100987654321')).toBe(true);
      expect(config.authorizedChatIds.has('123456789')).toBe(true);
    });

    it('TEST 1.E: loadTelegramConfigFromEnv throws when TELEGRAM_ALLOWED_CHAT_IDS is missing or empty (fails closed)', () => {
      expect(() => {
        loadTelegramConfigFromEnv({});
      }).toThrow('TELEGRAM_ALLOWED_CHAT_IDS environment variable is required and cannot be empty. System fails closed');

      expect(() => {
        loadTelegramConfigFromEnv({ TELEGRAM_ALLOWED_CHAT_IDS: '   ' });
      }).toThrow('TELEGRAM_ALLOWED_CHAT_IDS environment variable is required and cannot be empty. System fails closed');
    });

    it('TEST 1.F: loadTelegramConfigFromEnv parses comma-separated allowed chats and does not insert default test chat', () => {
      const config = loadTelegramConfigFromEnv({
        TELEGRAM_ALLOWED_CHAT_IDS: '-100111111111, -100222222222',
      });
      expect(config.authorizedChatIds.size).toBe(2);
      expect(config.authorizedChatIds.has('-100111111111')).toBe(true);
      expect(config.authorizedChatIds.has('-100222222222')).toBe(true);
      expect(config.authorizedChatIds.has(TEST_CHAT_ID_STRING)).toBe(false);
    });

    it('TEST 1.G: HttpTelegramClient throws if botToken is missing when instantiated', () => {
      expect(() => {
        new HttpTelegramClient(testConfig);
      }).toThrow('HttpTelegramClient requires a valid botToken in TelegramConfig');
    });

    it('TEST 1.H: Redacts botToken in HttpTelegramClient transport errors without leaking credentials', async () => {
      const secretToken = '123456:ABC-SECRET_TOKEN-XYZ';
      const configWithSecret = validateTelegramConfig({
        botToken: secretToken,
        authorizedChatIds: new Set([TEST_CHAT_ID_STRING]),
      });

      const client = new HttpTelegramClient(configWithSecret);

      // Mock fetch returning an error containing the bot token in description
      const originalFetch = global.fetch;
      global.fetch = async () => {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            ok: false,
            error_code: 401,
            description: `Unauthorized: token ${secretToken} was rejected`,
          }),
        } as unknown as Response;
      };

      try {
        await client.getMe();
        expect.unreachable('Should have failed');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).not.toContain(secretToken);
        expect(msg).toContain('***REDACTED***');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('2. Configuration Purity & Topic Purity (No Domain Leakage)', () => {
    it('TEST 2: TelegramConfig contains NO Cohorta learning/domain mapping properties', () => {
      const config = validateTelegramConfig({
        authorizedChatIds: new Set([TEST_CHAT_ID_STRING]),
      });

      // Verification that domain concepts are excluded from transport config
      expect(config).not.toHaveProperty('defaultRoadmapItemId');
      expect(config).not.toHaveProperty('communityIdMapper');
      expect(config).not.toHaveProperty('roadmapMappings');
    });

    it('TEST 3: Telegram chat title is NOT interpreted as a learning topic (topicHint is undefined)', () => {
      const event = TelegramSourceAdapter.adaptUpdate(
        FIXTURE_TELEGRAM_UPDATE_TOPIC_RESEMBLING_CHAT_TITLE,
        testConfig
      );

      expect(event).not.toBeNull();
      expect(event?.topicHint).toBeUndefined();
      expect(event?.roadmapItemId).toBeUndefined();
      // Chat title is preserved solely in platform metadata, not as a domain learning topic
      expect(event?.metadata?.telegramChatTitle).toBe('Advanced Reinforcement Learning & Policy Optimization');
      expect(event?.content).toBe('Welcome everyone! Today we discuss PPO convergence guarantees.');
    });
  });

  describe('3. External Identity Semantics (Update ID vs Message ID vs Community Scope)', () => {
    it('TEST 4.A: Distinguishes update_id (event delivery) from message_id (message identity)', () => {
      const event = TelegramSourceAdapter.adaptUpdate(FIXTURE_TELEGRAM_UPDATE_001, testConfig);

      expect(event).not.toBeNull();
      expect(event?.externalEventId).toBe('10001'); // update_id
      expect(event?.externalMessageId).toBe('3'); // message_id
      expect(event?.externalCommunityId).toBe(TEST_CHAT_ID_STRING); // chat.id
    });

    it('TEST 4.B: Same message_id in different Telegram chats produces distinct isolated discussions', () => {
      const chatA = '-5456731754';
      const chatB = '-7777777777';

      const multiChatConfig = validateTelegramConfig({
        authorizedChatIds: new Set([chatA, chatB]),
      });

      const updateChatA = { ...FIXTURE_TELEGRAM_UPDATE_001 };
      const updateChatB = {
        ...FIXTURE_TELEGRAM_UPDATE_001,
        update_id: 20001,
        message: {
          ...FIXTURE_TELEGRAM_UPDATE_001.message!,
          chat: { id: -7777777777, type: 'group' as const, title: 'Cohort Beta' },
          text: 'Message in Beta with same message_id 3',
        },
      };

      const events = TelegramSourceAdapter.adaptUpdates([updateChatA, updateChatB], multiChatConfig);
      expect(events).toHaveLength(2);

      const discussionsA = CommunityHistoryNormalizer.normalize(
        events.filter(e => e.externalCommunityId === chatA),
        { communityIdMapper: () => 'com_alpha' }
      );
      const discussionsB = CommunityHistoryNormalizer.normalize(
        events.filter(e => e.externalCommunityId === chatB),
        { communityIdMapper: () => 'com_beta' }
      );

      expect(discussionsA[0].communityId).toBe('com_alpha');
      expect(discussionsB[0].communityId).toBe('com_beta');
      expect(discussionsA[0].content).toBe('Cohorta integration test 001');
      expect(discussionsB[0].content).toBe('Message in Beta with same message_id 3');
      expect(discussionsA[0].sourceProvenance?.externalCommunityId).toBe(chatA);
      expect(discussionsB[0].sourceProvenance?.externalCommunityId).toBe(chatB);
    });

    it('TEST 4.C: Message edit updates original message in-place without creating a second root discussion or getting swallowed', () => {
      const originalUpdate = FIXTURE_TELEGRAM_UPDATE_001; // message_id: 3, update_id: 10001
      const editedUpdate = FIXTURE_TELEGRAM_UPDATE_EDITED; // message_id: 3, update_id: 10006

      const events = TelegramSourceAdapter.adaptUpdates([originalUpdate, editedUpdate], testConfig);
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('message_created');
      expect(events[1].eventType).toBe('message_edited');
      expect(events[0].externalMessageId).toBe('3');
      expect(events[1].externalMessageId).toBe('3');

      const discussions = CommunityHistoryNormalizer.normalize(events, {
        communityIdMapper: () => 'com_telegram_test',
        defaultRoadmapItemId: 'r_memory_agents',
      });

      // Must produce exactly 1 discussion with updated content and edit provenance
      expect(discussions).toHaveLength(1);
      expect(discussions[0].content).toBe('Cohorta integration test 001 (Updated: verified agent pipeline)');
      expect(discussions[0].sourceProvenance?.isEdited).toBe(true);
      expect(discussions[0].sourceProvenance?.rawEventIds).toEqual(['10001', '10005']);
    });
  });

  describe('4. Telegram Adapter Mapping & Security Boundaries', () => {
    it('maps an ordinary group message (Fixture A: Message 3)', () => {
      const event = TelegramSourceAdapter.adaptUpdate(FIXTURE_TELEGRAM_UPDATE_001, testConfig);

      expect(event).not.toBeNull();
      expect(event?.provider).toBe('telegram');
      expect(event?.externalEventId).toBe('10001');
      expect(event?.externalCommunityId).toBe(TEST_CHAT_ID_STRING);
      expect(event?.externalMessageId).toBe('3');
      expect(event?.externalParentMessageId).toBeUndefined();
      expect(event?.eventType).toBe('message_created');
      expect(event?.content).toBe('Cohorta integration test 001');
      expect(event?.timestamp).toEqual(new Date(1708900000 * 1000));
      expect(event?.author).toEqual({
        externalUserId: '700101',
        displayName: 'Alex Rivera',
        roleHint: 'member',
      });
      expect(event?.metadata?.telegramChatType).toBe('group');
    });

    it('maps a question message (Fixture B: Message 4)', () => {
      const event = TelegramSourceAdapter.adaptUpdate(FIXTURE_TELEGRAM_UPDATE_002_QUESTION, testConfig);

      expect(event).not.toBeNull();
      expect(event?.externalMessageId).toBe('4');
      expect(event?.content).toBe('Can someone explain how AI agents use memory?');
      expect(event?.author?.displayName).toBe('Elena Rostova');
    });

    it('maps a reply message (Fixture C: Message 5) preserving parent reference to message 4', () => {
      const event = TelegramSourceAdapter.adaptUpdate(FIXTURE_TELEGRAM_UPDATE_003_REPLY, testConfig);

      expect(event).not.toBeNull();
      expect(event?.externalMessageId).toBe('5');
      expect(event?.externalParentMessageId).toBe('4');
      expect(event?.eventType).toBe('reply_created');
      expect(event?.content).toBe('I think persistent memory is important for maintaining context.');
      expect(event?.author?.displayName).toBe('Marcus Vance');
    });

    it('drops private direct messages (Fixture D: /start in private chat) to prevent leaking into community history', () => {
      const event = TelegramSourceAdapter.adaptUpdate(FIXTURE_TELEGRAM_UPDATE_PRIVATE_START, testConfig);
      expect(event).toBeNull();
    });

    it('drops messages from unauthorized chat IDs (Fixture E: unauthorized chat)', () => {
      const event = TelegramSourceAdapter.adaptUpdate(FIXTURE_TELEGRAM_UPDATE_UNAUTHORIZED, testConfig);
      expect(event).toBeNull();
    });

    it('extracts resource references and URLs from message entities (Fixture I)', () => {
      const event = TelegramSourceAdapter.adaptUpdate(FIXTURE_TELEGRAM_UPDATE_RESOURCE, testConfig);

      expect(event).not.toBeNull();
      expect(event?.resources).toHaveLength(2);
      expect(event?.resources?.[0]).toEqual({
        url: 'https://arxiv.org/abs/2305.18290',
        type: 'paper',
      });
      expect(event?.resources?.[1]).toEqual({
        url: 'https://github.com/agent-memory/core',
        type: 'github',
      });
    });

    it('handles sticker / uncaptioned media without fabricating fake text (Fixture J)', () => {
      const event = TelegramSourceAdapter.adaptUpdate(FIXTURE_TELEGRAM_UPDATE_STICKER_NO_TEXT, testConfig);

      expect(event).not.toBeNull();
      expect(event?.content).toBe('');
    });
  });

  describe('5. Normalization, Evidence & End-to-End Pipeline Regression', () => {
    it('normalizes Message 4 (Question) and Message 5 (Reply) into a unified Discussion tree', () => {
      const rawUpdates = [
        FIXTURE_TELEGRAM_UPDATE_001,
        FIXTURE_TELEGRAM_UPDATE_002_QUESTION,
        FIXTURE_TELEGRAM_UPDATE_003_REPLY,
      ];

      const adaptedEvents = TelegramSourceAdapter.adaptUpdates(rawUpdates, testConfig);
      expect(adaptedEvents).toHaveLength(3);

      const discussions = CommunityHistoryNormalizer.normalize(adaptedEvents, {
        communityIdMapper: () => 'com_telegram_cohort',
        defaultRoadmapItemId: 'r_memory_agents',
      });

      // Message 3 is one discussion, Message 4 + Message 5 form the second discussion with reply
      expect(discussions).toHaveLength(2);

      const questionDisc = discussions.find(d => d.sourceProvenance?.externalMessageId === '4');
      expect(questionDisc).toBeDefined();
      expect(questionDisc?.type).toBe('question');
      expect(questionDisc?.content).toBe('Can someone explain how AI agents use memory?');
      expect(questionDisc?.replyCount).toBe(1);
      expect(questionDisc?.replies).toHaveLength(1);

      const reply = questionDisc?.replies[0];
      expect(reply?.content).toBe('I think persistent memory is important for maintaining context.');
      expect(reply?.author.name).toBe('Marcus Vance');
      expect(reply?.sourceProvenance?.externalParentMessageId).toBe('4');
      expect(reply?.sourceProvenance?.externalMessageId).toBe('5');
    });

    it('tolerates out-of-order delivery from Telegram (Reply arriving before Question)', () => {
      const outOfOrderUpdates = [
        FIXTURE_TELEGRAM_UPDATE_003_REPLY, // message 5 first
        FIXTURE_TELEGRAM_UPDATE_002_QUESTION, // message 4 second
      ];

      const adaptedEvents = TelegramSourceAdapter.adaptUpdates(outOfOrderUpdates, testConfig);
      const discussions = CommunityHistoryNormalizer.normalize(adaptedEvents, {
        communityIdMapper: () => 'com_telegram_cohort',
        defaultRoadmapItemId: 'r_memory_agents',
      });

      expect(discussions).toHaveLength(1);
      const disc = discussions[0];
      expect(disc.sourceProvenance?.externalMessageId).toBe('4');
      expect(disc.replies).toHaveLength(1);
      expect(disc.replies[0].sourceProvenance?.externalMessageId).toBe('5');
    });

    it('handles duplicate Telegram update redelivery idempotently', () => {
      const duplicateUpdates = [
        FIXTURE_TELEGRAM_UPDATE_001,
        FIXTURE_TELEGRAM_UPDATE_001, // redelivery
        FIXTURE_TELEGRAM_UPDATE_002_QUESTION,
        FIXTURE_TELEGRAM_UPDATE_003_REPLY,
        FIXTURE_TELEGRAM_UPDATE_003_REPLY, // redelivery
      ];

      const adaptedEvents = TelegramSourceAdapter.adaptUpdates(duplicateUpdates, testConfig);
      const discussions = CommunityHistoryNormalizer.normalize(adaptedEvents, {
        communityIdMapper: () => 'com_telegram_cohort',
        defaultRoadmapItemId: 'r_memory_agents',
      });

      expect(discussions).toHaveLength(2);
      const questionDisc = discussions.find(d => d.sourceProvenance?.externalMessageId === '4');
      expect(questionDisc?.replies).toHaveLength(1);
    });

    it('verifies that Question + 1 opinion reply does NOT claim strong community consensus', () => {
      const rawUpdates = [
        FIXTURE_TELEGRAM_UPDATE_002_QUESTION,
        FIXTURE_TELEGRAM_UPDATE_003_REPLY,
      ];

      const adaptedEvents = TelegramSourceAdapter.adaptUpdates(rawUpdates, testConfig);
      const discussions = CommunityHistoryNormalizer.normalize(adaptedEvents, {
        communityIdMapper: () => 'com_telegram_cohort',
        defaultRoadmapItemId: 'r_memory_agents',
      });

      const questionDiscussion = discussions[0];
      const evidence = DiscussionEvidenceAnalyzer.analyzeDiscussion(questionDiscussion);

      expect(evidence.classification).toBe('unresolved_inquiry');
      expect(evidence.classification).not.toBe('strong_consensus');
      expect(evidence.classification).not.toBe('resolved_decision');
      expect(evidence.hasAnswer).toBe(false);
      expect(evidence.openQuestion).toBeDefined();
      expect(questionDiscussion.consensusStatus).not.toBe('resolved');
      expect(questionDiscussion.isResolved).toBeFalsy();
    });

    it('end-to-end flow: Telegram -> Adapter -> Normalizer -> CatchUpService', async () => {
      const rawUpdates = [
        FIXTURE_TELEGRAM_UPDATE_001,
        FIXTURE_TELEGRAM_UPDATE_002_QUESTION,
        FIXTURE_TELEGRAM_UPDATE_003_REPLY,
        FIXTURE_TELEGRAM_UPDATE_RESOURCE,
      ];

      const adaptedEvents = TelegramSourceAdapter.adaptUpdates(rawUpdates, testConfig);
      const discussions = CommunityHistoryNormalizer.normalize(adaptedEvents, {
        communityIdMapper: () => 'com_telegram_ai',
        defaultRoadmapItemId: 'r_memory_agents',
      });

      const mockCommunity: Community = {
        id: 'com_telegram_ai',
        name: 'AI Engineering Telegram Cohort',
        description: 'Cohort linked with Telegram group',
        creatorId: 'u_creator',
        categoryId: 'tech',
        skillLevel: 'Intermediate',
        status: 'active',
        tags: ['ai', 'telegram'],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        currentTopic: 'Active Topic',
      };

      const mockMembership: Membership = {
        id: 'mem_late_joiner',
        userId: 'u_late_joiner',
        communityId: 'com_telegram_ai',
        planId: 'plan_1',
        role: 'member',
        joinedAt: new Date('2024-03-01'),
        status: 'active',
      };

      const mockHistoricalTopic: HistoricalTopicEvent = {
        id: 'ht_1',
        communityId: 'com_telegram_ai',
        roadmapItemId: 'r_memory_agents',
        topicTitle: 'AI Agent Memory Architectures',
        description: 'Discussions on long-term agent context',
        orderIndex: 0,
        status: 'completed',
        startedAt: new Date('2024-02-20'),
        completedAt: new Date('2024-02-28'),
        keyIdea: 'Context persistence across LLM agent turns',
        summary: 'Community discussions exploring vector retrieval and persistent context stores.',
      };

      const mockHistoryRepo: ICommunityHistoryQueryRepository = {
        getHistoricalTopics: async () => [mockHistoricalTopic],
        getDiscussionsForTopic: async () => discussions,
        getDiscussionById: async (_cid, did) => discussions.find(d => d.id === did) || null,
        getCommunityHistory: async () => null,
      };

      const mockMembershipRepo: IMembershipRepository = {
        getMembership: async () => mockMembership,
        getCommunity: async () => mockCommunity,
        getPlan: async () => null,
        getPlansForCommunity: async () => [],
        createMembership: async () => {},
        initializeProgress: async () => {},
        getRoadmapItemIds: async () => ['r_memory_agents'],
      };

      const catchUpGenerator = new MockCatchUpGenerator();

      const catchUpService = new CatchUpService(
        mockHistoryRepo,
        mockMembershipRepo,
        catchUpGenerator
      );

      const briefing = await catchUpService.getCatchUp('u_late_joiner', 'com_telegram_ai');

      expect(briefing).toBeDefined();
      expect(briefing.missedTopicsCount).toBe(1);
      expect(briefing.missedTopics[0].title).toBe('AI Agent Memory Architectures');
      expect(briefing.missedTopics[0].topResources.length).toBeGreaterThan(0);

      const analyzedDiscussion = discussions.find(d => d.sourceProvenance?.externalMessageId === '4');
      expect(analyzedDiscussion?.sourceProvenance?.provider).toBe('telegram');
      expect(analyzedDiscussion?.sourceProvenance?.externalCommunityId).toBe(TEST_CHAT_ID_STRING);
      expect(analyzedDiscussion?.sourceProvenance?.externalMessageId).toBe('4');
    });
  });
});

