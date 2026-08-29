import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { TelegramWebhookHandler } from './src/infrastructure/integrations/telegram/TelegramWebhookHandler';
import { loadTelegramConfigFromEnv } from './src/infrastructure/integrations/telegram/TelegramConfig';
import { DurableFileIngestionEventRepository } from './src/infrastructure/db/durable/DurableFileIngestionEventRepository';
import { DurableFileCommunityHistoryRepository } from './src/infrastructure/db/durable/DurableFileCommunityHistoryRepository';
import { DurableFileCommunityIntegrationRepository } from './src/infrastructure/db/durable/DurableFileCommunityIntegrationRepository';
import { CommunityEventIngestionService } from './src/core/services/CommunityEventIngestionService';
import { CommunityIntegrationService } from './src/core/services/CommunityIntegrationService';
import { IngestionObservabilityService } from './src/core/services/IngestionObservabilityService';
import {
  IntegrationConflictError,
  IntegrationNotFoundError,
  InvalidIntegrationError,
} from './src/core/services/ICommunityIntegrationService';

dotenv.config();

export async function createServerApp() {
  const app = express();

  app.use(express.json());

  // Composition Root: Durable Storage & Ingestion Pipeline
  const ingestionRepo = new DurableFileIngestionEventRepository();
  const historyRepo = new DurableFileCommunityHistoryRepository();
  const integrationRepo = new DurableFileCommunityIntegrationRepository();
  const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
  const integrationService = new CommunityIntegrationService(integrationRepo);
  const observabilityService = new IngestionObservabilityService(ingestionRepo, integrationRepo);

  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Telegram Inbound Webhook Endpoint
  app.post('/api/webhooks/telegram', async (req, res) => {
    try {
      let config;
      try {
        config = loadTelegramConfigFromEnv(process.env);
      } catch {
        // Fail closed if Telegram environment configuration is incomplete or missing
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const handler = new TelegramWebhookHandler(config, ingestionService);
      await handler.handleExpress(req, res);
    } catch {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // --- ADMINISTRATIVE INTEGRATION MANAGEMENT ENDPOINTS ---

  // List all integrations
  app.get('/api/integrations', async (_req, res) => {
    try {
      const integrations = await integrationService.listAllIntegrations();
      res.json({ integrations });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // Overall Integration & Ingestion Health Report
  app.get('/api/integrations/health', async (_req, res) => {
    try {
      const health = await observabilityService.getHealthReport();
      res.json(health);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // Create an explicit community integration mapping
  app.post('/api/integrations', async (req, res) => {
    try {
      const { providerType, providerCommunityId, communityId, isActive, metadata } = req.body || {};
      const created = await integrationService.createIntegration({
        providerType,
        providerCommunityId,
        communityId,
        isActive,
        metadata,
      });
      res.status(201).json({ integration: created });
    } catch (err: unknown) {
      if (err instanceof InvalidIntegrationError) {
        res.status(400).json({ error: err.message });
      } else if (err instanceof IntegrationConflictError) {
        res.status(409).json({ error: err.message });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
    }
  });

  // Get a single integration by provider and external ID
  app.get('/api/integrations/:provider/:providerCommunityId', async (req, res) => {
    try {
      const { provider, providerCommunityId } = req.params;
      const integration = await integrationService.getIntegration(provider, providerCommunityId);
      if (!integration) {
        res.status(404).json({ error: `Integration for ${provider}:${providerCommunityId} not found.` });
        return;
      }
      const health = await integrationService.getIntegrationHealth(provider, providerCommunityId);
      res.json({ integration, health });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // Enable an integration
  app.post('/api/integrations/:provider/:providerCommunityId/enable', async (req, res) => {
    try {
      const { provider, providerCommunityId } = req.params;
      const updated = await integrationService.enableIntegration(provider, providerCommunityId);
      res.json({ integration: updated });
    } catch (err: unknown) {
      if (err instanceof IntegrationNotFoundError) {
        res.status(404).json({ error: err.message });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
    }
  });

  // Disable an integration
  app.post('/api/integrations/:provider/:providerCommunityId/disable', async (req, res) => {
    try {
      const { provider, providerCommunityId } = req.params;
      const updated = await integrationService.disableIntegration(provider, providerCommunityId);
      res.json({ integration: updated });
    } catch (err: unknown) {
      if (err instanceof IntegrationNotFoundError) {
        res.status(404).json({ error: err.message });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
      }
    }
  });

  // Remove an integration (disables future ingestion without destroying historical data)
  app.delete('/api/integrations/:provider/:providerCommunityId', async (req, res) => {
    try {
      const { provider, providerCommunityId } = req.params;
      const deleted = await integrationService.deactivateOrRemoveIntegration(provider, providerCommunityId);
      if (!deleted) {
        res.status(404).json({ error: `Integration for ${provider}:${providerCommunityId} not found.` });
        return;
      }
      res.json({ success: true, message: `Integration ${provider}:${providerCommunityId} removed. Historical data preserved.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return app;
}

async function startServer() {
  const app = await createServerApp();
  const PORT = 3000;

  // Vite middleware for development / Static in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cohorta Server running on http://localhost:${PORT}`);
  });
}

// Start server when executed directly
if (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.cjs'))) {
  startServer();
}
