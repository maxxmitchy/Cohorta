import { Discussion } from '../domain/discussion';
import { HistoricalTopicEvent } from '../domain/history';
import { ConsensusLevel, EvidenceStatus } from '../readmodels/CatchUpReadModel';

export interface CatchUpGenerationInput {
  memberJoinedAt: Date;
  communityName: string;
  categoryName: string;
  currentTopic: string;
  allTopics: HistoricalTopicEvent[];
  missedTopics: HistoricalTopicEvent[];
  discussions: Discussion[];
}

export interface CatchUpGenerationOutput {
  summaryHeadline: string;
  summaryNarrative: string;
  evidenceStatus: EvidenceStatus;
  topicInsights: Array<{
    roadmapItemId: string;
    keyIdea: string;
    summary: string;
    consensusLevel: ConsensusLevel;
    openQuestions: Array<{
      id: string;
      title: string;
      authorName: string;
    }>;
    divergentTopics: Array<{
      title: string;
      summary: string;
      perspectives: string[];
    }>;
  }>;
  recommendedStartingPoint: {
    roadmapItemId: string;
    title: string;
    reason: string;
    confidence: 'high' | 'moderate' | 'tentative';
  };
  currentFocusContext: {
    title: string;
    description: string;
    whyItMattersNow: string;
    hasActiveDiscussions: boolean;
  };
}

export interface ICatchUpGenerator {
  /**
   * Synthesizes community history into a contextual Catch Up briefing for a member.
   * Deterministic mock implementations serve as the clean boundary for future LLM integration.
   */
  generateCatchUp(input: CatchUpGenerationInput): Promise<CatchUpGenerationOutput>;
}
