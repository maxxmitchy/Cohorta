import { PricingDisplay } from './CommunityDiscoveryReadModel';
import { RoadmapItemStatus } from '../domain/learning';

export interface CommunityDetailRoadmapItem {
  id: string;
  title: string;
  description: string;
  orderIndex: number;
  status: RoadmapItemStatus;
}

export interface CommunityDetailReadModel {
  id: string;
  name: string;
  description: string;
  categoryName: string;
  skillLevel: string;
  memberCount: number;
  activeToday: number;
  currentTopic?: string;
  
  creatorName: string;
  creatorRole: string;
  
  roadmap: CommunityDetailRoadmapItem[];
  
  // Clean pricing presentation abstraction for the UI
  primaryPricing?: PricingDisplay;
  alternativePricing: PricingDisplay[];
  hasFreeEntry: boolean;
  
  integrationStatus: 'connected' | 'coming_soon' | 'not_connected';
  createdAt: Date;
}
