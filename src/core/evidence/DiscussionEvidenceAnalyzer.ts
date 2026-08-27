import { Discussion, DiscussionReply, DiscussionResource } from '../domain/discussion';
import { HistoricalTopicEvent } from '../domain/history';
import { ConsensusLevel } from '../readmodels/CatchUpReadModel';

export type DiscussionClassification =
  | 'strong_consensus'
  | 'differing_perspectives'
  | 'resolved_decision'
  | 'unresolved_inquiry'
  | 'informational'
  | 'insufficient_data';

export type EvidenceConfidence = 'high' | 'moderate' | 'tentative';

export interface AnalyzedDiscussion {
  discussionId: string;
  roadmapItemId: string;
  classification: DiscussionClassification;
  confidence: EvidenceConfidence;
  isNoise: boolean;
  hasAnswer: boolean;
  openQuestion?: {
    id: string;
    title: string;
    authorName: string;
    discussionId: string;
  };
  divergentPerspective?: {
    title: string;
    summary: string;
    perspectives: string[];
    sourceDiscussionId: string;
    sourceReplyIds: string[];
  };
  sourceReplyIds: string[];
  resources: DiscussionResource[];
}

export interface AnalyzedTopicEvidence {
  roadmapItemId: string;
  topicTitle: string;
  orderIndex: number;
  completedAt?: Date;
  keyIdea: string;
  summary: string;
  consensusLevel: ConsensusLevel;
  confidence: EvidenceConfidence;
  totalDiscussionCount: number;
  highSignalDiscussionCount: number;
  openQuestions: Array<{
    id: string;
    title: string;
    authorName: string;
    discussionId: string;
  }>;
  divergentTopics: Array<{
    title: string;
    summary: string;
    perspectives: string[];
    sourceDiscussionId: string;
    sourceReplyIds: string[];
  }>;
  topResources: DiscussionResource[];
  sourceDiscussionIds: string[];
  sourceReplyIds: string[];
  sourceResourceIds: string[];
}

/**
 * Pure, deterministic analyzer for individual discussions based on source facts.
 * Adheres strictly to structural evidence (replies, answer markers, stances, resolution summaries)
 * rather than fragile keyword matching or fabricated consensus.
 */
export class DiscussionEvidenceAnalyzer {
  /**
   * Deterministically classifies an individual discussion based on source evidence.
   */
  static analyzeDiscussion(discussion: Discussion): AnalyzedDiscussion {
    const replies = discussion.replies || [];
    const resources = discussion.resources || [];
    const sourceReplyIds = replies.map(r => r.id);

    // Rule 0: Sparse or invalid content
    if (!discussion.title || !discussion.content || (discussion.content.trim().length < 4 && replies.length === 0)) {
      return {
        discussionId: discussion.id,
        roadmapItemId: discussion.roadmapItemId,
        classification: 'insufficient_data',
        confidence: 'tentative',
        isNoise: false,
        hasAnswer: false,
        sourceReplyIds: [],
        resources,
      };
    }

    // Rule 1: Pure social noise / low-signal chatter
    if (
      discussion.type === 'social_chatter' ||
      discussion.type === 'introduction' ||
      discussion.signalQuality === 'low_signal'
    ) {
      return {
        discussionId: discussion.id,
        roadmapItemId: discussion.roadmapItemId,
        classification: 'informational',
        confidence: 'tentative',
        isNoise: true,
        hasAnswer: false,
        sourceReplyIds,
        resources,
      };
    }

    // Rule 2: Question Type
    if (discussion.type === 'question') {
      // 2a. Question with 0 replies
      if (replies.length === 0) {
        if (discussion.isResolved && discussion.resolutionSummary) {
          // Explicit decision / resolution provided directly by author/moderator
          return {
            discussionId: discussion.id,
            roadmapItemId: discussion.roadmapItemId,
            classification: 'resolved_decision',
            confidence: 'moderate',
            isNoise: false,
            hasAnswer: false,
            sourceReplyIds: [],
            resources,
          };
        }

        // Zero replies, not resolved -> Unresolved inquiry
        return {
          discussionId: discussion.id,
          roadmapItemId: discussion.roadmapItemId,
          classification: 'unresolved_inquiry',
          confidence: 'high',
          isNoise: false,
          hasAnswer: false,
          openQuestion: {
            id: discussion.id,
            title: discussion.title,
            authorName: discussion.author?.name || 'Member',
            discussionId: discussion.id,
          },
          sourceReplyIds: [],
          resources,
        };
      }

      // 2b. Question with replies: check for conflicting stances
      const hasConflictingStances = this.hasConflictingPerspectives(discussion, replies);
      if (hasConflictingStances) {
        return {
          discussionId: discussion.id,
          roadmapItemId: discussion.roadmapItemId,
          classification: 'differing_perspectives',
          confidence: replies.length >= 2 ? 'high' : 'moderate',
          isNoise: false,
          hasAnswer: false,
          divergentPerspective: {
            title: discussion.title,
            summary: discussion.perspectiveSummary || discussion.content,
            perspectives: replies.map(r => `${r.author.name}: ${r.content}`),
            sourceDiscussionId: discussion.id,
            sourceReplyIds,
          },
          sourceReplyIds,
          resources,
        };
      }

      // 2c. Question with accepted answer or verified resolution
      const acceptedAnswer = replies.find(r => r.isAnswer);
      if (acceptedAnswer || (discussion.isResolved && discussion.resolutionSummary)) {
        return {
          discussionId: discussion.id,
          roadmapItemId: discussion.roadmapItemId,
          classification: 'strong_consensus',
          confidence: 'high',
          isNoise: false,
          hasAnswer: true,
          sourceReplyIds,
          resources,
        };
      }

      // 2d. Question with replies but unverified/unanswered resolution
      if (discussion.consensusStatus === 'unanswered' || !discussion.isResolved) {
        return {
          discussionId: discussion.id,
          roadmapItemId: discussion.roadmapItemId,
          classification: 'unresolved_inquiry',
          confidence: 'moderate',
          isNoise: false,
          hasAnswer: false,
          openQuestion: {
            id: discussion.id,
            title: discussion.title,
            authorName: discussion.author?.name || 'Member',
            discussionId: discussion.id,
          },
          sourceReplyIds,
          resources,
        };
      }
    }

    // Rule 3: Discussion Type
    if (discussion.type === 'discussion') {
      // Check for divergent perspectives
      const hasConflictingStances = this.hasConflictingPerspectives(discussion, replies);
      if (hasConflictingStances) {
        return {
          discussionId: discussion.id,
          roadmapItemId: discussion.roadmapItemId,
          classification: 'differing_perspectives',
          confidence: replies.length >= 2 ? 'high' : 'moderate',
          isNoise: false,
          hasAnswer: false,
          divergentPerspective: {
            title: discussion.title,
            summary: discussion.perspectiveSummary || discussion.content,
            perspectives: replies.map(r => `${r.author.name}: ${r.content}`),
            sourceDiscussionId: discussion.id,
            sourceReplyIds,
          },
          sourceReplyIds,
          resources,
        };
      }

      // Explicitly resolved discussion with community agreement
      if (discussion.isResolved && discussion.resolutionSummary) {
        return {
          discussionId: discussion.id,
          roadmapItemId: discussion.roadmapItemId,
          classification: 'strong_consensus',
          confidence: replies.length > 0 ? 'high' : 'moderate',
          isNoise: false,
          hasAnswer: false,
          sourceReplyIds,
          resources,
        };
      }

      // Zero replies on open discussion with no explicit resolution -> insufficient data
      if (replies.length === 0) {
        return {
          discussionId: discussion.id,
          roadmapItemId: discussion.roadmapItemId,
          classification: 'insufficient_data',
          confidence: 'tentative',
          isNoise: false,
          hasAnswer: false,
          sourceReplyIds: [],
          resources,
        };
      }

      // General discussion with consensus / alignment
      return {
        discussionId: discussion.id,
        roadmapItemId: discussion.roadmapItemId,
        classification: 'informational',
        confidence: 'moderate',
        isNoise: false,
        hasAnswer: false,
        sourceReplyIds,
        resources,
      };
    }

    // Rule 4: Informational Types (resource, announcement, learning_milestone, project)
    const hasConflictingStances = this.hasConflictingPerspectives(discussion, replies);
    if (hasConflictingStances) {
      return {
        discussionId: discussion.id,
        roadmapItemId: discussion.roadmapItemId,
        classification: 'differing_perspectives',
        confidence: 'moderate',
        isNoise: false,
        hasAnswer: false,
        divergentPerspective: {
          title: discussion.title,
          summary: discussion.perspectiveSummary || discussion.content,
          perspectives: replies.map(r => `${r.author.name}: ${r.content}`),
          sourceDiscussionId: discussion.id,
          sourceReplyIds,
        },
        sourceReplyIds,
        resources,
      };
    }

    return {
      discussionId: discussion.id,
      roadmapItemId: discussion.roadmapItemId,
      classification: 'informational',
      confidence: 'high',
      isNoise: false,
      hasAnswer: false,
      sourceReplyIds,
      resources,
    };
  }

  /**
   * Helper to determine if a discussion contains differing perspectives based on stances,
   * consensus status, or reply metadata.
   */
  private static hasConflictingPerspectives(discussion: Discussion, replies: DiscussionReply[]): boolean {
    if (discussion.consensusStatus === 'differing_perspectives') {
      return true;
    }

    const stances = replies.map(r => r.stance).filter(Boolean);
    const hasOpposing = stances.includes('opposing') || stances.includes('alternative');
    const hasSupporting = stances.includes('supporting');

    if (hasOpposing && (hasSupporting || stances.length >= 2)) {
      return true;
    }

    return false;
  }

  /**
   * Analyzes an entire topic milestone by deterministically aggregating evidence from its discussions.
   */
  static analyzeTopicEvidence(
    topic: HistoricalTopicEvent,
    discussions: Discussion[]
  ): AnalyzedTopicEvidence {
    // Topic & Community isolation: ensure discussions strictly match topic's roadmapItemId
    const matchingDiscussions = discussions.filter(d => d.roadmapItemId === topic.roadmapItemId);

    const analyzedList = matchingDiscussions.map(d => this.analyzeDiscussion(d));
    const highSignalAnalyzed = analyzedList.filter(a => !a.isNoise);

    const openQuestions: Array<{
      id: string;
      title: string;
      authorName: string;
      discussionId: string;
    }> = [];

    const divergentTopics: Array<{
      title: string;
      summary: string;
      perspectives: string[];
      sourceDiscussionId: string;
      sourceReplyIds: string[];
    }> = [];

    const strongConsensusList: AnalyzedDiscussion[] = [];
    const resolvedDecisions: AnalyzedDiscussion[] = [];
    const informationalList: AnalyzedDiscussion[] = [];

    const allReplyIds: string[] = [];
    const allResourceIds: string[] = [];

    for (const item of analyzedList) {
      if (item.openQuestion) {
        openQuestions.push(item.openQuestion);
      }
      if (item.divergentPerspective) {
        divergentTopics.push(item.divergentPerspective);
      }
      if (item.classification === 'strong_consensus') {
        strongConsensusList.push(item);
      }
      if (item.classification === 'resolved_decision') {
        resolvedDecisions.push(item);
      }
      if (item.classification === 'informational') {
        informationalList.push(item);
      }

      allReplyIds.push(...item.sourceReplyIds);
      allResourceIds.push(...item.resources.map(r => r.id));
    }

    // Derive topic-level consensus
    let consensusLevel: ConsensusLevel = 'informational';
    let confidence: EvidenceConfidence = 'moderate';

    if (matchingDiscussions.length === 0 || (highSignalAnalyzed.length === 0 && matchingDiscussions.length > 0 && analyzedList.every(a => a.classification === 'insufficient_data'))) {
      consensusLevel = 'insufficient_data';
      confidence = 'tentative';
    } else if (divergentTopics.length > 0) {
      consensusLevel = 'differing_perspectives';
      confidence = divergentTopics.some(d => d.perspectives.length >= 2) ? 'high' : 'moderate';
    } else if (openQuestions.length > 0 && strongConsensusList.length === 0 && resolvedDecisions.length === 0 && informationalList.length === 0) {
      consensusLevel = 'unresolved_inquiry';
      confidence = 'high';
    } else if (strongConsensusList.length > 0) {
      consensusLevel = 'strong_consensus';
      confidence = 'high';
    } else if (resolvedDecisions.length > 0) {
      // A decision/resolution was made by an author/moderator, classified at topic level as informational/decision
      consensusLevel = 'informational';
      confidence = 'moderate';
    } else if (informationalList.length > 0) {
      consensusLevel = 'informational';
      confidence = highSignalAnalyzed.length > 0 ? 'high' : 'moderate';
    } else {
      consensusLevel = 'insufficient_data';
      confidence = 'tentative';
    }

    // Collect top resources with provenance
    const topResources = matchingDiscussions
      .flatMap(d => d.resources || [])
      .slice(0, 3);

    // Synthesize keyIdea and summary based on derived consensus level
    let keyIdea = topic.keyIdea || `Core principles of ${topic.topicTitle}`;
    let summary = topic.summary || topic.description;

    if (consensusLevel === 'differing_perspectives') {
      keyIdea = `Multiple approaches explored for ${topic.topicTitle} with active trade-off debate.`;
      summary = `The community explored contrasting implementations. Rather than a single consensus, members documented key trade-offs between differing approaches.`;
    } else if (consensusLevel === 'unresolved_inquiry') {
      keyIdea = `Open questions raised regarding ${topic.topicTitle}; active inquiry remains ongoing.`;
      summary = `Members posed key architectural questions during this milestone that remained open for ongoing cohort exploration.`;
    } else if (consensusLevel === 'insufficient_data') {
      keyIdea = `Milestone recorded with limited historical discussion logs.`;
      summary = topic.description || `Milestone completed without detailed discussion archives.`;
    }

    return {
      roadmapItemId: topic.roadmapItemId,
      topicTitle: topic.topicTitle,
      orderIndex: topic.orderIndex,
      completedAt: topic.completedAt,
      keyIdea,
      summary,
      consensusLevel,
      confidence,
      totalDiscussionCount: matchingDiscussions.length,
      highSignalDiscussionCount: highSignalAnalyzed.length,
      openQuestions,
      divergentTopics,
      topResources,
      sourceDiscussionIds: matchingDiscussions.map(d => d.id),
      sourceReplyIds: Array.from(new Set(allReplyIds)),
      sourceResourceIds: Array.from(new Set(allResourceIds)),
    };
  }
}
