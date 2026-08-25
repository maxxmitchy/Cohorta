import { Category } from '../../../core/domain/category';
import { Community } from '../../../core/domain/community';
import { CommunityStats } from '../../../core/domain/metrics';
import { MembershipPlan } from '../../../core/domain/membership';

export const mockCategories: Category[] = [
  { id: 'c1', name: 'AI & Automation', slug: 'ai-automation' },
  { id: 'c2', name: 'Software Dev', slug: 'development' },
  { id: 'c3', name: 'Business & Growth', slug: 'business' }
];

export const mockCommunities: Community[] = [
  {
    id: 'com_1',
    creatorId: 'u1',
    categoryId: 'c1',
    name: 'AI Automation Builders',
    description: 'Learn to build real-world AI agents and automate your business using n8n, OpenAI, and Webhooks. We build a new project every week.',
    skillLevel: 'Beginner',
    status: 'active',
    currentTopic: 'Building AI Agents with n8n',
    tags: ['n8n', 'OpenAI', 'Agents'],
    createdAt: new Date('2023-10-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'com_2',
    creatorId: 'u1',
    categoryId: 'c2',
    name: 'Full-Stack Shipyard',
    description: 'A cohort of developers shipping a new micro-startup every month. Next.js, Tailwind, and Supabase focused.',
    skillLevel: 'Intermediate',
    status: 'active',
    currentTopic: 'Database Architecture & Row Level Security',
    tags: ['Next.js', 'React', 'Supabase'],
    createdAt: new Date('2023-11-15T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'com_3',
    creatorId: 'u1',
    categoryId: 'c1',
    name: 'Cursor Power Users',
    description: 'Master AI-assisted coding. We share prompts, rules, and workflows to 10x your shipping speed.',
    skillLevel: 'All Levels',
    status: 'active',
    currentTopic: 'Writing perfect .cursorrules files',
    tags: ['Cursor', 'Prompting', 'Efficiency'],
    createdAt: new Date('2024-01-05T00:00:00Z'),
    updatedAt: new Date('2024-02-01T00:00:00Z'),
  }
];

export const mockMetrics: Record<string, CommunityStats> = {
  'com_1': {
    communityId: 'com_1',
    memberCount: 1847,
    activeToday: 318,
    weeklyGrowthPercentage: 24,
    rating: 4.8,
    reviewCount: 142,
    lastCalculatedAt: new Date(),
  },
  'com_2': {
    communityId: 'com_2',
    memberCount: 890,
    activeToday: 145,
    weeklyGrowthPercentage: 12,
    rating: 4.9,
    reviewCount: 85,
    lastCalculatedAt: new Date(),
  },
  'com_3': {
    communityId: 'com_3',
    memberCount: 4200,
    activeToday: 850,
    weeklyGrowthPercentage: 45,
    rating: 4.7,
    reviewCount: 320,
    lastCalculatedAt: new Date(),
  }
};

export const mockPlans: MembershipPlan[] = [
  {
    id: 'plan_1',
    communityId: 'com_1',
    name: 'Pro Membership',
    type: 'subscription',
    priceAmount: 1500, // $15.00
    priceCurrency: 'USD',
    interval: 'month',
    isActive: true,
  },
  {
    id: 'plan_2',
    communityId: 'com_2',
    name: 'Shipyard Access',
    type: 'subscription',
    priceAmount: 2900,
    priceCurrency: 'USD',
    interval: 'month',
    isActive: true,
  },
  {
    id: 'plan_3',
    communityId: 'com_3',
    name: 'Free Access',
    type: 'free',
    priceAmount: 0,
    priceCurrency: 'USD',
    isActive: true,
  }
];
