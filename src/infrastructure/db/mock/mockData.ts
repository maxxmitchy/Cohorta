import { LearningProgress } from '../../../core/domain/progress';
import { Category } from '../../../core/domain/category';
import { Community } from '../../../core/domain/community';
import { CommunityStats } from '../../../core/domain/metrics';
import { MembershipPlan, Membership } from '../../../core/domain/membership';
import { RoadmapItem } from '../../../core/domain/learning';
import { User } from '../../../core/domain/user';

export const mockUsers: User[] = [
  {
    id: 'u1',
    email: 'sarah@example.com',
    name: 'Sarah AI',
    avatarUrl: 'https://i.pravatar.cc/150?u=sarah',
    role: 'creator',
    createdAt: new Date(),
  },
  {
    id: 'u2',
    email: 'mike@example.com',
    name: 'Mike Shipper',
    avatarUrl: 'https://i.pravatar.cc/150?u=mike',
    role: 'creator',
    createdAt: new Date(),
  },
  {
    id: 'u3',
    email: 'alex@example.com',
    name: 'Alex',
    avatarUrl: 'https://i.pravatar.cc/150?u=alex',
    role: 'creator',
    createdAt: new Date(),
  },
  {
    id: 'u4',
    email: 'founders@example.com',
    name: 'YC Founder Group',
    avatarUrl: 'https://i.pravatar.cc/150?u=founder',
    role: 'creator',
    createdAt: new Date(),
  },
  {
    id: 'u_visitor',
    email: 'visitor@example.com',
    name: 'Victor Visitor',
    avatarUrl: 'https://i.pravatar.cc/150?u=visitor',
    role: 'learner',
    createdAt: new Date(),
  },
  {
    id: 'u_member_partial',
    email: 'partial@example.com',
    name: 'Pamela Partial',
    avatarUrl: 'https://i.pravatar.cc/150?u=partial',
    role: 'learner',
    createdAt: new Date(),
  },
  {
    id: 'u_member_complete',
    email: 'complete@example.com',
    name: 'Colin Complete',
    avatarUrl: 'https://i.pravatar.cc/150?u=complete',
    role: 'learner',
    createdAt: new Date(),
  },
  {
    id: 'u_member_expired',
    email: 'expired@example.com',
    name: 'Evan Expired',
    avatarUrl: 'https://i.pravatar.cc/150?u=expired',
    role: 'learner',
    createdAt: new Date(),
  }
];

export const mockCategories: Category[] = [
  { id: 'c1', name: 'AI & Automation', slug: 'ai-automation' },
  { id: 'c2', name: 'Software Dev', slug: 'development' },
  { id: 'c3', name: 'Startups & Business', slug: 'startups' },
];

export const mockCommunities: Community[] = [
  {
    id: 'com_1',
    creatorId: 'u1',
    categoryId: 'c1',
    name: 'AI Agent Builders',
    description: 'We are a group of developers building real-world AI agents. We share our architectures, prompt strategies, and workflow automations every week. If you want to move from basic chat apps to persistent-memory multi-agent systems, join us.',
    skillLevel: 'Advanced',
    status: 'active',
    currentTopic: 'Agent Memory Systems',
    tags: ['Agents', 'OpenAI', 'RAG'],
    createdAt: new Date('2023-10-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'com_2',
    creatorId: 'u2',
    categoryId: 'c2',
    name: 'Full-Stack Shipyard',
    description: 'A cohort of developers shipping a new micro-startup every month. We learn Next.js, Tailwind, and Supabase by actually building products. Peer review is mandatory.',
    skillLevel: 'Intermediate',
    status: 'active',
    currentTopic: 'Database Architecture & Row Level Security',
    tags: ['Next.js', 'React', 'Supabase'],
    createdAt: new Date('2023-11-15T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'com_3',
    creatorId: 'u3',
    categoryId: 'c2',
    name: 'Cursor Power Users',
    description: 'Master AI-assisted coding. We share prompts, custom rules files, and workflows to 10x your shipping speed. Open to anyone who wants to write code faster.',
    skillLevel: 'All Levels',
    status: 'active',
    currentTopic: 'Writing perfect .cursorrules files',
    tags: ['Cursor', 'Prompting', 'Efficiency'],
    createdAt: new Date('2024-01-05T00:00:00Z'),
    updatedAt: new Date('2024-02-01T00:00:00Z'),
  },
  {
    id: 'com_4',
    creatorId: 'u4',
    categoryId: 'c3',
    name: 'Euro Startup Collective',
    description: 'Founders building profitable B2B SaaS companies in Europe. We discuss pricing strategies, GDPR compliance, enterprise sales, and hiring technical talent.',
    skillLevel: 'All Levels',
    status: 'active',
    currentTopic: 'Enterprise Pricing Tiers',
    tags: ['SaaS', 'B2B', 'Europe'],
    createdAt: new Date('2024-02-10T00:00:00Z'),
    updatedAt: new Date('2024-02-15T00:00:00Z'),
  }
];

export const mockMetrics: Record<string, CommunityStats> = {
  'com_1': {
    communityId: 'com_1',
    memberCount: 1847,
    activeToday: 87, // Specifically matching prompt request
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
  },
  'com_4': {
    communityId: 'com_4',
    memberCount: 230,
    activeToday: 42,
    weeklyGrowthPercentage: 5,
    rating: 5.0,
    reviewCount: 18,
    lastCalculatedAt: new Date(),
  }
};

export const mockPlans: MembershipPlan[] = [
  // com_1 is Paid only, USD
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
    id: 'plan_1b',
    communityId: 'com_1',
    name: 'Pro Lifetime',
    type: 'one_time',
    priceAmount: 15000, // $150.00
    priceCurrency: 'USD',
    interval: 'lifetime',
    isActive: true,
  },
  // com_2 is Mixed (Free and Paid), USD
  {
    id: 'plan_2_free',
    communityId: 'com_2',
    name: 'Observer',
    type: 'free',
    priceAmount: 0,
    priceCurrency: 'USD',
    isActive: true,
  },
  {
    id: 'plan_2_paid',
    communityId: 'com_2',
    name: 'Builder (Code Reviews)',
    type: 'subscription',
    priceAmount: 2900,
    priceCurrency: 'USD',
    interval: 'month',
    isActive: true,
  },
  // com_3 is Free only
  {
    id: 'plan_3',
    communityId: 'com_3',
    name: 'Open Access',
    type: 'free',
    priceAmount: 0,
    priceCurrency: 'USD',
    isActive: true,
  },
  // com_4 is Paid only, EUR, higher tier
  {
    id: 'plan_4',
    communityId: 'com_4',
    name: 'Collective Access',
    type: 'subscription',
    priceAmount: 9900, // €99.00
    priceCurrency: 'EUR',
    interval: 'month',
    isActive: true,
  },
  {
    id: 'plan_4b',
    communityId: 'com_4',
    name: 'Annual Access',
    type: 'subscription',
    priceAmount: 99000, // €990.00
    priceCurrency: 'EUR',
    interval: 'year',
    isActive: true,
  }
];

const now = new Date();

export const mockRoadmapItems: RoadmapItem[] = [
  // AI Agents Roadmap
  { id: 'r1_1', communityId: 'com_1', title: 'Foundations', description: 'Core concepts of LLMs and API usage', orderIndex: 1, status: 'completed', createdAt: now, updatedAt: now },
  { id: 'r1_2', communityId: 'com_1', title: 'Prompt Engineering', description: 'Advanced techniques for deterministic outputs', orderIndex: 2, status: 'completed', createdAt: now, updatedAt: now },
  { id: 'r1_3', communityId: 'com_1', title: 'Tool Calling', description: 'Letting agents interact with external APIs', orderIndex: 3, status: 'completed', createdAt: now, updatedAt: now },
  { id: 'r1_4', communityId: 'com_1', title: 'RAG', description: 'Retrieval Augmented Generation for proprietary data', orderIndex: 4, status: 'completed', createdAt: now, updatedAt: now },
  { id: 'r1_5', communityId: 'com_1', title: 'Agent Memory Systems', description: 'Building persistent memory using vector databases', orderIndex: 5, status: 'current', createdAt: now, updatedAt: now },
  { id: 'r1_6', communityId: 'com_1', title: 'Multi-Agent Systems', description: 'Orchestrating teams of specialized agents', orderIndex: 6, status: 'upcoming', createdAt: now, updatedAt: now },
  { id: 'r1_7', communityId: 'com_1', title: 'Production Deployment', description: 'Hosting, monitoring, and scaling agents', orderIndex: 7, status: 'upcoming', createdAt: now, updatedAt: now },
  
  // Full-Stack Shipyard Roadmap
  { id: 'r2_1', communityId: 'com_2', title: 'Next.js App Router', description: 'Server components and routing', orderIndex: 1, status: 'completed', createdAt: now, updatedAt: now },
  { id: 'r2_2', communityId: 'com_2', title: 'Database Architecture & Row Level Security', description: 'Secure data access with Supabase', orderIndex: 2, status: 'current', createdAt: now, updatedAt: now },
  { id: 'r2_3', communityId: 'com_2', title: 'Payments Integration', description: 'Setting up Stripe for SaaS', orderIndex: 3, status: 'upcoming', createdAt: now, updatedAt: now },
  
  // Cursor Power Users Roadmap
  { id: 'r3_1', communityId: 'com_3', title: 'Cursor Basics', description: 'Shortcuts and fundamental UI', orderIndex: 1, status: 'completed', createdAt: now, updatedAt: now },
  { id: 'r3_2', communityId: 'com_3', title: 'Writing perfect .cursorrules files', description: 'Tuning the AI to your project conventions', orderIndex: 2, status: 'current', createdAt: now, updatedAt: now },
  
  // Euro Startup Collective Roadmap
  { id: 'r4_1', communityId: 'com_4', title: 'Finding PMF', description: 'Validating the initial B2B problem', orderIndex: 1, status: 'completed', createdAt: now, updatedAt: now },
  { id: 'r4_2', communityId: 'com_4', title: 'Enterprise Pricing Tiers', description: 'Moving upmarket and structuring plans', orderIndex: 2, status: 'current', createdAt: now, updatedAt: now },
];




export const mockMemberships: Membership[] = [
  { id: 'm1', userId: 'u_member_partial', communityId: 'com_1', planId: 'plan_1', role: 'member', joinedAt: now, status: 'active' },
  { id: 'm2', userId: 'u_member_complete', communityId: 'com_1', planId: 'plan_1', role: 'member', joinedAt: now, status: 'active' },
  { id: 'm3', userId: 'u_member_expired', communityId: 'com_1', planId: 'plan_1', role: 'member', joinedAt: now, status: 'past_due' },
];

export const mockProgress: LearningProgress[] = [
  // Partial Member Progress (in com_1)
  { userId: 'u_member_partial', communityId: 'com_1', roadmapItemId: 'r1_1', status: 'completed', updatedAt: now, completedAt: now },
  { userId: 'u_member_partial', communityId: 'com_1', roadmapItemId: 'r1_2', status: 'completed', updatedAt: now, completedAt: now },
  { userId: 'u_member_partial', communityId: 'com_1', roadmapItemId: 'r1_3', status: 'current', updatedAt: now },
  { userId: 'u_member_partial', communityId: 'com_1', roadmapItemId: 'r1_4', status: 'locked', updatedAt: now },
  { userId: 'u_member_partial', communityId: 'com_1', roadmapItemId: 'r1_5', status: 'locked', updatedAt: now },
  { userId: 'u_member_partial', communityId: 'com_1', roadmapItemId: 'r1_6', status: 'locked', updatedAt: now },
  { userId: 'u_member_partial', communityId: 'com_1', roadmapItemId: 'r1_7', status: 'locked', updatedAt: now },
  
  // Complete Member Progress (in com_1)
  { userId: 'u_member_complete', communityId: 'com_1', roadmapItemId: 'r1_1', status: 'completed', updatedAt: now, completedAt: now },
  { userId: 'u_member_complete', communityId: 'com_1', roadmapItemId: 'r1_2', status: 'completed', updatedAt: now, completedAt: now },
  { userId: 'u_member_complete', communityId: 'com_1', roadmapItemId: 'r1_3', status: 'completed', updatedAt: now, completedAt: now },
  { userId: 'u_member_complete', communityId: 'com_1', roadmapItemId: 'r1_4', status: 'completed', updatedAt: now, completedAt: now },
  { userId: 'u_member_complete', communityId: 'com_1', roadmapItemId: 'r1_5', status: 'completed', updatedAt: now, completedAt: now },
  { userId: 'u_member_complete', communityId: 'com_1', roadmapItemId: 'r1_6', status: 'completed', updatedAt: now, completedAt: now },
  { userId: 'u_member_complete', communityId: 'com_1', roadmapItemId: 'r1_7', status: 'completed', updatedAt: now, completedAt: now },
];
