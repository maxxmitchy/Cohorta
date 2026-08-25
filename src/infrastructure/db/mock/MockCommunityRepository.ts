import { ICommunityRepository } from '../../../core/repositories/ICommunityRepository';
import { Community, Category } from '../../../core/domain/community';
import { CommunityMetrics } from '../../../core/domain/metrics';
import { MembershipPlan } from '../../../core/domain/membership';
import { mockCommunities, mockCategories, mockMetrics, mockPlans } from './mockData';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class MockCommunityRepository implements ICommunityRepository {
  async getAllCommunities(): Promise<Community[]> {
    await delay(300);
    return [...mockCommunities];
  }

  async getCommunityById(id: string): Promise<Community | null> {
    await delay(100);
    return mockCommunities.find(c => c.id === id) || null;
  }

  async getMetricsForCommunity(id: string): Promise<CommunityMetrics | null> {
    return mockMetrics[id] || null;
  }

  async getPlansForCommunity(id: string): Promise<MembershipPlan[]> {
    return mockPlans.filter(p => p.communityId === id);
  }

  async getCategoryById(id: string): Promise<Category | null> {
    return mockCategories.find(c => c.id === id) || null;
  }
}
