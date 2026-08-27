import { ICatchUpGenerator, CatchUpGenerationInput, CatchUpGenerationOutput } from '../../core/services/ICatchUpGenerator';
import { ConsensusLevel, EvidenceStatus } from '../../core/readmodels/CatchUpReadModel';

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
    let evidenceStatus: EvidenceStatus = hasMissed ? 'grounded' : 'no_history_needed';

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

    // Process each missed topic into evidence-grounded insights
    const topicInsights = missedTopics.map(topic => {
      const topicDiscussions = discussions.filter(d => d.roadmapItemId === topic.roadmapItemId);
      // Filter out pure chatter/noise from driving the synthesis
      const highSignalDiscussions = topicDiscussions.filter(d => d.signalQuality !== 'low_signal');

      // 1. Detect open / unanswered questions without fabricating resolutions
      const openQuestionsList = topicDiscussions
        .filter(d => {
          if (d.type === 'question') {
            return d.consensusStatus === 'unanswered' || (!d.isResolved && d.replies.length === 0);
          }
          return false;
        })
        .map(q => ({
          id: q.id,
          title: q.title,
          authorName: q.author.name,
        }));

      // 2. Detect divergent views / conflicting perspectives without fabricating consensus
      const divergentDiscussions = topicDiscussions.filter(d => d.consensusStatus === 'differing_perspectives');
      const divergentTopics = divergentDiscussions.map(d => ({
        title: d.title,
        summary: d.perspectiveSummary || d.content,
        perspectives: d.replies.map(r => `${r.author.name}: ${r.content}`),
      }));

      // 3. Evaluate consensus level
      let consensusLevel: ConsensusLevel = 'informational';
      if (divergentTopics.length > 0) {
        consensusLevel = 'differing_perspectives';
      } else if (openQuestionsList.length > 0 && highSignalDiscussions.length === openQuestionsList.length) {
        consensusLevel = 'unresolved_inquiry';
      } else if (topicDiscussions.some(d => d.isResolved || d.consensusStatus === 'resolved')) {
        consensusLevel = 'strong_consensus';
      } else if (topicDiscussions.length === 0) {
        consensusLevel = 'insufficient_data';
      }

      // 4. Synthesize key idea & summary strictly reflecting reality (no hallucination)
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
        keyIdea,
        summary,
        consensusLevel,
        openQuestions: openQuestionsList,
        divergentTopics,
      };
    });

    // Find current topic object from allTopics
    const currentTopicObj = allTopics.find(t => t.status === 'current' || t.topicTitle === currentTopic);
    const activeDiscussions = discussions.filter(d => currentTopicObj && d.roadmapItemId === currentTopicObj.roadmapItemId);

    const lastMissed = missedTopics[missedTopics.length - 1];
    const lastMissedInsight = topicInsights[topicInsights.length - 1];

    let confidence: 'high' | 'moderate' | 'tentative' = 'high';
    if (hasMissed && lastMissedInsight?.consensusLevel === 'differing_perspectives') {
      confidence = 'moderate';
    } else if (hasMissed && lastMissedInsight?.consensusLevel === 'unresolved_inquiry') {
      confidence = 'tentative';
    }

    const recommendedStartingPoint = hasMissed
      ? {
          roadmapItemId: lastMissed.roadmapItemId,
          title: lastMissed.topicTitle,
          reason: `Review the verified takeaways and open inquiries from "${lastMissed.topicTitle}" before diving into "${currentTopic}".`,
          confidence,
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
