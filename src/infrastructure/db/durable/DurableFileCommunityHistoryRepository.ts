import * as path from 'path';
import { ICommunityHistoryRepository } from '../../../core/repositories/ICommunityHistoryRepository';
import {
  CommunityHistoryReadModel,
  HistoricalTimelineTopic,
  CommunityPulse,
} from '../../../core/readmodels/CommunityHistoryReadModel';
import { Discussion } from '../../../core/domain/discussion';
import { HistoricalTopicEvent } from '../../../core/domain/history';
import { DurableFileStorage } from './DurableFileStorage';
import { mockHistoricalTopics, mockDiscussions } from '../mock/mockHistoryData';
import { mockCommunities, mockCategories, mockMetrics } from '../mock/mockData';

export interface CommunityHistoryStorageModel {
  discussions: Record<string, Discussion>; // key: discussion.id
  topics: Record<string, HistoricalTopicEvent>; // key: topic.id
}

export class DurableFileCommunityHistoryRepository implements ICommunityHistoryRepository {
  private readonly storage: DurableFileStorage<CommunityHistoryStorageModel>;

  constructor(filePath?: string, seedWithMockData = true) {
    const targetPath = filePath || path.join(process.cwd(), '.data', 'community_history.json');
    this.storage = new DurableFileStorage<CommunityHistoryStorageModel>(
      targetPath,
      () => {
        const discMap: Record<string, Discussion> = {};
        const topicMap: Record<string, HistoricalTopicEvent> = {};

        if (seedWithMockData) {
          for (const topic of mockHistoricalTopics) {
            topicMap[topic.id] = { ...topic };
          }
          for (const disc of mockDiscussions) {
            discMap[disc.id] = { ...disc, replies: [...disc.replies] };
          }
        }

        return { discussions: discMap, topics: topicMap };
      }
    );
  }

  async findDiscussionByProvenance(
    provider: string,
    externalCommunityId: string,
    externalMessageId: string
  ): Promise<Discussion | null> {
    const data = await this.storage.read();
    for (const disc of Object.values(data.discussions)) {
      if (
        disc.sourceProvenance &&
        disc.sourceProvenance.provider === provider &&
        disc.sourceProvenance.externalCommunityId === externalCommunityId &&
        (disc.sourceProvenance.externalMessageId === externalMessageId ||
          disc.sourceProvenance.mergedExternalMessageIds?.includes(externalMessageId))
      ) {
        return this.cloneDiscussion(disc);
      }
    }
    return null;
  }

  async saveDiscussion(discussion: Discussion): Promise<void> {
    await this.storage.mutate((data) => {
      data.discussions[discussion.id] = this.cloneDiscussion(discussion);
    });
  }

  async saveDiscussions(discussions: Discussion[]): Promise<void> {
    await this.storage.mutate((data) => {
      for (const disc of discussions) {
        data.discussions[disc.id] = this.cloneDiscussion(disc);
      }
    });
  }

  async getAllDiscussions(communityId: string): Promise<Discussion[]> {
    const data = await this.storage.read();
    return Object.values(data.discussions)
      .filter((d) => d.communityId === communityId)
      .map((d) => this.cloneDiscussion(d));
  }

  async saveHistoricalTopic(topic: HistoricalTopicEvent): Promise<void> {
    await this.storage.mutate((data) => {
      data.topics[topic.id] = { ...topic };
    });
  }

  async saveHistoricalTopics(topics: HistoricalTopicEvent[]): Promise<void> {
    await this.storage.mutate((data) => {
      for (const t of topics) {
        data.topics[t.id] = { ...t };
      }
    });
  }

  async deleteDiscussion(communityId: string, discussionId: string): Promise<void> {
    await this.storage.mutate((data) => {
      const disc = data.discussions[discussionId];
      if (disc && disc.communityId === communityId) {
        delete data.discussions[discussionId];
      }
    });
  }

  // --- ICommunityHistoryQueryRepository Implementation ---

  async getCommunityHistory(communityId: string): Promise<CommunityHistoryReadModel | null> {
    const data = await this.storage.read();
    const community = mockCommunities.find((c) => c.id === communityId);
    const category = community ? mockCategories.find((cat) => cat.id === community.categoryId) : undefined;
    const metrics = mockMetrics[communityId];
    const categoryName = category ? category.name : 'General';
    const communityName = community ? community.name : `Community ${communityId}`;

    const communityTopics = Object.values(data.topics)
      .filter((t) => t.communityId === communityId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const communityDiscussions = Object.values(data.discussions)
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
    const data = await this.storage.read();
    return Object.values(data.discussions)
      .filter((d) => d.communityId === communityId && d.roadmapItemId === roadmapItemId)
      .map((d) => this.cloneDiscussion(d));
  }

  async getDiscussionById(communityId: string, discussionId: string): Promise<Discussion | null> {
    const data = await this.storage.read();
    const disc = data.discussions[discussionId];
    if (disc && disc.communityId === communityId) {
      return this.cloneDiscussion(disc);
    }
    return null;
  }

  async getHistoricalTopics(communityId: string): Promise<HistoricalTopicEvent[]> {
    const data = await this.storage.read();
    return Object.values(data.topics)
      .filter((t) => t.communityId === communityId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((t) => ({ ...t }));
  }

  async clear(): Promise<void> {
    await this.storage.mutate((data) => {
      data.discussions = {};
      data.topics = {};
    });
  }

  private cloneDiscussion(disc: Discussion): Discussion {
    return {
      ...disc,
      author: { ...disc.author },
      sourceProvenance: disc.sourceProvenance
        ? {
            ...disc.sourceProvenance,
            rawEventIds: disc.sourceProvenance.rawEventIds ? [...disc.sourceProvenance.rawEventIds] : undefined,
            mergedExternalMessageIds: disc.sourceProvenance.mergedExternalMessageIds
              ? [...disc.sourceProvenance.mergedExternalMessageIds]
              : undefined,
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
