export type UserRole = 'learner' | 'creator' | 'mentor' | 'admin';
export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'All Levels';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  interests: string[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string; // lucide icon name
}

export interface Community {
  id: string;
  creatorId: string; // Ref: User
  name: string;
  description: string;
  categoryId: string; // Ref: Category
  skillLevel: SkillLevel;
  priceMonthly: number; // 0 for free
  
  // Stats (Denormalized for fast reads)
  memberCount: number;
  activeToday: number;
  weeklyGrowthPercentage: number;
  rating: number;
  
  currentTopic: string;
  tags: string[];
  
  // Telegram Integration Metadata
  telegramGroupId?: string;
  createdAt: string;
}

export interface Membership {
  id: string;
  userId: string; // Ref: User
  communityId: string; // Ref: Community
  role: 'member' | 'admin' | 'mentor';
  joinedAt: string;
  progressScore: number;
}

export interface TimelineEvent {
  id: string;
  communityId: string; // Ref: Community
  orderIndex: number;
  dayRange: string; // e.g., "Day 1-5"
  title: string;
  summary: string;
  keyConcepts: string[];
  resourceUrls?: string[];
}

export interface Project {
  id: string;
  communityId: string;
  title: string;
  description: string;
  difficulty: SkillLevel;
  prerequisites: string[];
}
