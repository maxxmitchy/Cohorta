import { RoadmapItemStatus } from './learning';

export interface HistoricalTopicEvent {
  id: string;
  communityId: string;
  roadmapItemId: string;
  topicTitle: string;
  description: string;
  orderIndex: number;
  status: RoadmapItemStatus;
  startedAt: Date;
  completedAt?: Date;
  keyIdea: string;
  summary: string;
  milestoneNotes?: string;
}
