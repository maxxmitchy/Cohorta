import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { TelegramWebhookHandler } from './src/infrastructure/integrations/telegram/TelegramWebhookHandler';
import { loadTelegramConfigFromEnv } from './src/infrastructure/integrations/telegram/TelegramConfig';
import { DurableFileIngestionEventRepository } from './src/infrastructure/db/durable/DurableFileIngestionEventRepository';
import { DurableFileCommunityHistoryRepository } from './src/infrastructure/db/durable/DurableFileCommunityHistoryRepository';
import { DurableFileCommunityIntegrationRepository } from './src/infrastructure/db/durable/DurableFileCommunityIntegrationRepository';
import { MockUserRepository } from './src/infrastructure/db/mock/MockUserRepository';
import { MockCommunityRepository } from './src/infrastructure/db/mock/MockCommunityRepository';
import { CommunityEventIngestionService } from './src/core/services/CommunityEventIngestionService';
import { CommunityIntegrationService } from './src/core/services/CommunityIntegrationService';
import { IngestionObservabilityService } from './src/core/services/IngestionObservabilityService';
import { AuthorizationService } from './src/core/security/AuthorizationService';
import { ICommunityIntegrationRepository } from './src/core/repositories/ICommunityIntegrationRepository';
import { IIngestionEventRepository } from './src/core/repositories/IIngestionEventRepository';
import { ICommunityHistoryRepository } from './src/core/repositories/ICommunityHistoryRepository';
import { IUserRepository } from './src/core/repositories/IUserRepository';
import { ICommunityRepository } from './src/core/repositories/ICommunityRepository';
import {
  IntegrationConflictError,
  IntegrationNotFoundError,
  InvalidIntegrationError,
} from './src/core/services/ICommunityIntegrationService';

dotenv.config();

export interface ServerAppDependencies {
  ingestionRepo?: IIngestionEventRepository;
  historyRepo?: ICommunityHistoryRepository;
  integrationRepo?: ICommunityIntegrationRepository;
  userRepo?: IUserRepository;
  communityRepo?: ICommunityRepository;
}

export async function createServerApp(deps?: ServerAppDependencies) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json());

  // Composition Root: Durable Storage, Identity, & Ingestion Pipeline
  const ingestionRepo = deps?.ingestionRepo || new DurableFileIngestionEventRepository();
  const historyRepo = deps?.historyRepo || new DurableFileCommunityHistoryRepository();
  const integrationRepo = deps?.integrationRepo || new DurableFileCommunityIntegrationRepository();
  const userRepo = deps?.userRepo || new MockUserRepository();
  const communityRepo = deps?.communityRepo || new MockCommunityRepository();

  const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);
  const integrationService = new CommunityIntegrationService(integrationRepo, communityRepo);
  const observabilityService = new IngestionObservabilityService(ingestionRepo, integrationRepo);
  const authzService = new AuthorizationService(userRepo, communityRepo);

  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Telegram Inbound Webhook Endpoint
  // Authenticates Telegram delivery via secret token; does NOT grant administrative privileges
  app.post('/api/webhooks/telegram', async (req, res) => {
    try {
      let config;
      try {
        config = loadTelegramConfigFromEnv(process.env);
      } catch (err) {
        // Fail closed if Telegram environment configuration is incomplete or missing
        console.error('Config load failed:', err); res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const handler = new TelegramWebhookHandler(config, ingestionService);
      await handler.handleExpress(req, res);
    } catch (err) {
      console.error('500 Error processing webhook:', err); res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // --- ADMINISTRATIVE INTEGRATION MANAGEMENT ENDPOINTS ---

  // List integrations
  // Requires valid authentication. Admins view all integrations; creators view their owned community integrations.
  app.get('/api/integrations', async (req, res) => {
    try {
      const identity = await authzService.authenticateRequest(req.headers.authorization);
      if (!identity) {
        res.status(401).json({ error: 'Unauthorized: Authentication required.' });
        return;
      }

      if (authzService.canManageAllIntegrations(identity)) {
        const integrations = await integrationService.listAllIntegrations();
        res.json({ integrations });
        return;
      }

      if (identity.user.role === 'creator') {
        const allCommunities = await communityRepo.getAllCommunities();
        const owned = allCommunities.filter((c) => c.creatorId === identity.user.id);
        const nested = await Promise.all(owned.map((c) => integrationService.listIntegrationsForCommunity(c.id)));
        res.json({ integrations: nested.flat() });
        return;
      }

      res.status(403).json({ error: 'Forbidden: Insufficient permissions to view integrations.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // Overall Integration & Ingestion Health Report
  // Requires administrator authority
  app.get('/api/integrations/health', async (req, res) => {
    try {
      const identity = await authzService.authenticateRequest(req.headers.authorization);
      if (!identity) {
        res.status(401).json({ error: 'Unauthorized: Authentication required.' });
        return;
      }

      if (!authzService.canViewOperationalHealth(identity)) {
        res.status(403).json({ error: 'Forbidden: Insufficient permissions to view operational health.' });
        return;
      }

      const health = await observabilityService.getHealthReport();
      res.json(health);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // Create an explicit community integration mapping
  // Requires authentication and community management authorization (admin or community owner)
  app.post('/api/integrations', async (req, res) => {
    try {
      const identity = await authzService.authenticateRequest(req.headers.authorization);
      if (!identity) {
        res.status(401).json({ error: 'Unauthorized: Authentication required.' });
        return;
      }

      const { providerType, providerCommunityId, communityId, isActive, metadata } = req.body || {};

      const rawCommunityId = typeof communityId === 'string' ? communityId.trim() : '';
      if (!rawCommunityId) {
        res.status(400).json({ error: 'communityId must be provided.' });
        return;
      }

      const isAllowed = await authzService.canManageCommunity(identity, rawCommunityId);
      if (!isAllowed) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to manage integrations for this community.' });
        return;
      }

      const created = await integrationService.createIntegration({
        providerType,
        providerCommunityId,
        communityId: rawCommunityId,
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
      const identity = await authzService.authenticateRequest(req.headers.authorization);
      if (!identity) {
        res.status(401).json({ error: 'Unauthorized: Authentication required.' });
        return;
      }

      const { provider, providerCommunityId } = req.params;
      const integration = await integrationService.getIntegration(provider, providerCommunityId);
      if (!integration) {
        res.status(404).json({ error: `Integration for ${provider}:${providerCommunityId} not found.` });
        return;
      }

      const isAllowed = await authzService.canManageCommunity(identity, integration.communityId);
      if (!isAllowed) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to view this community integration.' });
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
      const identity = await authzService.authenticateRequest(req.headers.authorization);
      if (!identity) {
        res.status(401).json({ error: 'Unauthorized: Authentication required.' });
        return;
      }

      const { provider, providerCommunityId } = req.params;
      const integration = await integrationService.getIntegration(provider, providerCommunityId);
      if (!integration) {
        res.status(404).json({ error: `Integration for ${provider}:${providerCommunityId} not found.` });
        return;
      }

      const isAllowed = await authzService.canManageCommunity(identity, integration.communityId);
      if (!isAllowed) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to modify this community integration.' });
        return;
      }

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
      const identity = await authzService.authenticateRequest(req.headers.authorization);
      if (!identity) {
        res.status(401).json({ error: 'Unauthorized: Authentication required.' });
        return;
      }

      const { provider, providerCommunityId } = req.params;
      const integration = await integrationService.getIntegration(provider, providerCommunityId);
      if (!integration) {
        res.status(404).json({ error: `Integration for ${provider}:${providerCommunityId} not found.` });
        return;
      }

      const isAllowed = await authzService.canManageCommunity(identity, integration.communityId);
      if (!isAllowed) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to modify this community integration.' });
        return;
      }

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
      const identity = await authzService.authenticateRequest(req.headers.authorization);
      if (!identity) {
        res.status(401).json({ error: 'Unauthorized: Authentication required.' });
        return;
      }

      const { provider, providerCommunityId } = req.params;
      const integration = await integrationService.getIntegration(provider, providerCommunityId);
      if (!integration) {
        res.status(404).json({ error: `Integration for ${provider}:${providerCommunityId} not found.` });
        return;
      }

      const isAllowed = await authzService.canManageCommunity(identity, integration.communityId);
      if (!isAllowed) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to delete this community integration.' });
        return;
      }

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
