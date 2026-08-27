import { TelegramSourceAdapter } from './TelegramSourceAdapter';
import { validateTelegramConfig } from './TelegramConfig';
import { CommunityHistoryNormalizer } from '../../../core/source/CommunityHistoryNormalizer';
import { DiscussionEvidenceAnalyzer } from '../../../core/evidence/DiscussionEvidenceAnalyzer';
import {
  FIXTURE_TELEGRAM_UPDATE_001,
  FIXTURE_TELEGRAM_UPDATE_002_QUESTION,
  FIXTURE_TELEGRAM_UPDATE_003_REPLY,
  TEST_CHAT_ID_STRING,
} from './TelegramFixtures';

/**
 * Development smoke test runner for Telegram read-only ingestion slice.
 *
 * Demonstrates:
 * Telegram Updates -> TelegramSourceAdapter -> ExternalCommunitySourceEvent
 *   -> CommunityHistoryNormalizer -> Normalized Domain -> Evidence Analyzer
 */
export async function runTelegramIngestionSmokeTest(): Promise<{
  success: boolean;
  adaptedEventsCount: number;
  normalizedDiscussionsCount: number;
  evidenceClassifications: string[];
}> {
  const config = validateTelegramConfig({
    authorizedChatIds: new Set([TEST_CHAT_ID_STRING]),
    defaultRoadmapItemId: 'r_memory_agents',
  });

  const rawUpdates = [
    FIXTURE_TELEGRAM_UPDATE_001,
    FIXTURE_TELEGRAM_UPDATE_002_QUESTION,
    FIXTURE_TELEGRAM_UPDATE_003_REPLY,
  ];

  // 1. Adapter step
  const adaptedEvents = TelegramSourceAdapter.adaptUpdates(rawUpdates, config);

  // 2. Normalization step
  const normalizedDiscussions = CommunityHistoryNormalizer.normalize(adaptedEvents, {
    communityIdMapper: () => 'community_test_ai_group',
    defaultRoadmapItemId: 'r_memory_agents',
  });

  // 3. Evidence analysis step
  const evidenceClassifications = normalizedDiscussions.map(disc => {
    const analysis = DiscussionEvidenceAnalyzer.analyzeDiscussion(disc);
    return `${disc.id}: [${disc.type}] classification=${analysis.classification}, confidence=${analysis.confidence}`;
  });

  return {
    success: adaptedEvents.length === 3 && normalizedDiscussions.length === 2,
    adaptedEventsCount: adaptedEvents.length,
    normalizedDiscussionsCount: normalizedDiscussions.length,
    evidenceClassifications,
  };
}
