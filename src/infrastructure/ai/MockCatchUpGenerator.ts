import { ICatchUpGenerator, CatchUpGenerationInput, CatchUpGenerationOutput } from '../../core/services/ICatchUpGenerator';

export class MockCatchUpGenerator implements ICatchUpGenerator {
  async generateCatchUp(input: CatchUpGenerationInput): Promise<CatchUpGenerationOutput> {
    const { communityName, missedTopics, currentTopic, memberJoinedAt, allTopics } = input;

    // Deterministic generation
    const hasMissed = missedTopics.length > 0;

    let summaryHeadline = '';
    let summaryNarrative = '';

    if (!hasMissed) {
      summaryHeadline = `You're all caught up with ${communityName}!`;
      summaryNarrative = `You joined early in the community's learning journey. You're fully in sync with our current milestone: "${currentTopic}".`;
    } else if (missedTopics.length === 1) {
      summaryHeadline = `You joined just after ${missedTopics[0].topicTitle}`;
      summaryNarrative = `The community recently wrapped up "${missedTopics[0].topicTitle}" and moved directly into "${currentTopic}". Here is the essential context you need to jump in.`;
    } else {
      summaryHeadline = `You joined during "${currentTopic}"`;
      summaryNarrative = `Before you joined on ${memberJoinedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, the community covered ${missedTopics.length} foundational milestones. Here is the curated summary of key discussions, decisions, and resources.`;
    }

    const topicInsights = missedTopics.map(topic => ({
      roadmapItemId: topic.roadmapItemId,
      keyIdea: topic.keyIdea || `Core principles of ${topic.topicTitle}`,
      summary: topic.summary || topic.description,
    }));

    // Find current topic object from allTopics
    const currentTopicObj = allTopics.find(t => t.status === 'current' || t.topicTitle === currentTopic);

    const recommendedStartingPoint = hasMissed
      ? {
          roadmapItemId: missedTopics[missedTopics.length - 1].roadmapItemId,
          title: missedTopics[missedTopics.length - 1].topicTitle,
          reason: `Review the key takeaways from "${missedTopics[missedTopics.length - 1].topicTitle}" before diving into "${currentTopic}".`,
        }
      : {
          roadmapItemId: currentTopicObj?.roadmapItemId || 'current',
          title: currentTopic,
          reason: `You're in sync with the group. Jump straight into the active milestone "${currentTopic}".`,
        };

    const currentFocusContext = {
      title: currentTopic,
      description: currentTopicObj?.description || `The active focal topic the community is exploring this week.`,
      whyItMattersNow: `Active members are discussing patterns and real-world implementations for ${currentTopic} right now in the discussion channels.`,
    };

    return {
      summaryHeadline,
      summaryNarrative,
      topicInsights,
      recommendedStartingPoint,
      currentFocusContext,
    };
  }
}
