import { ITelegramClient, TelegramUpdate } from './ITelegramClient';
import { TelegramConfig } from './TelegramConfig';
import { TelegramSourceAdapter } from './TelegramSourceAdapter';
import { ICommunityEventIngestionService } from '../../../core/services/ICommunityEventIngestionService';
import { ICommunityIntegrationRepository } from '../../../core/repositories/ICommunityIntegrationRepository';
import {
  ITelegramBotCheckpointRepository,
} from './ITelegramBotCheckpointRepository';
import { MockTelegramBotCheckpointRepository } from './MockTelegramBotCheckpointRepository';
import {
  ITelegramReconciliationService,
  TelegramReconciliationOptions,
  TelegramReconciliationResult,
} from './ITelegramReconciliationService';

export interface TelegramReconciliationExtendedOptions extends TelegramReconciliationOptions {
  /** If true, treats events transitioned to permanently_failed as safely finalized */
  allowDeadLetterCheckpoint?: boolean;
  /** Bot identifier for multi-bot environments */
  botId?: string;
}

/**
 * Deterministic Telegram Update Reconciliation Service.
 *
 * Invariants:
 * 1. The reconciliation cursor MUST NEVER advance past an update that has not reached
 *    an acceptable safe terminal state (processed, duplicate_ignored, or dead-lettered permanently_failed).
 * 2. Checkpoint advancement is strictly contiguous. Gaps and failures halt cursor advancement.
 * 3. Bot stream checkpointing is completely decoupled from individual CommunityIntegration records.
 * 4. Ingests all adapted events through canonical ICommunityEventIngestionService to enforce deduplication.
 */
export class TelegramUpdateReconciliationService implements ITelegramReconciliationService {
  private readonly checkpointRepo: ITelegramBotCheckpointRepository;

  constructor(
    private readonly client: ITelegramClient,
    private readonly config: TelegramConfig,
    private readonly ingestionService: ICommunityEventIngestionService,
    checkpointRepoOrIntegrationRepo?: ITelegramBotCheckpointRepository | ICommunityIntegrationRepository,
    private readonly integrationRepo?: ICommunityIntegrationRepository
  ) {
    if (checkpointRepoOrIntegrationRepo && 'getCheckpoint' in checkpointRepoOrIntegrationRepo) {
      this.checkpointRepo = checkpointRepoOrIntegrationRepo;
    } else {
      this.checkpointRepo = new MockTelegramBotCheckpointRepository();
      if (checkpointRepoOrIntegrationRepo && 'getAllIntegrations' in checkpointRepoOrIntegrationRepo) {
        this.integrationRepo = checkpointRepoOrIntegrationRepo;
      }
    }
  }

  private deriveBotId(options?: TelegramReconciliationExtendedOptions): string {
    if (options?.botId) return options.botId;
    if (this.config.botToken) {
      const prefix = this.config.botToken.split(':')[0];
      return `bot_${prefix || 'default'}`;
    }
    return 'default_bot';
  }

  async reconcileUpdates(
    options?: TelegramReconciliationExtendedOptions
  ): Promise<TelegramReconciliationResult> {
    const botId = this.deriveBotId(options);
    const batchLimit = Math.min(options?.limit ?? 100, 100);
    const maxBatches = options?.maxBatches ?? 5;
    const allowDeadLetter = options?.allowDeadLetterCheckpoint ?? false;

    let initialCheckpoint = 0;
    const storedCp = await this.checkpointRepo.getCheckpoint(botId);
    if (storedCp) {
      initialCheckpoint = storedCp.lastContiguousUpdateId;
    }

    let currentOffset = options?.offset;
    if (currentOffset === undefined) {
      if (initialCheckpoint > 0) {
        currentOffset = initialCheckpoint + 1;
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

    let contiguousSafeCheckpoint = initialCheckpoint;
    let isContiguousChainIntact = true;
    let nextExpectedUpdateId: number | undefined =
      initialCheckpoint > 0 ? initialCheckpoint + 1 : undefined;

    for (let batch = 0; batch < maxBatches; batch++) {
      const rawUpdates = await this.client.fetchUpdates({
        offset: currentOffset,
        limit: batchLimit,
        timeout: options?.timeout ?? 0,
        allowedUpdates: options?.allowedUpdates || [
          'message',
          'edited_message',
          'channel_post',
          'edited_channel_post',
        ],
      });

      if (!rawUpdates || rawUpdates.length === 0) {
        break;
      }

      result.batchesProcessed++;
      result.updatesFetched += rawUpdates.length;

      // Ensure deterministic order by update_id
      const sortedUpdates: TelegramUpdate[] = [...rawUpdates].sort(
        (a, b) => a.update_id - b.update_id
      );

      for (const update of sortedUpdates) {
        if (typeof update.update_id !== 'number') {
          continue;
        }

        const updateId = update.update_id;
        const sourceEvent = TelegramSourceAdapter.adaptUpdate(update, this.config);

        let isSafeTerminal = false;

        if (!sourceEvent) {
          // Unhandled update type, unauthorized chat, or private message -> safe to drop
          isSafeTerminal = true;
        } else {
          const ingestResult = await this.ingestionService.ingestEvent(sourceEvent);

          if (ingestResult.outcome === 'processed') {
            result.eventsIngested++;
            isSafeTerminal = true;
          } else if (ingestResult.outcome === 'duplicate_ignored') {
            result.duplicatesSkipped++;
            isSafeTerminal = true;
          } else if (ingestResult.outcome === 'ignored') {
            // Explicitly ignored / unmapped community
            isSafeTerminal = true;
          } else if (ingestResult.outcome === 'failed') {
            result.failures++;
            // Check if permanently failed
            if (
              allowDeadLetter &&
              ingestResult.ingestionRecord?.status === 'permanently_failed'
            ) {
              isSafeTerminal = true;
            } else {
              isSafeTerminal = false;
            }
          }
        }

        // Evaluate Contiguous Safe Progression
        if (isSafeTerminal) {
          if (isContiguousChainIntact) {
            if (nextExpectedUpdateId === undefined) {
              contiguousSafeCheckpoint = updateId;
              nextExpectedUpdateId = updateId + 1;
            } else if (updateId === nextExpectedUpdateId) {
              contiguousSafeCheckpoint = updateId;
              nextExpectedUpdateId = updateId + 1;
            } else if (updateId > nextExpectedUpdateId) {
              // Gap detected! Stop contiguous advancement to prevent skipping missing updates
              isContiguousChainIntact = false;
            } else if (updateId <= contiguousSafeCheckpoint) {
              // Duplicate or redelivery within safe bounds; safe, does not break chain
            }
          }
        } else {
          // Transient failure detected: halt contiguous checkpoint progression
          isContiguousChainIntact = false;
        }
      }

      if (isContiguousChainIntact && contiguousSafeCheckpoint > 0) {
        currentOffset = contiguousSafeCheckpoint + 1;
        result.lastOffsetProcessed = currentOffset;
      }

      // If a failure occurred or gap was detected, stop pulling subsequent batches
      if (!isContiguousChainIntact) {
        break;
      }

      // If fewer updates than requested limit were returned, we have reached the end of backlog
      if (rawUpdates.length < batchLimit) {
        break;
      }
    }

    // Persist bot stream checkpoint if it advanced
    if (contiguousSafeCheckpoint > initialCheckpoint) {
      await this.checkpointRepo.saveCheckpoint(botId, contiguousSafeCheckpoint);
      result.checkpointSaved = contiguousSafeCheckpoint;

      if (this.integrationRepo) {
        const allIntegrations = await this.integrationRepo.getAllIntegrations();
        for (const integration of allIntegrations) {
          if (integration.providerType === 'telegram' && integration.isActive) {
            integration.lastCheckpoint = contiguousSafeCheckpoint;
            integration.lastSuccessfulIngestionAt = new Date();
            await this.integrationRepo.saveIntegration(integration);
          }
        }
      }
    } else if (initialCheckpoint > 0) {
      result.checkpointSaved = initialCheckpoint;
    }

    return result;
  }
}
