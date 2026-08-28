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

dotenv.config();

export async function createServerApp() {
  const app = express();

  app.use(express.json());

  // Composition Root: Durable Storage & Ingestion Pipeline
  const ingestionRepo = new DurableFileIngestionEventRepository();
  const historyRepo = new DurableFileCommunityHistoryRepository();
  const integrationRepo = new DurableFileCommunityIntegrationRepository();
  const ingestionService = new CommunityEventIngestionService(ingestionRepo, historyRepo, integrationRepo);

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
