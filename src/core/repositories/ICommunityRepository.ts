import { Community, Category } from '../domain/community';
import { CommunityMetrics } from '../domain/metrics';
import { MembershipPlan } from '../domain/membership';

export interface ICommunityRepository {
  getAllCommunities(): Promise<Community[]>;
  getCommunityById(id: string): Promise<Community | null>;
  getMetricsForCommunity(id: string): Promise<CommunityMetrics | null>;
  getPlansForCommunity(id: string): Promise<MembershipPlan[]>;
  getCategoryById(id: string): Promise<Category | null>;
  
  // Future: pagination, advanced filtering
}
