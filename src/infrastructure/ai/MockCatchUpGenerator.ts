import { ICatchUpGenerator, CatchUpGenerationInput, CatchUpGenerationOutput } from '../../core/services/ICatchUpGenerator';
import { EvidenceStatus } from '../../core/readmodels/CatchUpReadModel';
import { DiscussionEvidenceAnalyzer } from '../../core/evidence/DiscussionEvidenceAnalyzer';

export class MockCatchUpGenerator implements ICatchUpGenerator {
  async generateCatchUp(input: CatchUpGenerationInput): Promise<CatchUpGenerationOutput> {
    const { communityName, missedTopics, currentTopic, memberJoinedAt, allTopics, discussions } = input;

    // Boundary 1: Empty history
    if (allTopics.length === 0) {
      return {
        summaryHeadline: `No history available for ${communityName}`,
        summaryNarrative: `This community is newly created and has not recorded previous milestone history yet.`,
        evidenceStatus: 'empty_history' as EvidenceStatus,
        topicInsights: [],
        recommendedStartingPoint: {
          roadmapItemId: 'current',
          title: currentTopic || 'Getting Started',
          reason: 'Jump straight into the active discussions as the community launches.',
          confidence: 'tentative',
        },
        currentFocusContext: {
          title: currentTopic || 'Getting Started',
          description: 'The community is in its foundational phase.',
          whyItMattersNow: 'Early members shape the initial discussions and directions.',
          hasActiveDiscussions: discussions.length > 0,
        },
      };
    }

    const hasMissed = missedTopics.length > 0;
    const evidenceStatus: EvidenceStatus = hasMissed ? 'grounded' : 'no_history_needed';

    let summaryHeadline = '';
    let summaryNarrative = '';

    if (!hasMissed) {
      summaryHeadline = `You're all caught up with ${communityName}!`;
      summaryNarrative = `You joined early in the community's learning journey. You're fully in sync with our current milestone: "${currentTopic}".`;
    } else if (missedTopics.length === 1) {
      summaryHeadline = `You joined just after ${missedTopics[0].topicTitle}`;
      summaryNarrative = `The community recently wrapped up "${missedTopics[0].topicTitle}" and moved directly into "${currentTopic}". Here is the verified context and evidence you need to jump in.`;
    } else {
      summaryHeadline = `You joined during "${currentTopic}"`;
      summaryNarrative = `Before you joined on ${memberJoinedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, the community covered ${missedTopics.length} foundational milestones. Here is the verified summary of evidence, open inquiries, and key resources.`;
    }

    // Process each missed topic using the deterministic DiscussionEvidenceAnalyzer
    const topicInsights = missedTopics.map(topic => {
      const analyzed = DiscussionEvidenceAnalyzer.analyzeTopicEvidence(topic, discussions);

      return {
        roadmapItemId: analyzed.roadmapItemId,
        keyIdea: analyzed.keyIdea,
        summary: analyzed.summary,
        consensusLevel: analyzed.consensusLevel,
        openQuestions: analyzed.openQuestions.map(q => ({
          id: q.id,
          title: q.title,
          authorName: q.authorName,
          discussionId: q.discussionId,
        })),
        divergentTopics: analyzed.divergentTopics.map(d => ({
          title: d.title,
          summary: d.summary,
          perspectives: d.perspectives,
          sourceDiscussionId: d.sourceDiscussionId,
          sourceReplyIds: d.sourceReplyIds,
        })),
      };
    });

    // Find current topic object from allTopics
    const currentTopicObj = allTopics.find(t => t.status === 'current' || t.topicTitle === currentTopic);
    const activeDiscussions = discussions.filter(d => currentTopicObj && d.roadmapItemId === currentTopicObj.roadmapItemId);

    const firstMissed = missedTopics[0];
    const lastMissed = missedTopics[missedTopics.length - 1];
    const lastMissedAnalyzed = lastMissed ? DiscussionEvidenceAnalyzer.analyzeTopicEvidence(lastMissed, discussions) : null;

    let startingConfidence: 'high' | 'moderate' | 'tentative' = 'high';
    if (hasMissed && lastMissedAnalyzed) {
      startingConfidence = lastMissedAnalyzed.confidence;
    }

    const recommendedStartingPoint = hasMissed
      ? {
          roadmapItemId: firstMissed.roadmapItemId,
          title: firstMissed.topicTitle,
          reason: missedTopics.length > 1
            ? `Start from the earliest missed milestone "${firstMissed.topicTitle}" to build foundational continuity before moving to "${currentTopic}".`
            : `Review the verified takeaways and open inquiries from "${lastMissed.topicTitle}" before diving into "${currentTopic}".`,
          confidence: startingConfidence,
        }
      : {
          roadmapItemId: currentTopicObj?.roadmapItemId || 'current',
          title: currentTopic,
          reason: `You're in sync with the cohort. Jump straight into the active milestone "${currentTopic}".`,
          confidence: 'high' as const,
        };

    const currentFocusContext = {
      title: currentTopic,
      description: currentTopicObj?.description || `The active focal topic the community is exploring this week.`,
      whyItMattersNow: `Active members are discussing patterns and real-world implementations for ${currentTopic} right now.`,
      hasActiveDiscussions: activeDiscussions.length > 0,
    };

    return {
      summaryHeadline,
      summaryNarrative,
      evidenceStatus,
      topicInsights,
      recommendedStartingPoint,
      currentFocusContext,
    };
  }
}
