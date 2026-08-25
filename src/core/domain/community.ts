export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'All Levels';
export type CommunityStatus = 'draft' | 'active' | 'archived';

export interface Community {
  id: string;
  creatorId: string;
  categoryId: string;
  name: string;
  description: string;
  skillLevel: SkillLevel;
  status: CommunityStatus;
  currentTopic?: string; // Extracted from metrics as this is learning context, not an engagement metric
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
