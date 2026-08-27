import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatchUpService } from './CatchUpService';
import { ICommunityHistoryQueryRepository } from '../repositories/ICommunityHistoryQueryRepository';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { ICatchUpGenerator } from './ICatchUpGenerator';
import { MockCatchUpGenerator } from '../../infrastructure/ai/MockCatchUpGenerator';
import { Community } from '../domain/community';
import { Membership } from '../domain/membership';
import { HistoricalTopicEvent } from '../domain/history';
import { Discussion } from '../domain/discussion';

describe('CatchUpService', () => {
  let mockHistoryRepo: ICommunityHistoryQueryRepository;
  let mockMembershipRepo: IMembershipRepository;
  let catchUpGenerator: ICatchUpGenerator;
  let service: CatchUpService;

  const validCommunity: Community = {
    id: 'com_1',
    creatorId: 'u_creator',
    categoryId: 'cat_ai',
    name: 'AI Agent Builders',
    description: 'Learn agent architecture',
    skillLevel: 'Intermediate',
    status: 'active',
    currentTopic: 'Agent Memory Systems',
    tags: ['ai', 'agents'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  // Historical Topics:
  // Topic 1: completed 2024-01-08
  // Topic 2: completed 2024-01-15
  // Topic 3: completed 2024-01-22
  // Topic 4: current (started 2024-01-23)
  // Topic 5: upcoming
  const mockHistoricalTopics: HistoricalTopicEvent[] = [
    {
      id: 'ht_1',
      communityId: 'com_1',
      roadmapItemId: 'r1_1',
      topicTitle: 'Foundations',
      description: 'Core concepts of LLMs',
      orderIndex: 1,
      status: 'completed',
      startedAt: new Date('2024-01-01'),
      completedAt: new Date('2024-01-08'),
      keyIdea: 'Agents require a structured reasoning loop.',
      summary: 'Covered ReAct and state transitions.',
    },
    {
      id: 'ht_2',
      communityId: 'com_1',
      roadmapItemId: 'r1_2',
      topicTitle: 'Tool Calling',
      description: 'Interacting with APIs',
      orderIndex: 2,
      status: 'completed',
      startedAt: new Date('2024-01-09'),
      completedAt: new Date('2024-01-15'),
      keyIdea: 'Tools must provide clear error feedback.',
      summary: 'Covered schema validation and sandboxing.',
    },
    {
      id: 'ht_3',
      communityId: 'com_1',
      roadmapItemId: 'r1_3',
      topicTitle: 'RAG Systems',
      description: 'Retrieval Augmented Generation',
      orderIndex: 3,
      status: 'completed',
      startedAt: new Date('2024-01-16'),
      completedAt: new Date('2024-01-22'),
      keyIdea: 'Hybrid search outperforms dense-only embeddings.',
      summary: 'Covered BM25 + dense re-ranking.',
    },
    {
      id: 'ht_4',
      communityId: 'com_1',
      roadmapItemId: 'r1_4',
      topicTitle: 'Agent Memory Systems',
      description: 'Persistent memory across sessions',
      orderIndex: 4,
      status: 'current',
      startedAt: new Date('2024-01-23'),
      keyIdea: 'Episodic memory requires reflection compaction.',
      summary: 'Active exploration of long-term graphs.',
    },
    {
      id: 'ht_5',
      communityId: 'com_1',
      roadmapItemId: 'r1_5',
      topicTitle: 'Multi-Agent Orchestration',
      description: 'Supervisor patterns',
      orderIndex: 5,
      status: 'upcoming',
      startedAt: new Date('2024-01-30'),
      keyIdea: 'Supervisors prevent loop deadlocks.',
      summary: 'Upcoming module.',
    },
  ];

  const sampleDiscussion: Discussion = {
    id: 'disc_1',
    communityId: 'com_1',
    roadmapItemId: 'r1_1',
    topicTitle: 'Foundations',
    author: {
      id: 'u_marcus',
      name: 'Marcus Vance',
      avatarUrl: 'https://example.com/marcus.jpg',
      role: 'member',
    },
    title: 'Loop handling patterns',
    content: 'Discussion on loop breakout.',
    type: 'discussion',
    createdAt: new Date('2024-01-05'),
    replies: [],
    replyCount: 0,
    resources: [
      {
        id: 'res_1',
        title: 'ReAct Paper',
        url: 'https://arxiv.org/abs/2210.03629',
        type: 'paper',
      },
    ],
  };

  // Member who joined on 2024-01-01 (before topic 1 completed) -> Missed 0 topics
  const earlyMember: Membership = {
    id: 'm_early',
    userId: 'u_early',
    communityId: 'com_1',
    planId: 'plan_1',
    role: 'member',
    joinedAt: new Date('2024-01-01'),
    status: 'active',
  };

  // Member who joined on 2024-01-18 (after topic 1 and 2 completed, but before topic 3) -> Missed topic 1 and 2
  const midMember: Membership = {
    id: 'm_mid',
    userId: 'u_mid',
    communityId: 'com_1',
    planId: 'plan_1',
    role: 'member',
    joinedAt: new Date('2024-01-18'),
    status: 'active',
  };

  // Member who joined on 2024-01-25 (during Topic 4 current) -> Missed topics 1, 2, and 3
  const lateMember: Membership = {
    id: 'm_late',
    userId: 'u_late',
    communityId: 'com_1',
    planId: 'plan_1',
    role: 'member',
    joinedAt: new Date('2024-01-25'),
    status: 'active',
  };

  const pastDueMember: Membership = {
    id: 'm_past_due',
    userId: 'u_past_due',
    communityId: 'com_1',
    planId: 'plan_1',
    role: 'member',
    joinedAt: new Date('2024-01-25'),
    status: 'past_due',
  };

  beforeEach(() => {
    mockHistoryRepo = {
      getCommunityHistory: vi.fn(),
      getDiscussionsForTopic: vi.fn().mockImplementation((_cId: string, rId: string) => {
        if (rId === 'r1_1') return Promise.resolve([sampleDiscussion]);
        return Promise.resolve([]);
      }),
      getDiscussionById: vi.fn(),
      getHistoricalTopics: vi.fn().mockResolvedValue(mockHistoricalTopics),
    };

    mockMembershipRepo = {
      getCommunity: vi.fn().mockImplementation((id: string) => {
        if (id === 'com_1') return Promise.resolve(validCommunity);
        return Promise.resolve(null);
      }),
      getMembership: vi.fn().mockImplementation((userId: string, communityId: string) => {
        if (communityId !== 'com_1') return Promise.resolve(null);
        if (userId === 'u_early') return Promise.resolve(earlyMember);
        if (userId === 'u_mid') return Promise.resolve(midMember);
        if (userId === 'u_late') return Promise.resolve(lateMember);
        if (userId === 'u_past_due') return Promise.resolve(pastDueMember);
        return Promise.resolve(null);
      }),
      getPlan: vi.fn(),
      getPlansForCommunity: vi.fn(),
      getRoadmapItemIds: vi.fn(),
      createMembership: vi.fn(),
      initializeProgress: vi.fn(),
    };

    catchUpGenerator = new MockCatchUpGenerator();
    service = new CatchUpService(mockHistoryRepo, mockMembershipRepo, catchUpGenerator);
  });

  describe('Catch Up Calculations based on Membership Timing', () => {
    it('member joining late receives all missed topics before their join date', async () => {
      const catchUp = await service.getCatchUp('u_late', 'com_1');

      expect(catchUp).toBeDefined();
      expect(catchUp.hasMissedContent).toBe(true);
      expect(catchUp.missedTopicsCount).toBe(3);
      expect(catchUp.missedTopics.map(t => t.roadmapItemId)).toEqual(['r1_1', 'r1_2', 'r1_3']);
      expect(catchUp.missedTopics[0].title).toBe('Foundations');
      expect(catchUp.missedTopics[1].title).toBe('Tool Calling');
      expect(catchUp.missedTopics[2].title).toBe('RAG Systems');
    });

    it('member joining midway receives only topics completed prior to their join date', async () => {
      const catchUp = await service.getCatchUp('u_mid', 'com_1');

      expect(catchUp.hasMissedContent).toBe(true);
      expect(catchUp.missedTopicsCount).toBe(2);
      expect(catchUp.missedTopics.map(t => t.roadmapItemId)).toEqual(['r1_1', 'r1_2']);
    });

    it('member joining at the beginning receives no unnecessary catch-up', async () => {
      const catchUp = await service.getCatchUp('u_early', 'com_1');

      expect(catchUp.hasMissedContent).toBe(false);
      expect(catchUp.missedTopicsCount).toBe(0);
      expect(catchUp.missedTopics).toHaveLength(0);
      expect(catchUp.summaryHeadline).toContain("You're all caught up");
    });

    it('never classifies current or upcoming topics as missed', async () => {
      const catchUp = await service.getCatchUp('u_late', 'com_1');

      const missedIds = catchUp.missedTopics.map(t => t.roadmapItemId);
      expect(missedIds).not.toContain('r1_4'); // Current
      expect(missedIds).not.toContain('r1_5'); // Upcoming
      expect(catchUp.currentTopic).toBe('Agent Memory Systems');
      expect(catchUp.currentFocusContext.title).toBe('Agent Memory Systems');
    });

    it('attaches notable discussions and resources to missed topics', async () => {
      const catchUp = await service.getCatchUp('u_late', 'com_1');

      const foundationsTopic = catchUp.missedTopics[0];
      expect(foundationsTopic.notableDiscussions).toHaveLength(1);
      expect(foundationsTopic.notableDiscussions[0].id).toBe('disc_1');
      expect(foundationsTopic.topResources).toHaveLength(1);
      expect(foundationsTopic.topResources[0].title).toBe('ReAct Paper');
    });
  });

  describe('Access Control for Catch Up', () => {
    it('denies access to non-members', async () => {
      await expect(service.getCatchUp('u_visitor', 'com_1')).rejects.toThrow(
        'Access denied: You must be an active member of this community to access Catch Up.'
      );
    });

    it('denies access to past_due members', async () => {
      await expect(service.getCatchUp('u_past_due', 'com_1')).rejects.toThrow(
        'Access denied: You must be an active member of this community to access Catch Up.'
      );
    });

    it('denies unauthenticated users', async () => {
      await expect(service.getCatchUp('', 'com_1')).rejects.toThrow(
        'Authentication required to access Catch Up briefing.'
      );
    });

    it('allows community creator access', async () => {
      const catchUp = await service.getCatchUp('u_creator', 'com_1');
      expect(catchUp).toBeDefined();
      expect(catchUp.communityId).toBe('com_1');
    });
  });

  describe('AI Abstraction Boundary', () => {
    it('MockCatchUpGenerator produces deterministic and coherent output', async () => {
      const output1 = await catchUpGenerator.generateCatchUp({
        memberJoinedAt: new Date('2024-01-25'),
        communityName: 'AI Agent Builders',
        categoryName: 'Tech',
        currentTopic: 'Agent Memory Systems',
        allTopics: mockHistoricalTopics,
        missedTopics: [mockHistoricalTopics[0], mockHistoricalTopics[1]],
        discussions: [sampleDiscussion],
      });

      const output2 = await catchUpGenerator.generateCatchUp({
        memberJoinedAt: new Date('2024-01-25'),
        communityName: 'AI Agent Builders',
        categoryName: 'Tech',
        currentTopic: 'Agent Memory Systems',
        allTopics: mockHistoricalTopics,
        missedTopics: [mockHistoricalTopics[0], mockHistoricalTopics[1]],
        discussions: [sampleDiscussion],
      });

      expect(output1.summaryHeadline).toBe(output2.summaryHeadline);
      expect(output1.summaryNarrative).toBe(output2.summaryNarrative);
      expect(output1.recommendedStartingPoint.title).toBe(output2.recommendedStartingPoint.title);
    });
  });
});
