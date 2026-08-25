export type RoadmapItemStatus = 'completed' | 'current' | 'upcoming';

export interface RoadmapItem {
  id: string;
  communityId: string;
  title: string;
  description: string;
  orderIndex: number;
  status: RoadmapItemStatus;
  createdAt: Date;
  updatedAt: Date;
}
