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

describe('CatchUpService & Evidence Integrity', () => {
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

  const emptyCommunity: Community = {
    id: 'com_empty',
    creatorId: 'u_creator',
    categoryId: 'cat_ai',
    name: 'Autonomous Systems Early Cohort',
    description: 'Brand new community with no past milestones',
    skillLevel: 'Beginner',
    status: 'active',
    currentTopic: 'Kickoff & Setup',
    tags: ['early'],
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-02-01'),
  };

  // Historical Topics
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

  // Rich Evidence Discussion Fixtures
  const resolvedDiscussion: Discussion = {
    id: 'disc_resolved',
    communityId: 'com_1',
    roadmapItemId: 'r1_1',
    topicTitle: 'Foundations',
    author: {
      id: 'u_marcus',
      name: 'Marcus Vance',
      avatarUrl: 'https://example.com/marcus.jpg',
      role: 'member',
    },
    title: 'Loop handling patterns with hard iteration limits',
    content: 'Discussion on loop breakout and recovery mechanisms.',
    type: 'discussion',
    signalQuality: 'high_signal',
    consensusStatus: 'resolved',
    createdAt: new Date('2024-01-05'),
    isResolved: true,
    resolutionSummary: 'Use a step counter limit of 5 iterations with tool call hashing.',
    replies: [
      {
        id: 'rep_1',
        author: { id: 'u_creator', name: 'Sarah AI', avatarUrl: '', role: 'creator' },
        content: 'Agreed, this is the standard pattern.',
        createdAt: new Date('2024-01-05'),
        isAnswer: true,
      }
    ],
    replyCount: 1,
    resources: [
      {
        id: 'res_1',
        title: 'ReAct Paper',
        url: 'https://arxiv.org/abs/2210.03629',
        type: 'paper',
        sourceDiscussionId: 'disc_resolved',
        sourceRoadmapItemId: 'r1_1',
        attributedBy: 'Marcus Vance',
      },
    ],
  };

  const unansweredQuestionDiscussion: Discussion = {
    id: 'disc_unanswered',
    communityId: 'com_1',
    roadmapItemId: 'r1_1',
    topicTitle: 'Foundations',
    author: {
      id: 'u_david',
      name: 'David Chen',
      avatarUrl: 'https://example.com/david.jpg',
      role: 'member',
    },
    title: 'How do you benchmark reasoning loop convergence rate across diverse LLM backends?',
    content: 'Has anyone compared convergence between Claude 3.5 Sonnet and GPT-4o on ambiguous multi-step tasks?',
    type: 'question',
    signalQuality: 'high_signal',
    consensusStatus: 'unanswered',
    createdAt: new Date('2024-01-06'),
    isResolved: false,
    replies: [],
    replyCount: 0,
  };

  const conflictingPerspectivesDiscussion: Discussion = {
    id: 'disc_conflicting',
    communityId: 'com_1',
    roadmapItemId: 'r1_2',
    topicTitle: 'Tool Calling',
    author: {
      id: 'u_elena',
      name: 'Elena Rostova',
      avatarUrl: 'https://example.com/elena.jpg',
      role: 'member',
    },
    title: 'gRPC vs REST vs In-Process WASM for Tool Execution Microservices',
    content: 'Our team is split between in-process WASM sandboxes and remote gRPC microservices.',
    type: 'discussion',
    signalQuality: 'high_signal',
    consensusStatus: 'differing_perspectives',
    perspectiveSummary: 'Trade-off debate between sub-millisecond latency (WASM) and multi-language microservice flexibility (gRPC). No single mandate.',
    createdAt: new Date('2024-01-12'),
    isResolved: false,
    replies: [
      {
        id: 'rep_grpc',
        author: { id: 'u_elena', name: 'Elena Rostova', avatarUrl: '', role: 'member' },
        content: 'gRPC gives type safety across Python and Go.',
        createdAt: new Date('2024-01-12'),
      },
      {
        id: 'rep_wasm',
        author: { id: 'u_marcus', name: 'Marcus Vance', avatarUrl: '', role: 'member' },
        content: 'WASM eliminates 15ms of network roundtrips.',
        createdAt: new Date('2024-01-13'),
      }
    ],
    replyCount: 2,
  };

  const noisySocialDiscussion: Discussion = {
    id: 'disc_noisy_social',
    communityId: 'com_1',
    roadmapItemId: 'r1_1',
    topicTitle: 'Foundations',
    author: {
      id: 'u_visitor',
      name: 'Victor Visitor',
      avatarUrl: 'https://example.com/victor.jpg',
      role: 'member',
    },
    title: 'Excited to be here!',
    content: 'Hey everyone, anyone doing the live call from Europe?',
    type: 'social_chatter',
    signalQuality: 'low_signal',
    consensusStatus: 'informational',
    createdAt: new Date('2024-01-02'),
    replies: [],
    replyCount: 0,
  };

  // Membership Fixtures
  const earlyMember: Membership = {
    id: 'm_early',
    userId: 'u_early',
    communityId: 'com_1',
    planId: 'plan_1',
    role: 'member',
    joinedAt: new Date('2024-01-01'),
    status: 'active',
  };

  const midMember: Membership = {
    id: 'm_mid',
    userId: 'u_mid',
    communityId: 'com_1',
    planId: 'plan_1',
    role: 'member',
    joinedAt: new Date('2024-01-18'),
    status: 'active',
  };

  const lateMember: Membership = {
    id: 'm_late',
    userId: 'u_late',
    communityId: 'com_1',
    planId: 'plan_1',
    role: 'member',
    joinedAt: new Date('2024-01-25'),
    status: 'active',
  };

  const emptyMember: Membership = {
    id: 'm_empty_user',
    userId: 'u_empty_user',
    communityId: 'com_empty',
    planId: 'plan_empty',
    role: 'member',
    joinedAt: new Date('2024-02-05'),
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
        if (rId === 'r1_1') return Promise.resolve([resolvedDiscussion, unansweredQuestionDiscussion, noisySocialDiscussion]);
        if (rId === 'r1_2') return Promise.resolve([conflictingPerspectivesDiscussion]);
        return Promise.resolve([]);
      }),
      getDiscussionById: vi.fn(),
      getHistoricalTopics: vi.fn().mockImplementation((cId: string) => {
        if (cId === 'com_empty') return Promise.resolve([]);
        return Promise.resolve(mockHistoricalTopics);
      }),
    };

    mockMembershipRepo = {
      getCommunity: vi.fn().mockImplementation((id: string) => {
        if (id === 'com_1') return Promise.resolve(validCommunity);
        if (id === 'com_empty') return Promise.resolve(emptyCommunity);
        return Promise.resolve(null);
      }),
      getMembership: vi.fn().mockImplementation((userId: string, communityId: string) => {
        if (communityId === 'com_1') {
          if (userId === 'u_early') return Promise.resolve(earlyMember);
          if (userId === 'u_mid') return Promise.resolve(midMember);
          if (userId === 'u_late') return Promise.resolve(lateMember);
          if (userId === 'u_past_due') return Promise.resolve(pastDueMember);
        }
        if (communityId === 'com_empty' && userId === 'u_empty_user') {
          return Promise.resolve(emptyMember);
        }
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
  });

  describe('Evidence Model & Noise Filtering Stress Tests', () => {
    it('filters out low-signal social chatter from notable discussions', async () => {
      const catchUp = await service.getCatchUp('u_late', 'com_1');
      const foundationsTopic = catchUp.missedTopics[0];

      const discussionIds = foundationsTopic.notableDiscussions.map(d => d.id);
      expect(discussionIds).toContain('disc_resolved');
      expect(discussionIds).toContain('disc_unanswered');
      expect(discussionIds).not.toContain('disc_noisy_social'); // Low-signal chatter filtered
    });

    it('detects and preserves unanswered questions without hallucinating consensus', async () => {
      const catchUp = await service.getCatchUp('u_late', 'com_1');
      const foundationsTopic = catchUp.missedTopics[0];

      expect(foundationsTopic.openQuestions).toBeDefined();
      expect(foundationsTopic.openQuestions.length).toBeGreaterThan(0);
      expect(foundationsTopic.openQuestions[0].title).toContain('How do you benchmark reasoning loop convergence rate');
      expect(foundationsTopic.openQuestions[0].id).toBe('disc_unanswered');
      expect(foundationsTopic.openQuestions[0].authorName).toBe('David Chen');
    });

    it('identifies divergent perspectives and marks consensus status accurately', async () => {
      const catchUp = await service.getCatchUp('u_late', 'com_1');
      const toolCallingTopic = catchUp.missedTopics[1];

      expect(toolCallingTopic.consensusLevel).toBe('differing_perspectives');
      expect(toolCallingTopic.divergentTopics).toHaveLength(1);
      expect(toolCallingTopic.divergentTopics[0].title).toContain('gRPC vs REST vs In-Process WASM');
      expect(toolCallingTopic.divergentTopics[0].summary).toContain('Trade-off debate between sub-millisecond latency');
      expect(toolCallingTopic.divergentTopics[0].perspectives.length).toBeGreaterThan(0);
    });

    it('handles empty/early community history gracefully without crashing', async () => {
      const catchUp = await service.getCatchUp('u_empty_user', 'com_empty');

      expect(catchUp).toBeDefined();
      expect(catchUp.hasMissedContent).toBe(false);
      expect(catchUp.evidenceStatus).toBe('empty_history');
      expect(catchUp.missedTopics).toHaveLength(0);
      expect(catchUp.summaryNarrative).toContain('newly created');
    });

    it('preserves provenance attribution on attached resources', async () => {
      const catchUp = await service.getCatchUp('u_late', 'com_1');
      const foundationsTopic = catchUp.missedTopics[0];

      expect(foundationsTopic.topResources).toHaveLength(1);
      const res = foundationsTopic.topResources[0];
      expect(res.title).toBe('ReAct Paper');
      expect(res.sourceDiscussionId).toBe('disc_resolved');
      expect(res.attributedBy).toBe('Marcus Vance');

      // Provenance tracking IDs
      expect(foundationsTopic.sourceDiscussionIds).toContain('disc_resolved');
      expect(foundationsTopic.sourceDiscussionIds).toContain('disc_unanswered');
      expect(foundationsTopic.sourceResourceIds).toContain('res_1');
      expect(foundationsTopic.sourceReplyIds).toContain('rep_1');
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

  describe('Deterministic AI Generator Output', () => {
    it('MockCatchUpGenerator produces deterministic and coherent output across repeated runs', async () => {
      const output1 = await catchUpGenerator.generateCatchUp({
        memberJoinedAt: new Date('2024-01-25'),
        communityName: 'AI Agent Builders',
        categoryName: 'Tech',
        currentTopic: 'Agent Memory Systems',
        allTopics: mockHistoricalTopics,
        missedTopics: [mockHistoricalTopics[0], mockHistoricalTopics[1]],
        discussions: [resolvedDiscussion, conflictingPerspectivesDiscussion],
      });

      const output2 = await catchUpGenerator.generateCatchUp({
        memberJoinedAt: new Date('2024-01-25'),
        communityName: 'AI Agent Builders',
        categoryName: 'Tech',
        currentTopic: 'Agent Memory Systems',
        allTopics: mockHistoricalTopics,
        missedTopics: [mockHistoricalTopics[0], mockHistoricalTopics[1]],
        discussions: [resolvedDiscussion, conflictingPerspectivesDiscussion],
      });

      expect(output1.summaryHeadline).toBe(output2.summaryHeadline);
      expect(output1.summaryNarrative).toBe(output2.summaryNarrative);
      expect(output1.recommendedStartingPoint.title).toBe(output2.recommendedStartingPoint.title);
      expect(output1.recommendedStartingPoint.confidence).toBe(output2.recommendedStartingPoint.confidence);
    });
  });
});
