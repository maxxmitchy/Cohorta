export type UserRole = 'learner' | 'creator' | 'mentor' | 'admin';

export interface User {
  id: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  interests?: string[];
  joinedCommunities?: string[]; // IDs
}

export interface Community {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  category: string;
  memberCount: number;
  activeToday: number;
  weeklyGrowth: number;
  rating: number;
  currentTopic: string;
  skillLevel: string; // e.g., 'Beginner → Advanced'
  priceMonthly: number;
  tags: string[];
  imageUrl?: string;
}

// Represents the chunked knowledge for AI Catch Me Up
export interface TimelineEvent {
  id: string;
  communityId: string;
  dayRange: string; // e.g., "Day 1-5"
  title: string;
  summary: string;
  keyConcepts: string[];
}
