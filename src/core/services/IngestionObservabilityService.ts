import { IIngestionEventRepository } from '../repositories/IIngestionEventRepository';
import { ICommunityIntegrationRepository } from '../repositories/ICommunityIntegrationRepository';
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
          error: event.error,
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
      lastProcessingError: i.lastProcessingError,
      lastCheckpoint: i.lastCheckpoint,
    }));

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (permanentlyFailedCount > 0 || staleCount > 5) {
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
      activeIntegrationsCount: integrations.filter((i) => i.isActive).length,
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
        error: e.error,
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
      lastProcessingError: i.lastProcessingError,
      lastCheckpoint: i.lastCheckpoint,
    }));
  }
}
