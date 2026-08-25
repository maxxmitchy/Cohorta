import { IMembershipQueryRepository } from '../../../core/repositories/IMembershipQueryRepository';
import { IMembershipRepository } from '../../../core/repositories/IMembershipRepository';
import { MemberCommunityReadModel } from '../../../core/readmodels/MemberCommunityReadModel';
import { Membership } from '../../../core/domain/membership';
import { LearningProgress } from '../../../core/domain/progress';
import { mockCommunities, mockCategories, mockMetrics, mockRoadmapItems, mockMemberships, mockProgress } from './mockData';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class MockMembershipRepository implements IMembershipRepository, IMembershipQueryRepository {
  
  async getMembership(userId: string, communityId: string): Promise<Membership | null> {
    await delay(100);
    return mockMemberships.find(m => m.userId === userId && m.communityId === communityId) || null;
  }

  async createMembership(membership: Membership): Promise<void> {
    await delay(100);
    mockMemberships.push(membership);
  }

  async initializeProgress(progressItems: LearningProgress[]): Promise<void> {
    await delay(100);
    mockProgress.push(...progressItems);
  }

  async getRoadmapItemIds(communityId: string): Promise<string[]> {
    await delay(50);
    return mockRoadmapItems
      .filter(r => r.communityId === communityId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(r => r.id);
  }

  async getMemberCommunityView(userId: string, communityId: string): Promise<MemberCommunityReadModel | null> {
    await delay(300);

    const membership = await this.getMembership(userId, communityId);
    if (!membership || membership.status !== 'active') {
      return null;
    }

    const community = mockCommunities.find(c => c.id === communityId);
    if (!community) return null;

    const category = mockCategories.find(c => c.id === community.categoryId);
    const stats = mockMetrics[communityId];
    
    // Sort roadmap items by orderIndex
    const communityRoadmap = mockRoadmapItems
      .filter(r => r.communityId === communityId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    // Get user progress
    const userProgress = mockProgress.filter(p => p.userId === userId && p.communityId === communityId);
    const progressMap = new Map(userProgress.map(p => [p.roadmapItemId, p.status]));

    let totalItems = 0;
    let completedItems = 0;
    let nextAction: { roadmapItemId: string; title: string } | undefined;

    const roadmap = communityRoadmap.map(r => {
      totalItems++;
      const status = progressMap.get(r.id) || 'locked';
      if (status === 'completed') completedItems++;
      
      // Auto-assign the first non-completed item as the next action
      if (!nextAction && (status === 'current' || status === 'locked')) {
        nextAction = { roadmapItemId: r.id, title: r.title };
      }

      return {
        id: r.id,
        title: r.title,
        description: r.description,
        orderIndex: r.orderIndex,
        status: r.status, // The community's overall status
        userProgressStatus: status, // The user's specific progress
      };
    });

    return {
      communityId: community.id,
      name: community.name,
      categoryName: category?.name || 'Unknown',
      currentTopic: community.currentTopic,
      activeToday: stats?.activeToday || 0,
      
      membershipStatus: membership.status,
      memberRole: membership.role,
      joinedAt: membership.joinedAt,
      
      roadmap,
      totalItems,
      completedItems,
      nextAction,
    };
  }
}
