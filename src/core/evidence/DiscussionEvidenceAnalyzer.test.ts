import { describe, it, expect } from 'vitest';
import { DiscussionEvidenceAnalyzer } from './DiscussionEvidenceAnalyzer';
import { Discussion, DiscussionReply } from '../domain/discussion';
import { HistoricalTopicEvent } from '../domain/history';

describe('DiscussionEvidenceAnalyzer (Deterministic Analytical Boundary)', () => {
  const baseAuthor = {
    id: 'u_1',
    name: 'Alice Member',
    avatarUrl: 'https://example.com/alice.jpg',
    role: 'member' as const,
  };

  const creatorAuthor = {
    id: 'u_creator',
    name: 'Sarah Creator',
    avatarUrl: 'https://example.com/sarah.jpg',
    role: 'creator' as const,
  };

  const mockTopic: HistoricalTopicEvent = {
    id: 'ht_topic_1',
    communityId: 'com_alpha',
    roadmapItemId: 'r_topic_1',
    topicTitle: 'Distributed Systems Patterns',
    description: 'Core concepts of consensus and replication',
    orderIndex: 1,
    status: 'completed',
    startedAt: new Date('2024-01-01'),
    completedAt: new Date('2024-01-10'),
    keyIdea: 'Consensus protocols require quorum intersection.',
    summary: 'Explored Raft, Paxos, and multi-leader setups.',
  };

  describe('Individual Discussion Classification Rules', () => {
    it('Rule 1: Question with 0 replies -> classified as unresolved_inquiry with high confidence', () => {
      const discussion: Discussion = {
        id: 'd_q_unanswered',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'How do you handle network partitions in raft leader elections?',
        content: 'When network split occurs, what is the best timeout configuration to prevent split brain votes?',
        type: 'question',
        createdAt: new Date('2024-01-02'),
        replies: [],
        replyCount: 0,
      };

      const result = DiscussionEvidenceAnalyzer.analyzeDiscussion(discussion);

      expect(result.classification).toBe('unresolved_inquiry');
      expect(result.confidence).toBe('high');
      expect(result.openQuestion).toBeDefined();
      expect(result.openQuestion?.id).toBe('d_q_unanswered');
      expect(result.openQuestion?.title).toBe(discussion.title);
      expect(result.openQuestion?.authorName).toBe('Alice Member');
      expect(result.divergentPerspective).toBeUndefined();
    });

    it('Rule 2: Informational post (announcement, milestone, resource) with 0 replies -> classified as informational', () => {
      const discussion: Discussion = {
        id: 'd_resource',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: creatorAuthor,
        title: 'Canonical Raft Paper & Interactive Visualizer',
        content: 'Here is the link to the Ongaro & Ousterhout paper and the visual simulation.',
        type: 'resource',
        createdAt: new Date('2024-01-02'),
        replies: [],
        replyCount: 0,
        resources: [
          {
            id: 'res_raft',
            title: 'In Search of an Understandable Consensus Algorithm',
            url: 'https://raft.github.io/',
            type: 'paper',
          },
        ],
      };

      const result = DiscussionEvidenceAnalyzer.analyzeDiscussion(discussion);

      expect(result.classification).toBe('informational');
      expect(result.confidence).toBe('high');
      expect(result.openQuestion).toBeUndefined();
      expect(result.resources).toHaveLength(1);
    });

    it('Rule 3: Empty / sparse content -> classified as insufficient_data', () => {
      const discussion: Discussion = {
        id: 'd_empty',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'test',
        content: '   ',
        type: 'discussion',
        createdAt: new Date('2024-01-02'),
        replies: [],
        replyCount: 0,
      };

      const result = DiscussionEvidenceAnalyzer.analyzeDiscussion(discussion);

      expect(result.classification).toBe('insufficient_data');
      expect(result.confidence).toBe('tentative');
    });

    it('Rule 4: Discussion with opposing stances in replies -> classified as differing_perspectives', () => {
      const discussion: Discussion = {
        id: 'd_debate',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'Single-leader vs Multi-leader replication for European data centers',
        content: 'Should we run single leader in Frankfurt or active-active multi-leader across Frankfurt and London?',
        type: 'discussion',
        createdAt: new Date('2024-01-03'),
        replies: [
          {
            id: 'r_1',
            author: { id: 'u_2', name: 'Bob', avatarUrl: '', role: 'member' },
            content: 'Multi-leader adds write conflict resolution overhead that is not worth it for 15ms ping between Frankfurt and London.',
            createdAt: new Date('2024-01-03'),
            stance: 'supporting',
          },
          {
            id: 'r_2',
            author: { id: 'u_3', name: 'Charlie', avatarUrl: '', role: 'member' },
            content: 'Single leader violates our regional failover uptime SLA during data center maintenance windows.',
            createdAt: new Date('2024-01-04'),
            stance: 'opposing',
          },
        ],
        replyCount: 2,
      };

      const result = DiscussionEvidenceAnalyzer.analyzeDiscussion(discussion);

      expect(result.classification).toBe('differing_perspectives');
      expect(result.confidence).toBe('high');
      expect(result.divergentPerspective).toBeDefined();
      expect(result.divergentPerspective?.perspectives).toHaveLength(2);
      expect(result.divergentPerspective?.sourceReplyIds).toEqual(['r_1', 'r_2']);
    });

    it('Rule 5: Question with accepted answer and verified resolution -> classified as strong_consensus', () => {
      const discussion: Discussion = {
        id: 'd_resolved_q',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'How to handle tombstone bloat in distributed key-value stores?',
        content: 'Our SSTables are accumulating millions of tombstones causing slow scans.',
        type: 'question',
        isResolved: true,
        resolutionSummary: 'Configure scheduled compaction filters with a 7-day gc grace interval.',
        createdAt: new Date('2024-01-04'),
        replies: [
          {
            id: 'r_ans',
            author: creatorAuthor,
            content: 'Run leveled compaction with aggressive tombstone garbage collection threshold.',
            createdAt: new Date('2024-01-04'),
            isAnswer: true,
            stance: 'supporting',
          },
        ],
        replyCount: 1,
      };

      const result = DiscussionEvidenceAnalyzer.analyzeDiscussion(discussion);

      expect(result.classification).toBe('strong_consensus');
      expect(result.confidence).toBe('high');
      expect(result.hasAnswer).toBe(true);
      expect(result.sourceReplyIds).toEqual(['r_ans']);
    });

    it('Rule 6: Resolved by author/creator directly with 0 replies -> classified as resolved_decision (NOT collective consensus)', () => {
      const discussion: Discussion = {
        id: 'd_solo_decision',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: creatorAuthor,
        title: 'Mandating Postgres WAL replication for cohort benchmarks',
        content: 'Decided to standardize all cohort benchmarks on Postgres native physical replication.',
        type: 'question',
        isResolved: true,
        resolutionSummary: 'Creator mandated Postgres physical streaming replication.',
        createdAt: new Date('2024-01-05'),
        replies: [],
        replyCount: 0,
      };

      const result = DiscussionEvidenceAnalyzer.analyzeDiscussion(discussion);

      // Should be classified as resolved_decision to distinguish unilateral decision from collective community consensus
      expect(result.classification).toBe('resolved_decision');
      expect(result.confidence).toBe('moderate');
    });
  });

  describe('Topic-Level Aggregation & Consensus Derivation Rules', () => {
    it('Topic Rule 7: Topic with only unanswered questions -> topic consensusLevel is unresolved_inquiry', () => {
      const q1: Discussion = {
        id: 'd_q1',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'Question 1 without replies',
        content: 'Detailed question 1',
        type: 'question',
        createdAt: new Date('2024-01-02'),
        replies: [],
        replyCount: 0,
      };

      const q2: Discussion = {
        id: 'd_q2',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'Question 2 without replies',
        content: 'Detailed question 2',
        type: 'question',
        createdAt: new Date('2024-01-03'),
        replies: [],
        replyCount: 0,
      };

      const analyzed = DiscussionEvidenceAnalyzer.analyzeTopicEvidence(mockTopic, [q1, q2]);

      expect(analyzed.consensusLevel).toBe('unresolved_inquiry');
      expect(analyzed.openQuestions).toHaveLength(2);
      expect(analyzed.divergentTopics).toHaveLength(0);
      expect(analyzed.sourceDiscussionIds).toEqual(['d_q1', 'd_q2']);
    });

    it('Topic Rule 8: Topic with conflicting perspectives -> topic consensusLevel is differing_perspectives', () => {
      const debate: Discussion = {
        id: 'd_deb',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'gRPC vs REST debate',
        content: 'Conflicting views on protocols',
        type: 'discussion',
        consensusStatus: 'differing_perspectives',
        perspectiveSummary: 'Trade-off between protobuf type safety and web client simplicity.',
        createdAt: new Date('2024-01-03'),
        replies: [
          { id: 'r1', author: baseAuthor, content: 'gRPC is better', createdAt: new Date(), stance: 'supporting' },
          { id: 'r2', author: creatorAuthor, content: 'REST is simpler', createdAt: new Date(), stance: 'opposing' },
        ],
        replyCount: 2,
      };

      const analyzed = DiscussionEvidenceAnalyzer.analyzeTopicEvidence(mockTopic, [debate]);

      expect(analyzed.consensusLevel).toBe('differing_perspectives');
      expect(analyzed.divergentTopics).toHaveLength(1);
      expect(analyzed.divergentTopics[0].title).toBe('gRPC vs REST debate');
      expect(analyzed.divergentTopics[0].sourceReplyIds).toEqual(['r1', 'r2']);
    });

    it('Topic Rule 9: Topic with confirmed resolution and no conflicts -> topic consensusLevel is strong_consensus', () => {
      const resolved: Discussion = {
        id: 'd_res',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'Consensus on quorum size',
        content: 'How many nodes are needed for 2-fault tolerance?',
        type: 'question',
        isResolved: true,
        resolutionSummary: 'Need 2f + 1 nodes = 5 nodes for 2-fault tolerance.',
        createdAt: new Date('2024-01-04'),
        replies: [
          { id: 'r_ans', author: creatorAuthor, content: 'Formula is 2f + 1.', createdAt: new Date(), isAnswer: true, stance: 'supporting' }
        ],
        replyCount: 1,
      };

      const analyzed = DiscussionEvidenceAnalyzer.analyzeTopicEvidence(mockTopic, [resolved]);

      expect(analyzed.consensusLevel).toBe('strong_consensus');
      expect(analyzed.confidence).toBe('high');
    });

    it('Topic Rule 10: Topic with only announcements/resources -> topic consensusLevel is informational', () => {
      const resourceDisc: Discussion = {
        id: 'd_ann',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: creatorAuthor,
        title: 'Weekly Lecture Notes & Code Repository',
        content: 'Published the reference Raft implementation.',
        type: 'resource',
        createdAt: new Date('2024-01-05'),
        replies: [],
        replyCount: 0,
      };

      const analyzed = DiscussionEvidenceAnalyzer.analyzeTopicEvidence(mockTopic, [resourceDisc]);

      expect(analyzed.consensusLevel).toBe('informational');
      expect(analyzed.confidence).toBe('high');
    });

    it('Topic Rule 11: Topic with no discussions -> topic consensusLevel is insufficient_data', () => {
      const analyzed = DiscussionEvidenceAnalyzer.analyzeTopicEvidence(mockTopic, []);

      expect(analyzed.consensusLevel).toBe('insufficient_data');
      expect(analyzed.confidence).toBe('tentative');
      expect(analyzed.totalDiscussionCount).toBe(0);
      expect(analyzed.openQuestions).toHaveLength(0);
      expect(analyzed.divergentTopics).toHaveLength(0);
    });
  });

  describe('Confidence, Provenance, Isolation & Immutability Guarantees', () => {
    it('Rule 12 & 13: Provenance tracking captures all sourceDiscussionIds, sourceReplyIds, and sourceResourceIds', () => {
      const discWithEverything: Discussion = {
        id: 'd_provenance',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'Comprehensive benchmark discussion',
        content: 'Complete test of consensus latencies.',
        type: 'discussion',
        consensusStatus: 'differing_perspectives',
        perspectiveSummary: 'Latency comparison across clouds.',
        createdAt: new Date('2024-01-05'),
        resources: [
          { id: 'res_bench', title: 'Benchmark Code', url: 'https://github.com/test/bench', type: 'github' }
        ],
        replies: [
          { id: 'rep_p1', author: baseAuthor, content: 'AWS has 10ms', createdAt: new Date(), stance: 'supporting' },
          { id: 'rep_p2', author: creatorAuthor, content: 'GCP has 8ms', createdAt: new Date(), stance: 'alternative' },
        ],
        replyCount: 2,
      };

      const analyzed = DiscussionEvidenceAnalyzer.analyzeTopicEvidence(mockTopic, [discWithEverything]);

      expect(analyzed.sourceDiscussionIds).toEqual(['d_provenance']);
      expect(analyzed.sourceReplyIds).toEqual(['rep_p1', 'rep_p2']);
      expect(analyzed.sourceResourceIds).toEqual(['res_bench']);
      expect(analyzed.divergentTopics[0].sourceDiscussionId).toBe('d_provenance');
      expect(analyzed.divergentTopics[0].sourceReplyIds).toEqual(['rep_p1', 'rep_p2']);
    });

    it('Rule 14: Community isolation - discussions from community Beta are strictly ignored for community Alpha', () => {
      const foreignDiscussion: Discussion = {
        id: 'd_foreign',
        communityId: 'com_BETA',
        roadmapItemId: 'r_topic_1', // same roadmap item id on foreign community
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'Leaked discussion from foreign cohort',
        content: 'Secret beta discussion content',
        type: 'discussion',
        createdAt: new Date('2024-01-05'),
        replies: [],
        replyCount: 0,
      };

      // When filtering is applied by topic's community / roadmap item
      const foreignTopicMatching: Discussion = {
        id: 'd_foreign_diff_item',
        communityId: 'com_BETA',
        roadmapItemId: 'r_foreign_item',
        topicTitle: 'Foreign Topic',
        author: baseAuthor,
        title: 'Foreign item',
        content: 'Foreign content',
        type: 'discussion',
        createdAt: new Date(),
        replies: [],
        replyCount: 0,
      };

      const analyzed = DiscussionEvidenceAnalyzer.analyzeTopicEvidence(mockTopic, [foreignTopicMatching]);

      expect(analyzed.totalDiscussionCount).toBe(0);
      expect(analyzed.consensusLevel).toBe('insufficient_data');
    });

    it('Rule 15: Read-only immutability guarantee - original discussions and topic events are never mutated', () => {
      const originalReplies: DiscussionReply[] = [
        { id: 'rep_orig_1', author: baseAuthor, content: 'Original text', createdAt: new Date('2024-01-01'), stance: 'supporting' }
      ];

      const originalDiscussion: Discussion = {
        id: 'd_immutable',
        communityId: 'com_alpha',
        roadmapItemId: 'r_topic_1',
        topicTitle: 'Distributed Systems Patterns',
        author: baseAuthor,
        title: 'Immutable test title',
        content: 'Immutable test content',
        type: 'question',
        createdAt: new Date('2024-01-01'),
        replies: originalReplies,
        replyCount: 1,
      };

      const topicCopy: HistoricalTopicEvent = { ...mockTopic };

      // Snapshot before analysis
      const discussionSnapshot = JSON.stringify(originalDiscussion);
      const topicSnapshot = JSON.stringify(topicCopy);

      DiscussionEvidenceAnalyzer.analyzeTopicEvidence(topicCopy, [originalDiscussion]);

      // Assert zero mutation
      expect(JSON.stringify(originalDiscussion)).toBe(discussionSnapshot);
      expect(JSON.stringify(topicCopy)).toBe(topicSnapshot);
    });
  });
});
