import { ICommunityRepository } from '../../../core/repositories/ICommunityRepository';
import { Community } from '../../../core/domain/community';
import { Category } from '../../../core/domain/category';
import { CommunityStats } from '../../../core/domain/metrics';
import { MembershipPlan } from '../../../core/domain/membership';
import { mockCommunities, mockCategories, mockMetrics, mockPlans } from './mockData';

export class MockCommunityRepository implements ICommunityRepository {
  async getAllCommunities(): Promise<Community[]> {
    return mockCommunities.map((c) => ({ ...c }));
  }

  async getCommunityById(id: string): Promise<Community | null> {
    const comm = mockCommunities.find((c) => c.id === id);
    return comm ? { ...comm } : null;
  }

  async getMetricsForCommunity(id: string): Promise<CommunityStats | null> {
    const stats = mockMetrics[id];
    return stats ? { ...stats } : null;
  }

  async getPlansForCommunity(id: string): Promise<MembershipPlan[]> {
    return mockPlans.filter((p) => p.communityId === id).map((p) => ({ ...p }));
  }

  async getCategoryById(id: string): Promise<Category | null> {
    const cat = mockCategories.find((c) => c.id === id);
    return cat ? { ...cat } : null;
  }
}
