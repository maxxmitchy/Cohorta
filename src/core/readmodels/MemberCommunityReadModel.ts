import { CommunityDetailRoadmapItem } from './CommunityDetailReadModel';
import { ProgressStatus } from '../domain/progress';

export interface MemberRoadmapItem extends CommunityDetailRoadmapItem {
  userProgressStatus: ProgressStatus;
}

export interface MemberCommunityReadModel {
  communityId: string;
  name: string;
  categoryName: string;
  currentTopic?: string;
  activeToday: number;
  
  membershipStatus: 'active' | 'past_due' | 'canceled';
  memberRole: string; // e.g. 'member', 'creator'
  joinedAt: Date;
  
  roadmap: MemberRoadmapItem[];
  
  // High-level progress metrics
  totalItems: number;
  completedItems: number;
  
  nextAction?: {
    roadmapItemId: string;
    title: string;
  };
}
