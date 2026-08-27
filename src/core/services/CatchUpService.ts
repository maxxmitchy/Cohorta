import { ICatchUpService } from './ICatchUpService';
import { ICommunityHistoryQueryRepository } from '../repositories/ICommunityHistoryQueryRepository';
import { IMembershipRepository } from '../repositories/IMembershipRepository';
import { ICatchUpGenerator } from './ICatchUpGenerator';
import { CatchUpReadModel, MissedTopicInsight } from '../readmodels/CatchUpReadModel';

export class CatchUpService implements ICatchUpService {
  constructor(
    private readonly historyQueryRepo: ICommunityHistoryQueryRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly catchUpGenerator: ICatchUpGenerator
  ) {}

  async getCatchUp(userId: string, communityId: string): Promise<CatchUpReadModel> {
    if (!userId || userId.trim() === '') {
      throw new Error('Authentication required to access Catch Up briefing.');
    }

    const community = await this.membershipRepo.getCommunity(communityId);
    if (!community) {
      throw new Error(`Community with ID "${communityId}" does not exist.`);
    }

    let joinedAt = new Date();
    const isCreator = community.creatorId === userId;

    if (!isCreator) {
      const membership = await this.membershipRepo.getMembership(userId, communityId);
      if (!membership || membership.status !== 'active') {
        throw new Error('Access denied: You must be an active member of this community to access Catch Up.');
      }
      joinedAt = membership.joinedAt;
    } else {
      joinedAt = community.createdAt;
    }

    // Retrieve historical topics for the community
    const allTopics = await this.historyQueryRepo.getHistoricalTopics(communityId);

    // Calculate missed topics: completed topics that were concluded before the member joined.
    // Ensure current or upcoming topics are never counted as missed.
    const missedTopicsEvents = allTopics.filter(t => {
      if (t.status !== 'completed' || !t.completedAt) {
        return false;
      }
      return t.completedAt.getTime() < joinedAt.getTime();
    });

    // Sort by orderIndex
    missedTopicsEvents.sort((a, b) => a.orderIndex - b.orderIndex);

    // Fetch all discussions across missed topics
    const allDiscussions = await Promise.all(
      missedTopicsEvents.map(t => this.historyQueryRepo.getDiscussionsForTopic(communityId, t.roadmapItemId))
    );
    const flattenedDiscussions = allDiscussions.flat();

    // Call intelligence abstraction
    const currentTopicTitle = community.currentTopic || 'Active Community Focus';
    const intelligenceResult = await this.catchUpGenerator.generateCatchUp({
      memberJoinedAt: joinedAt,
      communityName: community.name,
      categoryName: 'Tech',
      currentTopic: currentTopicTitle,
      allTopics,
      missedTopics: missedTopicsEvents,
      discussions: flattenedDiscussions,
    });

    // Assemble MissedTopicInsights
    const missedTopics: MissedTopicInsight[] = await Promise.all(
      missedTopicsEvents.map(async (topicEvent) => {
        const topicDiscussions = await this.historyQueryRepo.getDiscussionsForTopic(communityId, topicEvent.roadmapItemId);
        const insight = intelligenceResult.topicInsights.find(i => i.roadmapItemId === topicEvent.roadmapItemId);

        // Extract key resources from discussions
        const topResources = topicDiscussions
          .flatMap(d => d.resources || [])
          .slice(0, 3);

        return {
          roadmapItemId: topicEvent.roadmapItemId,
          orderIndex: topicEvent.orderIndex,
          title: topicEvent.topicTitle,
          completedAt: topicEvent.completedAt,
          keyIdea: insight?.keyIdea || topicEvent.keyIdea,
          summary: insight?.summary || topicEvent.summary,
          discussionCount: topicDiscussions.length,
          notableDiscussions: topicDiscussions.slice(0, 3),
          topResources,
        };
      })
    );

    const hasMissedContent = missedTopics.length > 0;

    return {
      memberId: userId,
      communityId,
      communityName: community.name,
      categoryName: 'Tech',
      joinedAt,
      currentTopic: currentTopicTitle,
      hasMissedContent,
      missedTopicsCount: missedTopics.length,
      missedTopics,
      summaryHeadline: intelligenceResult.summaryHeadline,
      summaryNarrative: intelligenceResult.summaryNarrative,
      recommendedStartingPoint: intelligenceResult.recommendedStartingPoint,
      currentFocusContext: intelligenceResult.currentFocusContext,
    };
  }
}
