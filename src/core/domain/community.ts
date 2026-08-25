export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'All Levels';
export type CommunityStatus = 'draft' | 'active' | 'archived';

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Community {
  id: string;
  creatorId: string;
  categoryId: string;
  name: string;
  description: string;
  skillLevel: SkillLevel;
  status: CommunityStatus;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
