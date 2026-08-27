import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommunityHistoryService } from './CommunityHistoryService';
import { ICommunityHistoryQueryRepository } from '../repositories/ICommunityHistoryQueryRepository';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { Community } from '../domain/community';
import { Membership } from '../domain/membership';
import { CommunityHistoryReadModel } from '../readmodels/CommunityHistoryReadModel';
import { Discussion } from '../domain/discussion';

describe('CommunityHistoryService', () => {
  let mockHistoryRepo: ICommunityHistoryQueryRepository;
  let mockMembershipRepo: IMembershipRepository;
  let service: CommunityHistoryService;

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

  const activeMembership: Membership = {
    id: 'm1',
    userId: 'u_member_1',
    communityId: 'com_1',
    planId: 'plan_1',
    role: 'member',
    joinedAt: new Date('2024-01-15'),
    status: 'active',
  };

  const pastDueMembership: Membership = {
    id: 'm2',
    userId: 'u_member_past_due',
    communityId: 'com_1',
    planId: 'plan_1',
    role: 'member',
    joinedAt: new Date('2024-01-10'),
    status: 'past_due',
  };

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
    title: 'How should we handle infinite reasoning loops?',
    content: 'The agent keeps calling the same tool over and over.',
    type: 'question',
    createdAt: new Date('2024-01-05'),
    isResolved: true,
    resolutionSummary: 'Use a hard loop counter and error hash checking.',
    resources: [
      {
        id: 'res_1',
        title: 'ReAct Paper',
        url: 'https://arxiv.org/abs/2210.03629',
        type: 'paper',
      },
    ],
    replies: [
      {
        id: 'rep_1',
        author: {
          id: 'u_creator',
          name: 'Sarah AI',
          avatarUrl: 'https://example.com/sarah.jpg',
          role: 'creator',
        },
        content: 'Use a maximum iteration budget of 5.',
        createdAt: new Date('2024-01-05T02:00:00Z'),
        isAnswer: true,
      },
    ],
    replyCount: 1,
  };

  const sampleHistoryReadModel: CommunityHistoryReadModel = {
    communityId: 'com_1',
    communityName: 'AI Agent Builders',
    categoryName: 'AI & ML',
    currentTopic: 'Agent Memory Systems',
    timeline: [
      {
        roadmapItemId: 'r1_1',
        orderIndex: 1,
        title: 'Foundations',
        description: 'Core concepts of LLMs',
        status: 'completed',
        startedAt: new Date('2024-01-01'),
        completedAt: new Date('2024-01-08'),
        keyIdea: 'Agents require a structured reasoning loop.',
        summary: 'We explored ReAct loops and deterministic parsing.',
        discussionCount: 1,
        discussions: [sampleDiscussion],
        keyResources: sampleDiscussion.resources || [],
      },
    ],
    pulse: {
      currentTopic: 'Agent Memory Systems',
      activeToday: 87,
      activeDiscussionsCount: 1,
      latestMilestone: 'Wrapped Foundations',
      featuredDiscussion: sampleDiscussion,
    },
    totalDiscussions: 1,
    totalResources: 1,
  };

  beforeEach(() => {
    mockHistoryRepo = {
      getCommunityHistory: vi.fn().mockResolvedValue(sampleHistoryReadModel),
      getDiscussionsForTopic: vi.fn().mockResolvedValue([sampleDiscussion]),
      getDiscussionById: vi.fn().mockResolvedValue(sampleDiscussion),
      getHistoricalTopics: vi.fn().mockResolvedValue([]),
    };

    mockMembershipRepo = {
      getCommunity: vi.fn().mockImplementation((id: string) => {
        if (id === 'com_1') return Promise.resolve(validCommunity);
        return Promise.resolve(null);
      }),
      getMembership: vi.fn().mockImplementation((userId: string, communityId: string) => {
        if (communityId !== 'com_1') return Promise.resolve(null);
        if (userId === 'u_member_1') return Promise.resolve(activeMembership);
        if (userId === 'u_member_past_due') return Promise.resolve(pastDueMembership);
        return Promise.resolve(null);
      }),
      getPlan: vi.fn(),
      getPlansForCommunity: vi.fn(),
      getRoadmapItemIds: vi.fn(),
      createMembership: vi.fn(),
      initializeProgress: vi.fn(),
    };

    service = new CommunityHistoryService(mockHistoryRepo, mockMembershipRepo);
  });

  describe('History Retrieval & Access Control', () => {
    it('allows active members to retrieve community history', async () => {
      const history = await service.getCommunityHistory('u_member_1', 'com_1');
      expect(history).toBeDefined();
      expect(history.communityId).toBe('com_1');
      expect(history.timeline).toHaveLength(1);
      expect(history.timeline[0].title).toBe('Foundations');
      expect(mockHistoryRepo.getCommunityHistory).toHaveBeenCalledWith('com_1');
    });

    it('allows community creator to retrieve history without a separate member record', async () => {
      const history = await service.getCommunityHistory('u_creator', 'com_1');
      expect(history).toBeDefined();
      expect(history.communityId).toBe('com_1');
    });

    it('rejects unauthenticated requests', async () => {
      await expect(service.getCommunityHistory('', 'com_1')).rejects.toThrow(
        'Authentication required to access community history.'
      );
    });

    it('rejects non-members with an access denied error', async () => {
      await expect(service.getCommunityHistory('u_visitor', 'com_1')).rejects.toThrow(
        'Access denied: You must be an active member of this community to view its history.'
      );
    });

    it('rejects past_due or canceled members', async () => {
      await expect(service.getCommunityHistory('u_member_past_due', 'com_1')).rejects.toThrow(
        'Access denied: You must be an active member of this community to view its history.'
      );
    });

    it('handles non-existent community safely', async () => {
      await expect(service.getCommunityHistory('u_member_1', 'non_existent_com')).rejects.toThrow(
        'Community with ID "non_existent_com" does not exist.'
      );
    });
  });

  describe('Discussion Retrieval', () => {
    it('allows active member to inspect discussion detail with replies', async () => {
      const discussion = await service.getDiscussion('u_member_1', 'com_1', 'disc_1');
      expect(discussion).toBeDefined();
      expect(discussion.id).toBe('disc_1');
      expect(discussion.title).toBe('How should we handle infinite reasoning loops?');
      expect(discussion.replies).toHaveLength(1);
      expect(discussion.replies[0].isAnswer).toBe(true);
      expect(mockHistoryRepo.getDiscussionById).toHaveBeenCalledWith('com_1', 'disc_1');
    });

    it('denies discussion inspection to non-members', async () => {
      await expect(service.getDiscussion('u_visitor', 'com_1', 'disc_1')).rejects.toThrow(
        'Access denied: You must be an active member of this community to view its history.'
      );
    });

    it('throws error when discussion is not found', async () => {
      (mockHistoryRepo.getDiscussionById as any).mockResolvedValueOnce(null);
      await expect(service.getDiscussion('u_member_1', 'com_1', 'unknown_disc')).rejects.toThrow(
        'Discussion "unknown_disc" not found in community "com_1".'
      );
    });
  });
});
