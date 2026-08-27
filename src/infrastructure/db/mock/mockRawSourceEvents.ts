import { ExternalCommunitySourceEvent } from '../../../core/source/ExternalCommunitySourceEvent';

const now = Date.now();
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

/**
 * Realistic mock raw source events dataset representing messy community chat streams:
 * - Out-of-order deliveries
 * - Duplicate events
 * - Message edits and deletions
 * - Thread replies and orphaned replies
 * - Social chatter and noise
 * - Forwarded quotes and resource sharing
 */
export const mockRawSourceEvents: ExternalCommunitySourceEvent[] = [
  // Community 1: Topic 1 (ReAct Foundations)
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_001',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_101',
    eventType: 'message_created',
    author: {
      externalUserId: 'u_marcus',
      displayName: 'Marcus Vance',
      avatarUrl: 'https://i.pravatar.cc/150?u=marcus',
      roleHint: 'mentor',
    },
    content: 'How do you structure the intermediate Thought-Action-Observation loop to prevent infinite prompt recursion?',
    timestamp: new Date(now - 30 * ONE_DAY),
    sequenceId: 1,
    roadmapItemId: 'r1',
    topicHint: 'ReAct Agent Foundations',
  },
  // Duplicate of ev_001 arriving later
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_001_dup',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_101',
    eventType: 'message_created',
    author: {
      externalUserId: 'u_marcus',
      displayName: 'Marcus Vance',
      avatarUrl: 'https://i.pravatar.cc/150?u=marcus',
      roleHint: 'mentor',
    },
    content: 'How do you structure the intermediate Thought-Action-Observation loop to prevent infinite prompt recursion?',
    timestamp: new Date(now - 30 * ONE_DAY),
    sequenceId: 1,
    roadmapItemId: 'r1',
    topicHint: 'ReAct Agent Foundations',
  },
  // Reply to msg_101 with an accepted answer and resource link
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_002',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_102',
    externalParentMessageId: 'msg_101',
    eventType: 'reply_created',
    author: {
      externalUserId: 'u_sarah',
      displayName: 'Sarah Chen',
      avatarUrl: 'https://i.pravatar.cc/150?u=sarah',
      roleHint: 'creator',
    },
    content: 'Set a hard iteration budget (max 5) and enforce strict JSON schemas for tool call observations. Check the paper: https://arxiv.org/abs/2210.03629',
    timestamp: new Date(now - 30 * ONE_DAY + 2 * ONE_HOUR),
    sequenceId: 2,
    roadmapItemId: 'r1',
    topicHint: 'ReAct Agent Foundations',
    metadata: {
      isAnswerHint: true,
      stanceHint: 'supporting',
    },
  },
  // Social chatter noise
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_003',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_103',
    eventType: 'message_created',
    author: {
      externalUserId: 'u_random',
      displayName: 'Alex Member',
      avatarUrl: '',
      roleHint: 'member',
    },
    content: 'Good morning everyone! 🔥',
    timestamp: new Date(now - 29 * ONE_DAY),
    sequenceId: 3,
    roadmapItemId: 'r1',
    topicHint: 'ReAct Agent Foundations',
  },
  // Multi-message consecutive sequence: User sends 3 rapid messages
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_004',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_104_1',
    eventType: 'message_created',
    author: {
      externalUserId: 'u_elena',
      displayName: 'Elena Rostova',
      avatarUrl: 'https://i.pravatar.cc/150?u=elena',
      roleHint: 'member',
    },
    content: 'I noticed a weird latency spike when chaining SQLite tool calls in LangChain.',
    timestamp: new Date(now - 28 * ONE_DAY),
    sequenceId: 4,
    roadmapItemId: 'r1',
    topicHint: 'ReAct Agent Foundations',
  },
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_005',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_104_2',
    eventType: 'message_created',
    author: {
      externalUserId: 'u_elena',
      displayName: 'Elena Rostova',
      avatarUrl: 'https://i.pravatar.cc/150?u=elena',
      roleHint: 'member',
    },
    content: 'Specifically, it seems the in-memory connection pool gets starved during parallel sub-agent queries.',
    timestamp: new Date(now - 28 * ONE_DAY + 60 * 1000), // 1 min later
    sequenceId: 5,
    roadmapItemId: 'r1',
    topicHint: 'ReAct Agent Foundations',
  },
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_006',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_104_3',
    eventType: 'message_created',
    author: {
      externalUserId: 'u_elena',
      displayName: 'Elena Rostova',
      avatarUrl: 'https://i.pravatar.cc/150?u=elena',
      roleHint: 'member',
    },
    content: 'Has anyone benchmarked WAL mode with concurrent readers? https://github.com/sqlite/benchmarks',
    timestamp: new Date(now - 28 * ONE_DAY + 120 * 1000), // 2 mins later
    sequenceId: 6,
    roadmapItemId: 'r1',
    topicHint: 'ReAct Agent Foundations',
  },
  // Debate with differing perspectives: Single vs Multi Agent
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_007',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_201',
    eventType: 'message_created',
    author: {
      externalUserId: 'u_david',
      displayName: 'David K.',
      avatarUrl: 'https://i.pravatar.cc/150?u=david',
      roleHint: 'member',
    },
    content: 'Should we build tool orchestration as a single monolith agent or a supervisor routing to specialized sub-agents?',
    timestamp: new Date(now - 20 * ONE_DAY),
    sequenceId: 7,
    roadmapItemId: 'r2',
    topicHint: 'Tool Use & Function Calling',
  },
  // Reply supporting supervisor
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_008',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_202',
    externalParentMessageId: 'msg_201',
    eventType: 'reply_created',
    author: {
      externalUserId: 'u_sarah',
      displayName: 'Sarah Chen',
      avatarUrl: 'https://i.pravatar.cc/150?u=sarah',
      roleHint: 'creator',
    },
    content: 'Supervisor routing scales much better once you have >8 tools because prompt context degradation kills accuracy.',
    timestamp: new Date(now - 20 * ONE_DAY + 1 * ONE_HOUR),
    sequenceId: 8,
    roadmapItemId: 'r2',
    topicHint: 'Tool Use & Function Calling',
    metadata: {
      stanceHint: 'supporting',
    },
  },
  // Reply advocating single agent with tight schemas
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_009',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_203',
    externalParentMessageId: 'msg_201',
    eventType: 'reply_created',
    author: {
      externalUserId: 'u_marcus',
      displayName: 'Marcus Vance',
      avatarUrl: 'https://i.pravatar.cc/150?u=marcus',
      roleHint: 'mentor',
    },
    content: 'On the other hand, supervisor hops add 800ms of latency per turn. A single agent with well-named tool definitions works up to 15 tools.',
    timestamp: new Date(now - 19 * ONE_DAY),
    sequenceId: 9,
    roadmapItemId: 'r2',
    topicHint: 'Tool Use & Function Calling',
    metadata: {
      stanceHint: 'opposing',
    },
  },
  // Message edit example
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_010_create',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_301',
    eventType: 'message_created',
    author: {
      externalUserId: 'u_dev',
      displayName: 'Dev User',
      avatarUrl: '',
      roleHint: 'member',
    },
    content: 'Use standard REST API for agent endpoints.',
    timestamp: new Date(now - 15 * ONE_DAY),
    sequenceId: 10,
    roadmapItemId: 'r3',
    topicHint: 'Production Deployment',
  },
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_010_edit',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_301',
    eventType: 'message_edited',
    author: {
      externalUserId: 'u_dev',
      displayName: 'Dev User',
      avatarUrl: '',
      roleHint: 'member',
    },
    content: 'Use standard REST API for agent endpoints with SSE streaming for real-time token chunks.',
    timestamp: new Date(now - 15 * ONE_DAY + 30 * 60 * 1000),
    sequenceId: 11,
    roadmapItemId: 'r3',
    topicHint: 'Production Deployment',
  },
  // Message deleted example
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_011_create',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_spam_1',
    eventType: 'message_created',
    author: {
      externalUserId: 'u_bot',
      displayName: 'Spam Bot',
      avatarUrl: '',
      roleHint: 'member',
    },
    content: 'BUY CRYPTO NOW AT http://spam.example.com',
    timestamp: new Date(now - 10 * ONE_DAY),
    sequenceId: 12,
    roadmapItemId: 'r3',
    topicHint: 'Production Deployment',
  },
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_011_delete',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_spam_1',
    eventType: 'message_deleted',
    timestamp: new Date(now - 10 * ONE_DAY + 5 * 60 * 1000),
    sequenceId: 13,
    roadmapItemId: 'r3',
  },
  // Orphaned reply: parent message never arrived in the feed
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_012_orphan',
    externalCommunityId: 'ext_comm_alpha',
    externalMessageId: 'msg_orphan_rep_1',
    externalParentMessageId: 'msg_unimported_parent_999',
    eventType: 'reply_created',
    author: {
      externalUserId: 'u_charlie',
      displayName: 'Charlie D.',
      avatarUrl: '',
      roleHint: 'member',
    },
    content: 'Yes, I completely agree with that timeout threshold.',
    timestamp: new Date(now - 5 * ONE_DAY),
    sequenceId: 14,
    roadmapItemId: 'r3',
    topicHint: 'Production Deployment',
  },
  // Cross-community test: Same externalMessageId 'msg_101' in a DIFFERENT external community 'ext_comm_beta'
  {
    provider: 'simulated_chat_stream',
    externalEventId: 'ev_beta_001',
    externalCommunityId: 'ext_comm_beta',
    externalMessageId: 'msg_101', // Same ID as alpha, but completely isolated
    eventType: 'message_created',
    author: {
      externalUserId: 'u_beta_founder',
      displayName: 'Beta Founder',
      avatarUrl: '',
      roleHint: 'creator',
    },
    content: 'Welcome to the B2B SaaS Founders Cohort!',
    timestamp: new Date(now - 25 * ONE_DAY),
    sequenceId: 1,
    roadmapItemId: 'r_b2b_1',
    topicHint: 'B2B Sales Motion',
  },
];
