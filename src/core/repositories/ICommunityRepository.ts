import { Community } from '../domain/community';
import { Category } from '../domain/category';
import { CommunityStats } from '../domain/metrics';
import { MembershipPlan } from '../domain/membership';

export interface ICommunityRepository {
  getAllCommunities(): Promise<Community[]>;
  getCommunityById(id: string): Promise<Community | null>;
  getMetricsForCommunity(id: string): Promise<CommunityStats | null>;
  getPlansForCommunity(id: string): Promise<MembershipPlan[]>;
  getCategoryById(id: string): Promise<Category | null>;
  
  // Future: pagination, advanced filtering
}
