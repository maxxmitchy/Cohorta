import { ICommunityHistoryRepository } from '../../../core/repositories/ICommunityHistoryRepository';
import {
  CommunityHistoryReadModel,
  HistoricalTimelineTopic,
  CommunityPulse,
} from '../../../core/readmodels/CommunityHistoryReadModel';
import { Discussion } from '../../../core/domain/discussion';
import { HistoricalTopicEvent } from '../../../core/domain/history';
import { mockCommunities, mockCategories, mockMetrics } from './mockData';
import { mockHistoricalTopics, mockDiscussions } from './mockHistoryData';

export class MockCommunityHistoryRepository implements ICommunityHistoryRepository {
  private discussions: Map<string, Discussion> = new Map();
  private topics: Map<string, HistoricalTopicEvent> = new Map();

  constructor(seedWithMockData = true) {
    if (seedWithMockData) {
      for (const topic of mockHistoricalTopics) {
        this.topics.set(topic.id, { ...topic });
      }
      for (const disc of mockDiscussions) {
        this.discussions.set(disc.id, { ...disc, replies: [...disc.replies] });
      }
    }
  }

  async findDiscussionByProvenance(
    provider: string,
    externalCommunityId: string,
    externalMessageId: string
  ): Promise<Discussion | null> {
    for (const disc of this.discussions.values()) {
      if (
        disc.sourceProvenance &&
        disc.sourceProvenance.provider === provider &&
        disc.sourceProvenance.externalCommunityId === externalCommunityId &&
        disc.sourceProvenance.externalMessageId === externalMessageId
      ) {
        return this.cloneDiscussion(disc);
      }
    }
    return null;
  }

  async saveDiscussion(discussion: Discussion): Promise<void> {
    this.discussions.set(discussion.id, this.cloneDiscussion(discussion));
  }

  async saveDiscussions(discussions: Discussion[]): Promise<void> {
    for (const disc of discussions) {
      this.discussions.set(disc.id, this.cloneDiscussion(disc));
    }
  }

  async getAllDiscussions(communityId: string): Promise<Discussion[]> {
    return Array.from(this.discussions.values())
      .filter((d) => d.communityId === communityId)
      .map((d) => this.cloneDiscussion(d));
  }

  async saveHistoricalTopic(topic: HistoricalTopicEvent): Promise<void> {
    this.topics.set(topic.id, { ...topic });
  }

  async saveHistoricalTopics(topics: HistoricalTopicEvent[]): Promise<void> {
    for (const t of topics) {
      this.topics.set(t.id, { ...t });
    }
  }

  async deleteDiscussion(communityId: string, discussionId: string): Promise<void> {
    const disc = this.discussions.get(discussionId);
    if (disc && disc.communityId === communityId) {
      this.discussions.delete(discussionId);
    }
  }

  // --- ICommunityHistoryQueryRepository Implementation ---

  async getCommunityHistory(communityId: string): Promise<CommunityHistoryReadModel | null> {
    const community = mockCommunities.find((c) => c.id === communityId);
    const category = community ? mockCategories.find((cat) => cat.id === community.categoryId) : undefined;
    const metrics = mockMetrics[communityId];
    const categoryName = category ? category.name : 'General';
    const communityName = community ? community.name : `Community ${communityId}`;

    const communityTopics = Array.from(this.topics.values())
      .filter((t) => t.communityId === communityId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const communityDiscussions = Array.from(this.discussions.values())
      .filter((d) => d.communityId === communityId);

    const timeline: HistoricalTimelineTopic[] = communityTopics.map((topic) => {
      const topicDiscussions = communityDiscussions.filter((d) => d.roadmapItemId === topic.roadmapItemId);
      const keyResources = topicDiscussions.flatMap((d) => d.resources || []);

      return {
        roadmapItemId: topic.roadmapItemId,
        orderIndex: topic.orderIndex,
        title: topic.topicTitle,
        description: topic.description,
        status: topic.status,
        startedAt: topic.startedAt,
        completedAt: topic.completedAt,
        keyIdea: topic.keyIdea,
        summary: topic.summary,
        discussionCount: topicDiscussions.length,
        discussions: topicDiscussions.map((d) => this.cloneDiscussion(d)),
        keyResources,
      };
    });

    const activeTopic = communityTopics.find((t) => t.status === 'current');
    const completedTopics = communityTopics.filter((t) => t.status === 'completed');
    const latestCompleted = completedTopics[completedTopics.length - 1];

    const allResources = communityDiscussions.flatMap((d) => d.resources || []);
    const latestResource = allResources.length > 0 ? allResources[allResources.length - 1] : undefined;
    const featuredDiscussion =
      communityDiscussions.find((d) => d.type === 'discussion' || d.type === 'learning_milestone') ||
      communityDiscussions[0];

    const pulse: CommunityPulse = {
      currentTopic: community?.currentTopic || activeTopic?.topicTitle || 'Active Cohort',
      activeToday: metrics ? metrics.activeToday : 15,
      activeDiscussionsCount: communityDiscussions.length,
      latestMilestone: latestCompleted
        ? `Wrapped "${latestCompleted.topicTitle}" with community consensus`
        : 'Cohort kicked off',
      latestResource,
      featuredDiscussion: featuredDiscussion ? this.cloneDiscussion(featuredDiscussion) : undefined,
    };

    return {
      communityId,
      communityName,
      categoryName,
      currentTopic: pulse.currentTopic,
      timeline,
      pulse,
      totalDiscussions: communityDiscussions.length,
      totalResources: allResources.length,
    };
  }

  async getDiscussionsForTopic(communityId: string, roadmapItemId: string): Promise<Discussion[]> {
    return Array.from(this.discussions.values())
      .filter((d) => d.communityId === communityId && d.roadmapItemId === roadmapItemId)
      .map((d) => this.cloneDiscussion(d));
  }

  async getDiscussionById(communityId: string, discussionId: string): Promise<Discussion | null> {
    const disc = this.discussions.get(discussionId);
    if (disc && disc.communityId === communityId) {
      return this.cloneDiscussion(disc);
    }
    return null;
  }

  async getHistoricalTopics(communityId: string): Promise<HistoricalTopicEvent[]> {
    return Array.from(this.topics.values())
      .filter((t) => t.communityId === communityId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((t) => ({ ...t }));
  }

  async clear(): Promise<void> {
    this.discussions.clear();
    this.topics.clear();
  }

  private cloneDiscussion(disc: Discussion): Discussion {
    return {
      ...disc,
      author: { ...disc.author },
      sourceProvenance: disc.sourceProvenance
        ? {
            ...disc.sourceProvenance,
            rawEventIds: disc.sourceProvenance.rawEventIds ? [...disc.sourceProvenance.rawEventIds] : undefined,
          }
        : undefined,
      resources: disc.resources ? disc.resources.map((r) => ({ ...r })) : [],
      replies: disc.replies
        ? disc.replies.map((rep) => ({
            ...rep,
            author: { ...rep.author },
            sourceProvenance: rep.sourceProvenance
              ? {
                  ...rep.sourceProvenance,
                  rawEventIds: rep.sourceProvenance.rawEventIds ? [...rep.sourceProvenance.rawEventIds] : undefined,
                }
              : undefined,
          }))
        : [],
    };
  }
}
