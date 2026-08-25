import { Category, Community, TimelineEvent, User } from './schema';

export const mockUsers: User[] = [
  { id: 'u1', name: 'Alice Founder', email: 'alice@example.com', role: 'creator', interests: ['AI', 'Startups'] },
  { id: 'u2', name: 'Bob Learner', email: 'bob@example.com', role: 'learner', interests: ['Automation', 'No-code'] }
];

export const mockCategories: Category[] = [
  { id: 'c1', name: 'AI & Automation', slug: 'ai-automation', icon: 'Bot' },
  { id: 'c2', name: 'Software Dev', slug: 'development', icon: 'Code' },
  { id: 'c3', name: 'Business & Growth', slug: 'business', icon: 'TrendingUp' }
];

export const mockCommunities: Community[] = [
  {
    id: 'com_1',
    creatorId: 'u1',
    name: 'AI Automation Builders',
    description: 'Learn to build real-world AI agents and automate your business using n8n, OpenAI, and Webhooks. We build a new project every week.',
    categoryId: 'c1',
    skillLevel: 'Beginner',
    priceMonthly: 15,
    memberCount: 1847,
    activeToday: 318,
    weeklyGrowthPercentage: 24,
    rating: 4.8,
    currentTopic: 'Building AI Agents with n8n',
    tags: ['n8n', 'OpenAI', 'Agents'],
    createdAt: '2023-10-01T00:00:00Z',
  },
  {
    id: 'com_2',
    creatorId: 'u1',
    name: 'Full-Stack Shipyard',
    description: 'A cohort of developers shipping a new micro-startup every month. Next.js, Tailwind, and Supabase focused.',
    categoryId: 'c2',
    skillLevel: 'Intermediate',
    priceMonthly: 29,
    memberCount: 890,
    activeToday: 145,
    weeklyGrowthPercentage: 12,
    rating: 4.9,
    currentTopic: 'Database Architecture & Row Level Security',
    tags: ['Next.js', 'React', 'Supabase'],
    createdAt: '2023-11-15T00:00:00Z',
  },
  {
    id: 'com_3',
    creatorId: 'u1',
    name: 'Cursor Power Users',
    description: 'Master AI-assisted coding. We share prompts, rules, and workflows to 10x your shipping speed.',
    categoryId: 'c1',
    skillLevel: 'All Levels',
    priceMonthly: 0,
    memberCount: 4200,
    activeToday: 850,
    weeklyGrowthPercentage: 45,
    rating: 4.7,
    currentTopic: 'Writing perfect .cursorrules files',
    tags: ['Cursor', 'Prompting', 'Efficiency'],
    createdAt: '2024-01-05T00:00:00Z',
  }
];

export const mockTimelines: TimelineEvent[] = [
  {
    id: 'tl_1',
    communityId: 'com_1',
    orderIndex: 0,
    dayRange: 'Day 1-5',
    title: 'AI Automation Fundamentals',
    summary: 'The community established the basics of what an agent is versus a simple LLM call. We explored basic node-based logic and set up our first cloud environments.',
    keyConcepts: ['LLMs vs Agents', 'Node-based logic', 'Cloud environments']
  },
  {
    id: 'tl_2',
    communityId: 'com_1',
    orderIndex: 1,
    dayRange: 'Day 6-10',
    title: 'APIs and Webhooks',
    summary: 'A deep dive into connecting systems. Many members struggled with authentication headers, but the community agreed that testing via Postman first is the best approach.',
    keyConcepts: ['REST APIs', 'Webhooks', 'Auth Headers', 'Postman debugging']
  },
  {
    id: 'tl_3',
    communityId: 'com_1',
    orderIndex: 2,
    dayRange: 'Day 11-17',
    title: 'Mastering n8n',
    summary: 'We transitioned from conceptual to practical by building our first multi-step workflows in n8n. The main project was a lead-qualification bot.',
    keyConcepts: ['n8n interface', 'Data mapping', 'Error handling', 'Conditional routing']
  }
];
