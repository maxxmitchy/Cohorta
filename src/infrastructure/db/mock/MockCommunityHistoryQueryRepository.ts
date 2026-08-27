import { ICommunityHistoryQueryRepository } from '../../../core/repositories/ICommunityHistoryQueryRepository';
import { CommunityHistoryReadModel, HistoricalTimelineTopic, CommunityPulse } from '../../../core/readmodels/CommunityHistoryReadModel';
import { Discussion } from '../../../core/domain/discussion';
import { HistoricalTopicEvent } from '../../../core/domain/history';
import { mockCommunities, mockCategories, mockMetrics } from './mockData';
import { mockHistoricalTopics, mockDiscussions } from './mockHistoryData';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class MockCommunityHistoryQueryRepository implements ICommunityHistoryQueryRepository {
  async getCommunityHistory(communityId: string): Promise<CommunityHistoryReadModel | null> {
    await delay(60);

    const community = mockCommunities.find(c => c.id === communityId);
    if (!community) {
      return null;
    }

    const category = mockCategories.find(cat => cat.id === community.categoryId);
    const metrics = mockMetrics[communityId];
    const categoryName = category ? category.name : 'General';

    const communityTopics = mockHistoricalTopics
      .filter(t => t.communityId === communityId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const communityDiscussions = mockDiscussions.filter(d => d.communityId === communityId);

    const timeline: HistoricalTimelineTopic[] = communityTopics.map(topic => {
      const topicDiscussions = communityDiscussions.filter(d => d.roadmapItemId === topic.roadmapItemId);
      const keyResources = topicDiscussions.flatMap(d => d.resources || []);

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
        discussions: topicDiscussions,
        keyResources,
      };
    });

    const activeTopic = communityTopics.find(t => t.status === 'current');
    const completedTopics = communityTopics.filter(t => t.status === 'completed');
    const latestCompleted = completedTopics[completedTopics.length - 1];

    const allResources = communityDiscussions.flatMap(d => d.resources || []);
    const latestResource = allResources.length > 0 ? allResources[allResources.length - 1] : undefined;
    const featuredDiscussion = communityDiscussions.find(d => d.type === 'discussion' || d.type === 'learning_milestone') || communityDiscussions[0];

    const pulse: CommunityPulse = {
      currentTopic: community.currentTopic || activeTopic?.topicTitle || 'Active Cohort',
      activeToday: metrics ? metrics.activeToday : 15,
      activeDiscussionsCount: communityDiscussions.length,
      latestMilestone: latestCompleted ? `Wrapped "${latestCompleted.topicTitle}" with community consensus` : 'Cohort kicked off',
      latestResource,
      featuredDiscussion,
    };

    return {
      communityId: community.id,
      communityName: community.name,
      categoryName,
      currentTopic: pulse.currentTopic,
      timeline,
      pulse,
      totalDiscussions: communityDiscussions.length,
      totalResources: allResources.length,
    };
  }

  async getDiscussionsForTopic(communityId: string, roadmapItemId: string): Promise<Discussion[]> {
    await delay(30);
    return mockDiscussions.filter(d => d.communityId === communityId && d.roadmapItemId === roadmapItemId);
  }

  async getDiscussionById(communityId: string, discussionId: string): Promise<Discussion | null> {
    await delay(30);
    const discussion = mockDiscussions.find(d => d.communityId === communityId && d.id === discussionId);
    return discussion || null;
  }

  async getHistoricalTopics(communityId: string): Promise<HistoricalTopicEvent[]> {
    await delay(30);
    return mockHistoricalTopics.filter(t => t.communityId === communityId);
  }
}
