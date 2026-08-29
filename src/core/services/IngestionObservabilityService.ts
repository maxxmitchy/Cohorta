import { IIngestionEventRepository } from '../repositories/IIngestionEventRepository';
import { ICommunityIntegrationRepository } from '../repositories/ICommunityIntegrationRepository';
import { TelegramSecretSanitizer } from '../../infrastructure/integrations/telegram/TelegramSecretSanitizer';
import {
  IIngestionObservabilityService,
  IngestionHealthReport,
  DeadLetterEventSummary,
  IntegrationOperationalSummary,
} from './IIngestionObservabilityService';

export class IngestionObservabilityService implements IIngestionObservabilityService {
  constructor(
    private readonly ingestionRepo: IIngestionEventRepository,
    private readonly integrationRepo: ICommunityIntegrationRepository
  ) {}

  private sanitize(str?: string): string | undefined {
    if (!str) return undefined;
    return TelegramSecretSanitizer.sanitizeString(str);
  }

  async getHealthReport(options?: { staleTimeoutMs?: number }): Promise<IngestionHealthReport> {
    const staleTimeoutMs = options?.staleTimeoutMs ?? 30_000;
    const now = Date.now();

    const allEvents = await this.ingestionRepo.getAllEvents();
    const integrations = await this.integrationRepo.getAllIntegrations();

    let processedCount = 0;
    let inFlightCount = 0;
    let staleCount = 0;
    let failedCount = 0;
    let permanentlyFailedCount = 0;

    const deadLetters: DeadLetterEventSummary[] = [];

    for (const event of allEvents) {
      if (event.status === 'processed') {
        processedCount++;
      } else if (event.status === 'processing') {
        const lastAttempt = event.lastAttemptAt || event.receivedAt;
        const elapsed = now - new Date(lastAttempt).getTime();
        if (elapsed >= staleTimeoutMs) {
          staleCount++;
        } else {
          inFlightCount++;
        }
      } else if (event.status === 'failed') {
        failedCount++;
      } else if (event.status === 'permanently_failed') {
        permanentlyFailedCount++;
        deadLetters.push({
          id: event.id,
          provider: event.provider,
          externalCommunityId: event.externalCommunityId,
          externalEventId: event.externalEventId,
          receivedAt: event.receivedAt,
          lastAttemptAt: event.lastAttemptAt,
          permanentlyFailedAt: event.permanentlyFailedAt,
          retryCount: event.retryCount || 0,
          error: this.sanitize(event.error),
        });
      }
    }

    const integrationSummaries: IntegrationOperationalSummary[] = integrations.map((i) => ({
      providerType: i.providerType,
      providerCommunityId: i.providerCommunityId,
      communityId: i.communityId,
      isActive: i.isActive,
      lastSuccessfulIngestionAt: i.lastSuccessfulIngestionAt,
      lastFailedIngestionAt: i.lastFailedIngestionAt,
      lastProcessingError: this.sanitize(i.lastProcessingError),
      lastCheckpoint: i.lastCheckpoint,
    }));

    /**
     * Deterministic Health State Rules:
     * - 'unhealthy':
     *     - Any dead-letter permanently_failed events (> 0)
     *     - Critical stale processing backlog (staleCount > 5)
     *     - All integrations disabled when integrations exist
     * - 'degraded':
     *     - Any transient failed events (> 0)
     *     - Minor stale processing count (1 <= staleCount <= 5)
     * - 'healthy':
     *     - 0 permanently_failed, 0 failed, 0 stale events.
     */
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const totalIntegrations = integrations.length;
    const activeIntegrations = integrations.filter((i) => i.isActive).length;

    if (
      permanentlyFailedCount > 0 ||
      staleCount > 5 ||
      (totalIntegrations > 0 && activeIntegrations === 0)
    ) {
      status = 'unhealthy';
    } else if (failedCount > 0 || staleCount > 0) {
      status = 'degraded';
    }

    return {
      status,
      totalEvents: allEvents.length,
      processedCount,
      inFlightCount,
      staleCount,
      failedCount,
      permanentlyFailedCount,
      activeIntegrationsCount: activeIntegrations,
      integrations: integrationSummaries,
      recentDeadLetterEvents: deadLetters.slice(0, 20),
      generatedAt: new Date(),
    };
  }

  async getDeadLetterEvents(options?: { provider?: string; limit?: number }): Promise<DeadLetterEventSummary[]> {
    const failedEvents = await this.ingestionRepo.findFailedEvents({
      provider: options?.provider,
      limit: options?.limit ?? 50,
      includePermanentlyFailed: true,
    });

    const deadLetters = failedEvents
      .filter((e) => e.status === 'permanently_failed')
      .map((e) => ({
        id: e.id,
        provider: e.provider,
        externalCommunityId: e.externalCommunityId,
        externalEventId: e.externalEventId,
        receivedAt: e.receivedAt,
        lastAttemptAt: e.lastAttemptAt,
        permanentlyFailedAt: e.permanentlyFailedAt,
        retryCount: e.retryCount || 0,
        error: this.sanitize(e.error),
      }));

    return deadLetters;
  }

  async getIntegrationSummaries(): Promise<IntegrationOperationalSummary[]> {
    const integrations = await this.integrationRepo.getAllIntegrations();
    return integrations.map((i) => ({
      providerType: i.providerType,
      providerCommunityId: i.providerCommunityId,
      communityId: i.communityId,
      isActive: i.isActive,
      lastSuccessfulIngestionAt: i.lastSuccessfulIngestionAt,
      lastFailedIngestionAt: i.lastFailedIngestionAt,
      lastProcessingError: this.sanitize(i.lastProcessingError),
      lastCheckpoint: i.lastCheckpoint,
    }));
  }
}
