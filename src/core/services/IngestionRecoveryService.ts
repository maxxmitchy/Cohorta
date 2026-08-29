import { IIngestionEventRepository } from '../repositories/IIngestionEventRepository';
import { ICommunityEventIngestionService } from './ICommunityEventIngestionService';
import { IngestionEvent } from '../domain/ingestion';
import { ExternalCommunitySourceEvent } from '../source/ExternalCommunitySourceEvent';
import {
  IIngestionRecoveryService,
  IngestionRecoveryOptions,
  IngestionRecoverySummary,
  ReplayEventOptions,
  ReplayEventResult,
} from './IIngestionRecoveryService';

export class IngestionRecoveryService implements IIngestionRecoveryService {
  constructor(
    private readonly ingestionRepo: IIngestionEventRepository,
    private readonly ingestionService: ICommunityEventIngestionService
  ) {}

  async retryFailedEvents(
    eventReconstructor: (event: IngestionEvent) => Promise<ExternalCommunitySourceEvent | null>,
    options?: IngestionRecoveryOptions
  ): Promise<IngestionRecoverySummary> {
    const maxRetries = options?.maxRetries ?? 5;
    const batchSize = options?.batchSize ?? 50;

    const failedEvents = await this.ingestionRepo.findFailedEvents({
      provider: options?.provider,
      limit: batchSize,
      includePermanentlyFailed: false,
    });

    const summary: IngestionRecoverySummary = {
      scanned: failedEvents.length,
      retried: 0,
      recovered: 0,
      failed: 0,
      permanentlyFailed: 0,
    };

    for (const event of failedEvents) {
      const currentAttempts = event.retryCount || 0;
      if (currentAttempts >= maxRetries) {
        await this.ingestionRepo.markPermanentlyFailed(
          event.id,
          `Exhausted maximum retry limit of ${maxRetries} attempts`
        );
        summary.permanentlyFailed++;
        continue;
      }

      const sourceEvent = await eventReconstructor(event);
      if (!sourceEvent) {
        // Cannot reconstruct event data -> mark permanently failed if payload is unrecoverable
        await this.ingestionRepo.markPermanentlyFailed(
          event.id,
          'Unrecoverable event: source event payload or metadata could not be reconstructed.'
        );
        summary.permanentlyFailed++;
        continue;
      }

      summary.retried++;
      const result = await this.ingestionService.ingestEvent(sourceEvent);

      if (result.outcome === 'processed') {
        summary.recovered++;
      } else if (result.outcome === 'failed') {
        summary.failed++;
        if ((result.ingestionRecord?.retryCount || 0) >= maxRetries) {
          summary.permanentlyFailed++;
        }
      }
    }

    return summary;
  }

  async recoverStaleEvents(
    eventReconstructor: (event: IngestionEvent) => Promise<ExternalCommunitySourceEvent | null>,
    options?: IngestionRecoveryOptions
  ): Promise<IngestionRecoverySummary> {
    const staleTimeoutMs = options?.staleTimeoutMs ?? 30_000;
    const maxRetries = options?.maxRetries ?? 5;
    const batchSize = options?.batchSize ?? 50;

    const staleEvents = await this.ingestionRepo.findStaleEvents(staleTimeoutMs, {
      provider: options?.provider,
      limit: batchSize,
    });

    const summary: IngestionRecoverySummary = {
      scanned: staleEvents.length,
      retried: 0,
      recovered: 0,
      failed: 0,
      permanentlyFailed: 0,
    };

    for (const event of staleEvents) {
      const currentAttempts = event.retryCount || 0;
      if (currentAttempts >= maxRetries) {
        await this.ingestionRepo.markPermanentlyFailed(
          event.id,
          `Exhausted maximum retry limit of ${maxRetries} attempts (stale processing timeout)`
        );
        summary.permanentlyFailed++;
        continue;
      }

      const sourceEvent = await eventReconstructor(event);
      if (!sourceEvent) {
        await this.ingestionRepo.markPermanentlyFailed(
          event.id,
          'Unrecoverable stale event: source event payload or metadata could not be reconstructed.'
        );
        summary.permanentlyFailed++;
        continue;
      }

      summary.retried++;
      const result = await this.ingestionService.ingestEvent(sourceEvent);

      if (result.outcome === 'processed') {
        summary.recovered++;
      } else if (result.outcome === 'failed') {
        summary.failed++;
      }
    }

    return summary;
  }

  async replayEvent(
    eventId: string,
    eventReconstructor: (event: IngestionEvent) => Promise<ExternalCommunitySourceEvent | null>,
    options?: ReplayEventOptions
  ): Promise<ReplayEventResult> {
    const allEvents = await this.ingestionRepo.getAllEvents();
    const target = allEvents.find((e) => e.id === eventId);

    if (!target) {
      throw new Error(`IngestionEvent with id "${eventId}" not found.`);
    }

    // 1. Processed state: do not create duplicates; idempotent verification
    if (target.status === 'processed') {
      const sourceEvent = await eventReconstructor(target);
      if (sourceEvent) {
        await this.ingestionService.ingestEvent(sourceEvent);
      }
      return {
        success: true,
        outcome: 'duplicate_ignored',
        event: target,
        message: 'Event is already processed. History preserved idempotently without duplicates.',
      };
    }

    // 2. Active In-flight state: reject concurrent replay while within stale window
    if (target.status === 'processing') {
      const staleTimeoutMs = 30_000;
      const lastAttempt = target.lastAttemptAt || target.receivedAt;
      const elapsed = Date.now() - new Date(lastAttempt).getTime();
      if (elapsed < staleTimeoutMs) {
        return {
          success: false,
          outcome: 'in_flight',
          event: target,
          error: 'Event is currently actively in-flight. Cannot replay active processing.',
        };
      }
    }

    // 3. Permanently failed (Dead-Letter) state: require explicit audit override
    if (target.status === 'permanently_failed') {
      const allowOverride = options?.allowPermanentlyFailed || options?.forceReplayPermanentlyFailed;
      if (!allowOverride) {
        return {
          success: false,
          outcome: 'permanently_failed',
          event: target,
          error: 'Event is marked permanently_failed. Explicit override (allowPermanentlyFailed: true) is required to replay dead-lettered events.',
        };
      }

      // Explicitly reset status to 'failed' with audit trail and reset retry count for operator replay
      await this.ingestionRepo.updateStatus(
        target.id,
        'failed',
        `Reopened for manual replay: ${options?.reason || 'Operator override'}`,
        undefined,
        { resetRetryCount: true }
      );
    }

    const sourceEvent = await eventReconstructor(target);
    if (!sourceEvent) {
      return {
        success: false,
        outcome: 'rejected',
        event: target,
        error: `Cannot replay event "${eventId}": unable to reconstruct source payload.`,
      };
    }

    const result = await this.ingestionService.ingestEvent(sourceEvent);
    const freshEvents = await this.ingestionRepo.getAllEvents();
    const updated = freshEvents.find((e) => e.id === eventId) || result.ingestionRecord || target;

    return {
      success: result.outcome === 'processed',
      outcome:
        result.outcome === 'processed'
          ? 'processed'
          : result.outcome === 'duplicate_ignored'
          ? 'duplicate_ignored'
          : 'failed',
      event: updated,
      error: result.error,
    };
  }
}
