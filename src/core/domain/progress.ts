export type ProgressStatus = 'locked' | 'current' | 'completed';

export interface LearningProgress {
  userId: string;
  communityId: string;
  roadmapItemId: string;
  status: ProgressStatus;
  completedAt?: Date;
  updatedAt: Date;
}
