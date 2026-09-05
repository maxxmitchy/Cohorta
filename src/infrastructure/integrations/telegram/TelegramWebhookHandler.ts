import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { TelegramConfig } from './TelegramConfig';
import { validateTelegramWebhookPayload } from './TelegramPayloadValidator';
import { TelegramSourceAdapter } from './TelegramSourceAdapter';
import { ExternalCommunitySourceEvent } from '../../../core/source/ExternalCommunitySourceEvent';
import { ICommunityEventIngestionService } from '../../../core/services/ICommunityEventIngestionService';

export interface TelegramWebhookProcessResult {
  statusCode: number;
  body: {
    status?: 'ok';
    action?: 'processed' | 'ignored' | 'duplicate_ignored';
    reason?: string;
    eventId?: string;
    error?: string;
  };
  event?: ExternalCommunitySourceEvent | null;
}

export type TelegramEventSink = (event: ExternalCommunitySourceEvent) => Promise<void> | void;

/**
 * Orchestrates inbound Telegram webhook requests:
 * 1. Verifies secret-token header against TELEGRAM_WEBHOOK_SECRET (fail-closed, constant-time).
 * 2. Validates incoming payload schema (fail-fast, no blind casts, no data fabrication).
 * 3. Transforms valid updates into ExternalCommunitySourceEvent via TelegramSourceAdapter.
 * 4. Filters out private chats and unauthorized chats without application errors.
 * 5. Delegates idempotent ingestion to provider-agnostic ICommunityEventIngestionService.
 */
export class TelegramWebhookHandler {
  private readonly config: TelegramConfig;
  private readonly ingestionService?: ICommunityEventIngestionService;
  private readonly eventSink?: TelegramEventSink;
  /**
   * Fallback in-memory set when no ingestion service is injected (e.g. legacy tests)
   */
  private readonly processedEventIds = new Set<string>();
  private readonly maxProcessedEventHistory = 5000;

  private recordFallbackProcessed(eventKey: string): void {
    if (this.processedEventIds.size >= this.maxProcessedEventHistory) {
      const oldestKey = this.processedEventIds.values().next().value;
      if (oldestKey) {
        this.processedEventIds.delete(oldestKey);
      }
    }
    this.processedEventIds.add(eventKey);
  }

  constructor(
    config: TelegramConfig,
    ingestionServiceOrSink?: ICommunityEventIngestionService | TelegramEventSink,
    eventSink?: TelegramEventSink
  ) {
    this.config = config;
    if (typeof ingestionServiceOrSink === 'function') {
      this.eventSink = ingestionServiceOrSink;
    } else {
      this.ingestionService = ingestionServiceOrSink;
      this.eventSink = eventSink;
    }
  }

  /**
   * Core request processing logic, decoupled from specific HTTP server frameworks.
   */
  async processWebhook(headers: Record<string, string | string[] | undefined>, payload: unknown): Promise<TelegramWebhookProcessResult> {
    // 1. Secret Token Verification (Fail-closed)
    const configuredSecret = this.config.webhookSecret?.trim();
    if (!configuredSecret) {
      // Missing configured secret on server -> fail closed
      return {
        statusCode: 401,
        body: { error: 'Unauthorized' },
      };
    }

    const rawHeader = headers['x-telegram-bot-api-secret-token'];
    const suppliedSecret = Array.isArray(rawHeader) ? rawHeader[0]?.trim() : rawHeader?.trim();

    if (!suppliedSecret || !this.timingSafeCompare(suppliedSecret, configuredSecret)) {
      return {
        statusCode: 401,
        body: { error: 'Unauthorized' },
      };
    }

    // 2. Runtime Payload Validation
    const validationResult = validateTelegramWebhookPayload(payload);
    if (!validationResult.isValid) {
      return {
        statusCode: 400,
        body: { error: 'Bad Request' },
      };
    }

    if (!validationResult.isSupported) {
      // Valid Telegram update type but unsupported by Cohorta (e.g. poll, inline_query)
      return {
        statusCode: 200,
        body: { status: 'ok', action: 'ignored', reason: 'unsupported_update_type' },
      };
    }

    // 3. Adapter Transformation via Authoritative TelegramSourceAdapter
    const update = validationResult.update;
    let event: ExternalCommunitySourceEvent | null = null;
    try {
      event = TelegramSourceAdapter.adaptUpdate(update, this.config);
    } catch {
      // Unexpected adapter transformation error
      return {
        statusCode: 500,
        body: { error: 'Internal Server Error' },
      };
    }

    if (!event) {
      // Dropped by adapter (e.g. unauthorized chat, private chat, media without text/caption)
      return {
        statusCode: 200,
        body: { status: 'ok', action: 'ignored', reason: 'filtered_by_adapter' },
        event: null,
      };
    }

    // 4. Delegate to Ingestion Service (if configured) or Fallback In-Memory Idempotency
    if (this.ingestionService) {
      try {
        const ingestionResult = await this.ingestionService.ingestEvent(event);

        if (this.eventSink) {
          await this.eventSink(event);
        }

        if (ingestionResult.outcome === 'duplicate_ignored') {
          return {
            statusCode: 200,
            body: { status: 'ok', action: 'duplicate_ignored', eventId: event.externalEventId },
            event,
          };
        }

        if (ingestionResult.outcome === 'failed') {
          return {
            statusCode: 500,
            body: { error: 'Internal Server Error', reason: ingestionResult.error },
            event,
          };
        }

        return {
          statusCode: 200,
          body: { status: 'ok', action: 'processed', eventId: event.externalEventId },
          event,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err); console.error("Caught webhook error:", err);
        return {
          statusCode: 500,
          body: { error: 'Internal Server Error', reason: message },
          event,
        };
      }
    }

    // Fallback in-memory idempotency check (for standalone/legacy tests)
    const eventKey = `${event.provider}:${event.externalCommunityId}:${event.externalEventId}`;
    if (this.processedEventIds.has(eventKey)) {
      return {
        statusCode: 200,
        body: { status: 'ok', action: 'duplicate_ignored', eventId: event.externalEventId },
        event,
      };
    }

    this.recordFallbackProcessed(eventKey);

    // Deliver to Event Sink (if registered)
    if (this.eventSink) {
      try {
        await this.eventSink(event);
      } catch {
        return {
          statusCode: 500,
          body: { error: 'Internal Server Error' },
        };
      }
    }

    return {
      statusCode: 200,
      body: { status: 'ok', action: 'processed', eventId: event.externalEventId },
      event,
    };
  }

  /**
   * Express Route Handler adapter
   */
  async handleExpress(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.processWebhook(req.headers, req.body);
      res.status(result.statusCode).json(result.body);
    } catch {
      console.error("TopLevel500"); res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  private timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');

    if (bufA.length !== bufB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Clears in-memory processed events (used for test isolation).
   */
  clearProcessedEvents(): void {
    this.processedEventIds.clear();
  }
}
