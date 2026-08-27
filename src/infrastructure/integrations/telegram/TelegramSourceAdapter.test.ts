import { describe, it, expect } from 'vitest';
import { TelegramSourceAdapter } from './TelegramSourceAdapter';
import { validateTelegramConfig } from './TelegramConfig';
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
  TEST_CHAT_ID_STRING,
} from './TelegramFixtures';

describe('Phase 13 — Real Telegram Read-Only Ingestion Vertical Slice', () => {
  const testConfig = validateTelegramConfig({
    authorizedChatIds: new Set([TEST_CHAT_ID_STRING]),
    defaultRoadmapItemId: 'r_memory_agents',
  });

  describe('1. Telegram Config Validation & Boundary Isolation', () => {
    it('throws error if authorizedChatIds is empty', () => {
      expect(() => {
        validateTelegramConfig({ authorizedChatIds: new Set() });
      }).toThrow('authorizedChatIds must contain at least one authorized chat ID');
    });

    it('HttpTelegramClient throws if botToken is missing when instantiated', () => {
      expect(() => {
        new HttpTelegramClient(testConfig);
      }).toThrow('HttpTelegramClient requires a valid botToken');
    });

    it('redacts botToken in HttpTelegramClient transport errors', async () => {
      const secretToken = '123456:ABC-SECRET_TOKEN-XYZ';
      const configWithSecret = validateTelegramConfig({
        botToken: secretToken,
        authorizedChatIds: new Set([TEST_CHAT_ID_STRING]),
        apiBaseUrl: 'http://127.0.0.1:54321/non-existent-endpoint',
      });

      const client = new HttpTelegramClient(configWithSecret);
      try {
        await client.getMe();
        expect.unreachable('Should have failed');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Ensure secret token is never exposed in error text
        expect(msg).not.toContain(secretToken);
      }
    });
  });

  describe('2. Telegram Update → ExternalCommunitySourceEvent Mapping', () => {
    it('maps an ordinary group message (Fixture A: Message 3) to ExternalCommunitySourceEvent', () => {
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

    it('maps edited message updates (Fixture H) to message_edited with edit timestamp', () => {
      const event = TelegramSourceAdapter.adaptUpdate(FIXTURE_TELEGRAM_UPDATE_EDITED, testConfig);

      expect(event).not.toBeNull();
      expect(event?.eventType).toBe('message_edited');
      expect(event?.externalMessageId).toBe('3');
      expect(event?.content).toContain('(Updated: verified agent pipeline)');
      expect(event?.metadata?.editedAt).toEqual(new Date(1708900300 * 1000));
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

  describe('3. Integration: TelegramAdapter -> CommunityHistoryNormalizer', () => {
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

    it('maintains strict isolation between distinct Telegram chats with identical message IDs', () => {
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
          chat: { id: -7777777777, type: 'group' as const, title: 'Chat B' },
          text: 'Message in Chat B with same message_id 3',
        },
      };

      const events = TelegramSourceAdapter.adaptUpdates([updateChatA, updateChatB], multiChatConfig);
      expect(events).toHaveLength(2);

      const discussionsA = CommunityHistoryNormalizer.normalize(events.filter(e => e.externalCommunityId === chatA), {
        communityIdMapper: () => 'com_a',
      });
      const discussionsB = CommunityHistoryNormalizer.normalize(events.filter(e => e.externalCommunityId === chatB), {
        communityIdMapper: () => 'com_b',
      });

      expect(discussionsA[0].id).toBe('disc_telegram_3');
      expect(discussionsB[0].id).toBe('disc_telegram_3');
      expect(discussionsA[0].content).toBe('Cohorta integration test 001');
      expect(discussionsB[0].content).toBe('Message in Chat B with same message_id 3');
    });
  });

  describe('4. Evidence Pipeline Integrity & Regression Checks', () => {
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

      // Regression guarantee: A single personal reply without consensus markers or resolution summary
      // must NOT be classified as strong_consensus or resolved_decision.
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
        joinedAt: new Date('2024-03-01'), // joined after topics completed
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
        completedAt: new Date('2024-02-28'), // completed before member joined
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

      // Verify that discussions analyzed carry Telegram provenance
      const analyzedDiscussion = discussions.find(d => d.sourceProvenance?.externalMessageId === '4');
      expect(analyzedDiscussion?.sourceProvenance?.provider).toBe('telegram');
      expect(analyzedDiscussion?.sourceProvenance?.externalCommunityId).toBe(TEST_CHAT_ID_STRING);
      expect(analyzedDiscussion?.sourceProvenance?.externalMessageId).toBe('4');
    });
  });
});
