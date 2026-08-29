import { ITelegramClient } from './ITelegramClient';
import { TelegramConfig } from './TelegramConfig';
import { TelegramSourceAdapter } from './TelegramSourceAdapter';
import { ICommunityEventIngestionService } from '../../../core/services/ICommunityEventIngestionService';
import { ICommunityIntegrationRepository } from '../../../core/repositories/ICommunityIntegrationRepository';
import {
  ITelegramReconciliationService,
  TelegramReconciliationOptions,
  TelegramReconciliationResult,
} from './ITelegramReconciliationService';

export class TelegramUpdateReconciliationService implements ITelegramReconciliationService {
  constructor(
    private readonly client: ITelegramClient,
    private readonly config: TelegramConfig,
    private readonly ingestionService: ICommunityEventIngestionService,
    private readonly integrationRepo: ICommunityIntegrationRepository
  ) {}

  async reconcileUpdates(
    options?: TelegramReconciliationOptions
  ): Promise<TelegramReconciliationResult> {
    const batchLimit = Math.min(options?.limit ?? 100, 100);
    const maxBatches = options?.maxBatches ?? 5;
    let currentOffset = options?.offset;

    // If offset not explicitly provided, find highest stored checkpoint among telegram integrations
    if (currentOffset === undefined) {
      const integrations = await this.integrationRepo.getAllIntegrations();
      const telegramIntegrations = integrations.filter((i) => i.providerType === 'telegram' && i.isActive);

      let maxCheckpoint = 0;
      for (const item of telegramIntegrations) {
        if (item.lastCheckpoint !== undefined) {
          const num = typeof item.lastCheckpoint === 'number' ? item.lastCheckpoint : parseInt(String(item.lastCheckpoint), 10);
          if (!isNaN(num) && num > maxCheckpoint) {
            maxCheckpoint = num;
          }
        }
      }

      if (maxCheckpoint > 0) {
        currentOffset = maxCheckpoint + 1;
      }
    }

    const result: TelegramReconciliationResult = {
      batchesProcessed: 0,
      updatesFetched: 0,
      eventsIngested: 0,
      duplicatesSkipped: 0,
      failures: 0,
      lastOffsetProcessed: currentOffset,
    };

    let highestUpdateId: number | undefined;

    for (let batch = 0; batch < maxBatches; batch++) {
      const updates = await this.client.fetchUpdates({
        offset: currentOffset,
        limit: batchLimit,
        timeout: options?.timeout ?? 0,
        allowedUpdates: options?.allowedUpdates || ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
      });

      if (!updates || updates.length === 0) {
        break;
      }

      result.batchesProcessed++;
      result.updatesFetched += updates.length;

      for (const update of updates) {
        if (typeof update.update_id === 'number') {
          if (highestUpdateId === undefined || update.update_id > highestUpdateId) {
            highestUpdateId = update.update_id;
          }
        }

        const sourceEvent = TelegramSourceAdapter.adaptUpdate(update, this.config);
        if (!sourceEvent) {
          continue;
        }

        const ingestResult = await this.ingestionService.ingestEvent(sourceEvent);

        if (ingestResult.outcome === 'processed') {
          result.eventsIngested++;
        } else if (ingestResult.outcome === 'duplicate_ignored') {
          result.duplicatesSkipped++;
        } else if (ingestResult.outcome === 'failed') {
          result.failures++;
        }
      }

      if (highestUpdateId !== undefined) {
        currentOffset = highestUpdateId + 1;
        result.lastOffsetProcessed = currentOffset;
      }

      // If fewer updates than requested limit were returned, we have reached the end of the backlog
      if (updates.length < batchLimit) {
        break;
      }
    }

    // Persist checkpoint to active integrations
    if (highestUpdateId !== undefined) {
      const integrations = await this.integrationRepo.getAllIntegrations();
      const telegramIntegrations = integrations.filter((i) => i.providerType === 'telegram');
      for (const intg of telegramIntegrations) {
        await this.integrationRepo.updateCheckpoint('telegram', intg.providerCommunityId, highestUpdateId);
      }
      result.checkpointSaved = highestUpdateId;
    }

    return result;
  }
}
