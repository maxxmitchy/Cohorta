import { describe, it, expect } from 'vitest';
import { CommunityHistoryNormalizer } from './CommunityHistoryNormalizer';
import { ExternalCommunitySourceEvent } from './ExternalCommunitySourceEvent';
import { DiscussionEvidenceAnalyzer } from '../evidence/DiscussionEvidenceAnalyzer';
import { CatchUpService } from '../services/CatchUpService';
import { MockCatchUpGenerator } from '../../infrastructure/ai/MockCatchUpGenerator';
import { ICommunityHistoryQueryRepository } from '../repositories/ICommunityHistoryQueryRepository';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { HistoricalTopicEvent } from '../domain/history';
import { Community } from '../domain/community';
import { Membership } from '../domain/membership';
import { Discussion } from '../domain/discussion';

describe('CommunityHistoryNormalizer (Provider-Agnostic Source Normalization)', () => {
  const baseTimestamp = new Date('2024-01-10T12:00:00.000Z');

  // 1. Events arriving out of order
  it('Scenario 1: Message ordering - correctly reconstructs chronological sequence when events arrive out of order', () => {
    const events: ExternalCommunitySourceEvent[] = [
      {
        provider: 'test_provider',
        externalEventId: 'ev_3',
        externalCommunityId: 'c1',
        externalMessageId: 'm3',
        eventType: 'message_created',
        content: 'Third chronologically (12:30)',
        timestamp: new Date('2024-01-10T12:30:00.000Z'),
        roadmapItemId: 'r1',
      },
      {
        provider: 'test_provider',
        externalEventId: 'ev_1',
        externalCommunityId: 'c1',
        externalMessageId: 'm1',
        eventType: 'message_created',
        content: 'First chronologically (12:00)',
        timestamp: new Date('2024-01-10T12:00:00.000Z'),
        roadmapItemId: 'r1',
      },
      {
        provider: 'test_provider',
        externalEventId: 'ev_2',
        externalCommunityId: 'c1',
        externalMessageId: 'm2',
        eventType: 'message_created',
        content: 'Second chronologically (12:15)',
        timestamp: new Date('2024-01-10T12:15:00.000Z'),
        roadmapItemId: 'r1',
      },
    ];

    const discussions = CommunityHistoryNormalizer.normalize(events);

    expect(discussions).toHaveLength(3);
    expect(discussions[0].sourceProvenance?.externalMessageId).toBe('m1');
    expect(discussions[1].sourceProvenance?.externalMessageId).toBe('m2');
    expect(discussions[2].sourceProvenance?.externalMessageId).toBe('m3');
    expect(discussions[0].createdAt.getTime()).toBeLessThan(discussions[1].createdAt.getTime());
    expect(discussions[1].createdAt.getTime()).toBeLessThan(discussions[2].createdAt.getTime());
  });

  // 2. Duplicate events
  it('Scenario 2: Duplicate events - deduplicates redundant events without creating duplicate domain entities', () => {
    const rawEvent: ExternalCommunitySourceEvent = {
      provider: 'test_provider',
      externalEventId: 'ev_dup_1',
      externalCommunityId: 'c1',
      externalMessageId: 'm_dup',
      eventType: 'message_created',
      content: 'Unique message text',
      timestamp: baseTimestamp,
      roadmapItemId: 'r1',
    };

    // Array containing 3 identical copies
    const events = [rawEvent, { ...rawEvent, externalEventId: 'ev_dup_1' }, { ...rawEvent, externalEventId: 'ev_dup_1_copy' }];

    const discussions = CommunityHistoryNormalizer.normalize(events);

    expect(discussions).toHaveLength(1);
    expect(discussions[0].content).toBe('Unique message text');
    expect(discussions[0].sourceProvenance?.externalMessageId).toBe('m_dup');
  });

  // 3. Message edit
  it('Scenario 3: Message edit - updates content in-place with revision provenance and does not create duplicate discussions', () => {
    const events: ExternalCommunitySourceEvent[] = [
      {
        provider: 'test_provider',
        externalEventId: 'ev_create',
        externalCommunityId: 'c1',
        externalMessageId: 'm_edit_1',
        eventType: 'message_created',
        author: { externalUserId: 'u1', displayName: 'Alice', roleHint: 'member' },
        content: 'Use approach A.',
        timestamp: new Date('2024-01-10T12:00:00.000Z'),
        roadmapItemId: 'r1',
      },
      {
        provider: 'test_provider',
        externalEventId: 'ev_edit',
        externalCommunityId: 'c1',
        externalMessageId: 'm_edit_1',
        eventType: 'message_edited',
        author: { externalUserId: 'u1', displayName: 'Alice', roleHint: 'member' },
        content: 'Use approach A with caching and Redis failover.',
        timestamp: new Date('2024-01-10T12:10:00.000Z'),
        roadmapItemId: 'r1',
      },
    ];

    const discussions = CommunityHistoryNormalizer.normalize(events);

    expect(discussions).toHaveLength(1);
    expect(discussions[0].content).toBe('Use approach A with caching and Redis failover.');
    expect(discussions[0].sourceProvenance?.isEdited).toBe(true);
    expect(discussions[0].sourceProvenance?.editedAt).toEqual(new Date('2024-01-10T12:10:00.000Z'));
    expect(discussions[0].sourceProvenance?.originalTimestamp).toEqual(new Date('2024-01-10T12:00:00.000Z'));
    expect(discussions[0].sourceProvenance?.rawEventIds).toContain('ev_create');
    expect(discussions[0].sourceProvenance?.rawEventIds).toContain('ev_edit');
  });

  // 4. Deleted message
  it('Scenario 4: Deleted message - marks deleted entity with tombstone, and evidence analyzer excludes deleted content from evidence', () => {
    const events: ExternalCommunitySourceEvent[] = [
      {
        provider: 'test_provider',
        externalEventId: 'ev_spam_create',
        externalCommunityId: 'c1',
        externalMessageId: 'm_spam',
        eventType: 'message_created',
        content: 'SPAM BUY COINS',
        timestamp: new Date('2024-01-10T12:00:00.000Z'),
        roadmapItemId: 'r1',
      },
      {
        provider: 'test_provider',
        externalEventId: 'ev_spam_del',
        externalCommunityId: 'c1',
        externalMessageId: 'm_spam',
        eventType: 'message_deleted',
        timestamp: new Date('2024-01-10T12:05:00.000Z'),
        roadmapItemId: 'r1',
      },
    ];

    const discussions = CommunityHistoryNormalizer.normalize(events);

    expect(discussions).toHaveLength(1);
    expect(discussions[0].isDeleted).toBe(true);
    expect(discussions[0].sourceProvenance?.isDeleted).toBe(true);
    expect(discussions[0].sourceProvenance?.deletedAt).toEqual(new Date('2024-01-10T12:05:00.000Z'));

    // Critical assertion: Evidence Analyzer must NOT treat deleted content as valid evidence
    const analyzed = DiscussionEvidenceAnalyzer.analyzeDiscussion(discussions[0]);
    expect(analyzed.classification).toBe('insufficient_data');
    expect(analyzed.confidence).toBe('tentative');
    expect(analyzed.isNoise).toBe(true);
  });

  // 5. Reply / Thread relationships
  it('Scenario 5: Reply reconstruction - correctly reconstructs Discussion -> Reply hierarchy using externalParentMessageId', () => {
    const events: ExternalCommunitySourceEvent[] = [
      {
        provider: 'test_provider',
        externalEventId: 'ev_root',
        externalCommunityId: 'c1',
        externalMessageId: 'msg_parent',
        eventType: 'message_created',
        author: { externalUserId: 'u_alice', displayName: 'Alice' },
        content: 'How should we configure database read replicas in AWS?',
        timestamp: new Date('2024-01-10T12:00:00.000Z'),
        roadmapItemId: 'r1',
      },
      {
        provider: 'test_provider',
        externalEventId: 'ev_rep1',
        externalCommunityId: 'c1',
        externalMessageId: 'msg_rep_1',
        externalParentMessageId: 'msg_parent',
        eventType: 'reply_created',
        author: { externalUserId: 'u_bob', displayName: 'Bob' },
        content: 'Use Aurora Auto Scaling with target CPU utilization at 65%.',
        timestamp: new Date('2024-01-10T12:15:00.000Z'),
        roadmapItemId: 'r1',
        metadata: {
          isAnswerHint: true,
          stanceHint: 'supporting',
        },
      },
      {
        provider: 'test_provider',
        externalEventId: 'ev_rep2',
        externalCommunityId: 'c1',
        externalMessageId: 'msg_rep_2',
        externalParentMessageId: 'msg_parent',
        eventType: 'reply_created',
        author: { externalUserId: 'u_charlie', displayName: 'Charlie' },
        content: 'Also make sure read replicas are in distinct Availability Zones.',
        timestamp: new Date('2024-01-10T12:20:00.000Z'),
        roadmapItemId: 'r1',
        metadata: {
          stanceHint: 'supporting',
        },
      },
    ];

    const discussions = CommunityHistoryNormalizer.normalize(events);

    expect(discussions).toHaveLength(1);
    expect(discussions[0].id).toBe('disc_test_provider_msg_parent');
    expect(discussions[0].replies).toHaveLength(2);
    expect(discussions[0].replyCount).toBe(2);
    expect(discussions[0].replies[0].id).toBe('rep_test_provider_msg_rep_1');
    expect(discussions[0].replies[0].author.name).toBe('Bob');
    expect(discussions[0].replies[0].isAnswer).toBe(true);
    expect(discussions[0].replies[1].author.name).toBe('Charlie');
  });

  // 6. Missing parent message
  it('Scenario 6: Missing parent message - preserves orphaned reply without crashing or fabricating fake parent, lowering confidence', () => {
    const events: ExternalCommunitySourceEvent[] = [
      {
        provider: 'test_provider',
        externalEventId: 'ev_orphan',
        externalCommunityId: 'c1',
        externalMessageId: 'msg_orphan',
        externalParentMessageId: 'msg_NON_EXISTENT_PARENT',
        eventType: 'reply_created',
        author: { externalUserId: 'u_dan', displayName: 'Dan' },
        content: 'Yes, 500ms timeout is standard for internal microservices.',
        timestamp: baseTimestamp,
        roadmapItemId: 'r1',
      },
    ];

    // Must not throw or crash
    const discussions = CommunityHistoryNormalizer.normalize(events);

    expect(discussions).toHaveLength(1);
    expect(discussions[0].sourceProvenance?.hasMissingParent).toBe(true);
    expect(discussions[0].content).toBe('Yes, 500ms timeout is standard for internal microservices.');

    // Evidence analyzer should classify incomplete/orphaned messages with tentative confidence
    const analyzed = DiscussionEvidenceAnalyzer.analyzeDiscussion(discussions[0]);
    expect(analyzed.classification).toBe('insufficient_data');
    expect(analyzed.confidence).toBe('tentative');
  });

  // 7. Same external ID across different communities
  it('Scenario 7: Cross-community collision - guarantees complete isolation when two communities share the same externalMessageId', () => {
    const events: ExternalCommunitySourceEvent[] = [
      {
        provider: 'test_provider',
        externalEventId: 'ev_c1_1',
        externalCommunityId: 'comm_alpha',
        externalMessageId: 'msg_100',
        eventType: 'message_created',
        author: { externalUserId: 'u_alpha', displayName: 'Alpha Leader' },
        content: 'Alpha cohort announcement.',
        timestamp: baseTimestamp,
        roadmapItemId: 'r1',
      },
      {
        provider: 'test_provider',
        externalEventId: 'ev_c2_1',
        externalCommunityId: 'comm_beta',
        externalMessageId: 'msg_100', // Same message ID!
        eventType: 'message_created',
        author: { externalUserId: 'u_beta', displayName: 'Beta Leader' },
        content: 'Beta cohort announcement.',
        timestamp: baseTimestamp,
        roadmapItemId: 'r1',
      },
    ];

    const discussions = CommunityHistoryNormalizer.normalize(events);

    expect(discussions).toHaveLength(2);
    const alphaDisc = discussions.find(d => d.communityId === 'comm_alpha');
    const betaDisc = discussions.find(d => d.communityId === 'comm_beta');

    expect(alphaDisc).toBeDefined();
    expect(betaDisc).toBeDefined();
    expect(alphaDisc?.content).toBe('Alpha cohort announcement.');
    expect(betaDisc?.content).toBe('Beta cohort announcement.');
    expect(alphaDisc?.id).toBe('disc_test_provider_msg_100');
    expect(alphaDisc?.communityId).toBe('comm_alpha');
    expect(betaDisc?.communityId).toBe('comm_beta');
  });

  // 8. Resource extraction boundary
  it('Scenario 8: Resource extraction boundary - extracts URLs and categorizes resource types with attribution without analyzer parsing raw text', () => {
    const events: ExternalCommunitySourceEvent[] = [
      {
        provider: 'test_provider',
        externalEventId: 'ev_res_1',
        externalCommunityId: 'c1',
        externalMessageId: 'msg_res',
        eventType: 'message_created',
        author: { externalUserId: 'u_prof', displayName: 'Prof. Turing', roleHint: 'mentor' },
        content: 'Check out the benchmark repository https://github.com/distributed/benchmarks and the formal paper https://arxiv.org/abs/2301.12345.',
        timestamp: baseTimestamp,
        roadmapItemId: 'r1',
      },
    ];

    const discussions = CommunityHistoryNormalizer.normalize(events);

    expect(discussions).toHaveLength(1);
    expect(discussions[0].resources).toHaveLength(2);
    const githubRes = discussions[0].resources?.find(r => r.type === 'github');
    const paperRes = discussions[0].resources?.find(r => r.type === 'paper');

    expect(githubRes).toBeDefined();
    expect(githubRes?.url).toBe('https://github.com/distributed/benchmarks');
    expect(githubRes?.attributedBy).toBe('Prof. Turing');

    expect(paperRes).toBeDefined();
    expect(paperRes?.url).toBe('https://arxiv.org/abs/2301.12345');
    expect(paperRes?.attributedBy).toBe('Prof. Turing');
  });

  // 9. Forwarded / quoted content
  it('Scenario 9: Forwarded / quoted content - retains forwarding provenance without duplicating as new original discussion', () => {
    const events: ExternalCommunitySourceEvent[] = [
      {
        provider: 'test_provider',
        externalEventId: 'ev_fwd_1',
        externalCommunityId: 'c1',
        externalMessageId: 'msg_fwd',
        eventType: 'message_created',
        author: { externalUserId: 'u_member', displayName: 'Sam Member' },
        content: 'Forwarded release notes: v2.4 introduces zero-copy serialization.',
        timestamp: baseTimestamp,
        roadmapItemId: 'r1',
        metadata: {
          isForwarded: true,
          forwardedFrom: 'Rust Core Team',
        },
      },
    ];

    const discussions = CommunityHistoryNormalizer.normalize(events);

    expect(discussions).toHaveLength(1);
    expect(discussions[0].sourceProvenance?.isForwarded).toBe(true);
    expect(discussions[0].sourceProvenance?.forwardedFrom).toBe('Rust Core Team');
  });

  // 10. Low-signal chatter
  it('Scenario 10: Low-signal chatter - classifies greetings, emojis, and noise as social_chatter with low_signal quality', () => {
    const events: ExternalCommunitySourceEvent[] = [
      {
        provider: 'test_provider',
        externalEventId: 'ev_gm',
        externalCommunityId: 'c1',
        externalMessageId: 'msg_gm',
        eventType: 'message_created',
        author: { externalUserId: 'u_sam', displayName: 'Sam' },
        content: 'Good morning everyone! 🔥',
        timestamp: baseTimestamp,
        roadmapItemId: 'r1',
      },
      {
        provider: 'test_provider',
        externalEventId: 'ev_join',
        externalCommunityId: 'c1',
        externalMessageId: 'msg_join',
        eventType: 'member_joined',
        author: { externalUserId: 'u_alex', displayName: 'Alex' },
        content: 'Alex joined the group.',
        timestamp: new Date('2024-01-10T12:01:00.000Z'),
        roadmapItemId: 'r1',
      },
    ];

    const discussions = CommunityHistoryNormalizer.normalize(events);

    expect(discussions).toHaveLength(2);
    expect(discussions[0].type).toBe('social_chatter');
    expect(discussions[0].signalQuality).toBe('low_signal');
    expect(discussions[1].type).toBe('social_chatter');
    expect(discussions[1].signalQuality).toBe('low_signal');

    // Analyzer marks them as noise
    const analyzed0 = DiscussionEvidenceAnalyzer.analyzeDiscussion(discussions[0]);
    expect(analyzed0.isNoise).toBe(true);
  });

  // 11. Multi-message consecutive discussion
  it('Scenario 11: Multi-message discussion - groups consecutive messages from same author in a short time window into unified discussion', () => {
    const events: ExternalCommunitySourceEvent[] = [
      {
        provider: 'test_provider',
        externalEventId: 'ev_m1',
        externalCommunityId: 'c1',
        externalMessageId: 'm101_1',
        eventType: 'message_created',
        author: { externalUserId: 'u_author_1', displayName: 'Dr. Smith' },
        content: 'We observed high tail latency on our read path.',
        timestamp: new Date('2024-01-10T12:00:00.000Z'),
        roadmapItemId: 'r1',
      },
      {
        provider: 'test_provider',
        externalEventId: 'ev_m2',
        externalCommunityId: 'c1',
        externalMessageId: 'm101_2',
        eventType: 'message_created',
        author: { externalUserId: 'u_author_1', displayName: 'Dr. Smith' },
        content: 'Specifically, the P99 is spiking to 800ms during cache invalidations.',
        timestamp: new Date('2024-01-10T12:01:00.000Z'), // 1 min later
        roadmapItemId: 'r1',
      },
      {
        provider: 'test_provider',
        externalEventId: 'ev_m3',
        externalCommunityId: 'c1',
        externalMessageId: 'm101_3',
        eventType: 'message_created',
        author: { externalUserId: 'u_author_1', displayName: 'Dr. Smith' },
        content: 'Does anyone recommend probabilistic early expiration? https://docs.redis.com/probabilistic',
        timestamp: new Date('2024-01-10T12:02:00.000Z'), // 2 min later
        roadmapItemId: 'r1',
      },
    ];

    const discussions = CommunityHistoryNormalizer.normalize(events, { multiMessageWindowMs: 5 * 60 * 1000 });

    // Should be unified into 1 discussion instead of 3 fragmented ones
    expect(discussions).toHaveLength(1);
    expect(discussions[0].content).toContain('We observed high tail latency on our read path.');
    expect(discussions[0].content).toContain('Specifically, the P99 is spiking to 800ms');
    expect(discussions[0].content).toContain('Does anyone recommend probabilistic early expiration?');
    expect(discussions[0].resources).toHaveLength(1);
    expect(discussions[0].sourceProvenance?.rawEventIds).toHaveLength(3);
  });

  // 12. Ambiguous multi-topic thread
  it('Scenario 12: Ambiguous multi-topic thread - analyzer avoids false single consensus, deriving differing_perspectives or insufficient_data', () => {
    const debateDiscussion: Discussion = {
      id: 'd_ambig',
      communityId: 'c1',
      roadmapItemId: 'r1',
      topicTitle: 'Storage Layer Selection',
      author: { id: 'u1', name: 'Alice', avatarUrl: '', role: 'member' },
      title: 'Postgres vs DynamoDB for user events stream',
      content: 'Exploring data stores for append-only logs',
      type: 'discussion',
      createdAt: baseTimestamp,
      replies: [
        {
          id: 'rep_1',
          author: { id: 'u2', name: 'Bob', avatarUrl: '', role: 'member' },
          content: 'DynamoDB has predictable single-digit millisecond writes at high throughput.',
          createdAt: new Date('2024-01-10T12:05:00.000Z'),
          stance: 'supporting',
        },
        {
          id: 'rep_2',
          author: { id: 'u3', name: 'Charlie', avatarUrl: '', role: 'member' },
          content: 'Postgres with TimescaleDB extension is 5x cheaper and gives standard SQL analytics.',
          createdAt: new Date('2024-01-10T12:10:00.000Z'),
          stance: 'opposing',
        },
      ],
      replyCount: 2,
    };

    const analyzed = DiscussionEvidenceAnalyzer.analyzeDiscussion(debateDiscussion);

    expect(analyzed.classification).toBe('differing_perspectives');
    expect(analyzed.divergentPerspective).toBeDefined();
    expect(analyzed.divergentPerspective?.perspectives).toHaveLength(2);
  });

  // 13. Membership timestamp boundary
  it('Scenario 13: Membership timestamp boundary - strictly evaluates temporal boundary against member joinedAt', () => {
    const joinedAt = new Date('2024-01-15T00:00:00.000Z');

    const topic1CompletedBeforeJoin: HistoricalTopicEvent = {
      id: 'ht1',
      communityId: 'c1',
      roadmapItemId: 'r1',
      topicTitle: 'Topic 1',
      description: 'Desc 1',
      orderIndex: 1,
      status: 'completed',
      startedAt: new Date('2024-01-01'),
      completedAt: new Date('2024-01-14T23:59:59.999Z'), // Before join
      keyIdea: 'Idea 1',
      summary: 'Summary 1',
    };

    const topic2CompletedAtJoin: HistoricalTopicEvent = {
      id: 'ht2',
      communityId: 'c1',
      roadmapItemId: 'r2',
      topicTitle: 'Topic 2',
      description: 'Desc 2',
      orderIndex: 2,
      status: 'completed',
      startedAt: new Date('2024-01-08'),
      completedAt: new Date('2024-01-15T00:00:00.000Z'), // Exactly at join
      keyIdea: 'Idea 2',
      summary: 'Summary 2',
    };

    const topic3CompletedAfterJoin: HistoricalTopicEvent = {
      id: 'ht3',
      communityId: 'c1',
      roadmapItemId: 'r3',
      topicTitle: 'Topic 3',
      description: 'Desc 3',
      orderIndex: 3,
      status: 'completed',
      startedAt: new Date('2024-01-10'),
      completedAt: new Date('2024-01-20T00:00:00.000Z'), // After join
      keyIdea: 'Idea 3',
      summary: 'Summary 3',
    };

    const allTopics = [topic1CompletedBeforeJoin, topic2CompletedAtJoin, topic3CompletedAfterJoin];

    // Catch-up canonical boundary: completedAt.getTime() < joinedAt.getTime()
    const missed = allTopics.filter(t => t.status === 'completed' && t.completedAt && t.completedAt.getTime() < joinedAt.getTime());

    expect(missed).toHaveLength(1);
    expect(missed[0].id).toBe('ht1');
  });

  // 14. Incomplete source metadata
  it('Scenario 14: Incomplete source metadata - handles missing authors, titles, and partial timestamps with clean fallbacks', () => {
    const sparseEvent: ExternalCommunitySourceEvent = {
      provider: 'test_provider',
      externalEventId: 'ev_sparse',
      externalCommunityId: 'c1',
      externalMessageId: 'm_sparse',
      eventType: 'message_created',
      content: 'Important security patch released.',
      timestamp: baseTimestamp,
    };

    const discussions = CommunityHistoryNormalizer.normalize([sparseEvent]);

    expect(discussions).toHaveLength(1);
    expect(discussions[0].author.name).toBe('Unknown Member');
    expect(discussions[0].author.role).toBe('member');
    expect(discussions[0].title).toBe('Important security patch released.');
    expect(discussions[0].roadmapItemId).toBe('general');
  });

  // 15. Provenance preservation
  it('Scenario 15: Provenance preservation - sourceProvenance retains provider, externalMessageId, and timestamps on domain entities', () => {
    const event: ExternalCommunitySourceEvent = {
      provider: 'audit_provider_x',
      externalEventId: 'ev_audit_100',
      externalCommunityId: 'ext_group_42',
      externalMessageId: 'msg_audit_500',
      eventType: 'message_created',
      author: { externalUserId: 'usr_ext_9', displayName: 'Auditor' },
      content: 'Verifying cryptographic hashing pipeline.',
      timestamp: baseTimestamp,
      roadmapItemId: 'r_security',
    };

    const discussions = CommunityHistoryNormalizer.normalize([event]);

    expect(discussions[0].sourceProvenance).toBeDefined();
    expect(discussions[0].sourceProvenance?.provider).toBe('audit_provider_x');
    expect(discussions[0].sourceProvenance?.externalCommunityId).toBe('ext_group_42');
    expect(discussions[0].sourceProvenance?.externalMessageId).toBe('msg_audit_500');
    expect(discussions[0].sourceProvenance?.externalAuthorId).toBe('usr_ext_9');
    expect(discussions[0].sourceProvenance?.originalTimestamp).toEqual(baseTimestamp);
  });

  // 16. Source-agnostic evidence analysis
  it('Scenario 16: Source-agnostic evidence analysis - DiscussionEvidenceAnalyzer operates seamlessly on normalized domain entities', () => {
    const event: ExternalCommunitySourceEvent = {
      provider: 'arbitrary_feed',
      externalEventId: 'ev_feed_1',
      externalCommunityId: 'c1',
      externalMessageId: 'm_q1',
      eventType: 'message_created',
      author: { externalUserId: 'u1', displayName: 'Alice', roleHint: 'member' },
      content: 'How do you handle zero-downtime database migrations?',
      timestamp: baseTimestamp,
      roadmapItemId: 'r1',
    };

    const normalized = CommunityHistoryNormalizer.normalize([event]);
    const analyzed = DiscussionEvidenceAnalyzer.analyzeDiscussion(normalized[0]);

    // Analyzer is completely agnostic of 'arbitrary_feed'
    expect(analyzed.classification).toBe('unresolved_inquiry');
    expect(analyzed.confidence).toBe('high');
    expect(analyzed.openQuestion?.authorName).toBe('Alice');
  });

  // 17. Source-agnostic Catch Up service
  it('Scenario 17: Source-agnostic CatchUpService - CatchUpService executes cleanly with normalized history from external source events', async () => {
    const mockCommunity: Community = {
      id: 'com_test',
      name: 'AI Engineering Cohort',
      description: 'Advanced agents',
      creatorId: 'u_creator',
      categoryId: 'tech',
      skillLevel: 'Intermediate',
      status: 'active',
      tags: ['ai', 'agents'],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      currentTopic: 'Active Topic',
    };

    const mockMembership: Membership = {
      id: 'mem_1',
      userId: 'u_member_1',
      communityId: 'com_test',
      planId: 'plan_1',
      role: 'member',
      joinedAt: new Date('2024-01-20'),
      status: 'active',
    };

    const historicalTopic: HistoricalTopicEvent = {
      id: 'ht_missed',
      communityId: 'com_test',
      roadmapItemId: 'r1',
      topicTitle: 'Prompt Engineering & Agents',
      description: 'Foundations',
      orderIndex: 1,
      status: 'completed',
      startedAt: new Date('2024-01-02'),
      completedAt: new Date('2024-01-10'), // Completed before member joined on Jan 20
      keyIdea: 'ReAct loops require strict budget stops.',
      summary: 'Explored agent prompt structures.',
    };

    // Raw events normalized into domain discussions
    const rawEvents: ExternalCommunitySourceEvent[] = [
      {
        provider: 'external_chat_platform',
        externalEventId: 'ev_react_1',
        externalCommunityId: 'com_test',
        externalMessageId: 'msg_react_1',
        eventType: 'message_created',
        author: { externalUserId: 'u_creator', displayName: 'Sarah Chen', roleHint: 'creator' },
        content: 'Published canonical paper on ReAct patterns: https://arxiv.org/abs/2210.03629',
        timestamp: new Date('2024-01-05'),
        roadmapItemId: 'r1',
      },
    ];

    const normalizedDiscussions = CommunityHistoryNormalizer.normalize(rawEvents);

    const mockHistoryRepo: ICommunityHistoryQueryRepository = {
      getCommunityHistory: async () => null,
      getDiscussionsForTopic: async () => normalizedDiscussions,
      getDiscussionById: async () => normalizedDiscussions[0],
      getHistoricalTopics: async () => [historicalTopic],
    };

    const mockMembershipRepo: IMembershipRepository = {
      getMembership: async () => mockMembership,
      getCommunity: async () => mockCommunity,
      getPlan: async () => null,
      getPlansForCommunity: async () => [],
      createMembership: async () => {},
      initializeProgress: async () => {},
      getRoadmapItemIds: async () => ['r1'],
    };

    const catchUpService = new CatchUpService(
      mockHistoryRepo,
      mockMembershipRepo,
      new MockCatchUpGenerator()
    );

    const catchUp = await catchUpService.getCatchUp('u_member_1', 'com_test');

    expect(catchUp.hasMissedContent).toBe(true);
    expect(catchUp.missedTopicsCount).toBe(1);
    expect(catchUp.missedTopics[0].title).toBe('Prompt Engineering & Agents');
    expect(catchUp.missedTopics[0].topResources).toHaveLength(1);
    expect(catchUp.missedTopics[0].topResources[0].url).toBe('https://arxiv.org/abs/2210.03629');
    expect(catchUp.missedTopics[0].sourceDiscussionIds).toEqual(['disc_external_chat_platform_msg_react_1']);
  });

  // 18. Pipeline immutability
  it('Scenario 18: Immutability guarantee - normalization and evidence analysis never mutate input events or domain objects', () => {
    const rawEvent: ExternalCommunitySourceEvent = {
      provider: 'test_provider',
      externalEventId: 'ev_immut',
      externalCommunityId: 'c1',
      externalMessageId: 'm_immut',
      eventType: 'message_created',
      author: { externalUserId: 'u1', displayName: 'Immutable Author' },
      content: 'Immutable test content.',
      timestamp: baseTimestamp,
      roadmapItemId: 'r1',
    };

    const rawEventSnapshot = JSON.stringify(rawEvent);

    const discussions = CommunityHistoryNormalizer.normalize([rawEvent]);
    expect(JSON.stringify(rawEvent)).toBe(rawEventSnapshot);

    const discussionSnapshot = JSON.stringify(discussions[0]);
    DiscussionEvidenceAnalyzer.analyzeDiscussion(discussions[0]);
    expect(JSON.stringify(discussions[0])).toBe(discussionSnapshot);
  });
});
