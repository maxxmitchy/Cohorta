import { Discussion } from '../domain/discussion';
import { HistoricalTopicEvent } from '../domain/history';

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
  topicInsights: Array<{
    roadmapItemId: string;
    keyIdea: string;
    summary: string;
  }>;
  recommendedStartingPoint: {
    roadmapItemId: string;
    title: string;
    reason: string;
  };
  currentFocusContext: {
    title: string;
    description: string;
    whyItMattersNow: string;
  };
}

export interface ICatchUpGenerator {
  /**
   * Synthesizes community history into a contextual Catch Up briefing for a member.
   * Deterministic mock implementations serve as the clean boundary for future LLM integration.
   */
  generateCatchUp(input: CatchUpGenerationInput): Promise<CatchUpGenerationOutput>;
}
