import { Category, Community, TimelineEvent } from './schema';
import { mockCategories, mockCommunities, mockTimelines } from './mock-data';

// Simulate network latency
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  async getCommunities(): Promise<Community[]> {
    await delay(600);
    return [...mockCommunities].sort((a, b) => b.memberCount - a.memberCount);
  },

  async getTrendingCommunities(): Promise<Community[]> {
    await delay(400);
    return [...mockCommunities].sort((a, b) => b.weeklyGrowthPercentage - a.weeklyGrowthPercentage);
  },

  async getCommunityById(id: string): Promise<Community | null> {
    await delay(300);
    return mockCommunities.find(c => c.id === id) || null;
  },

  async getCategories(): Promise<Category[]> {
    await delay(200);
    return mockCategories;
  },

  async getTimelineForCommunity(communityId: string): Promise<TimelineEvent[]> {
    await delay(500);
    return mockTimelines
      .filter(t => t.communityId === communityId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }
};
