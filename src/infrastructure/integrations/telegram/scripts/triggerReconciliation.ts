import dotenv from 'dotenv';
import { HttpTelegramClient } from '../HttpTelegramClient';
import { loadTelegramConfigFromEnv } from '../TelegramConfig';
import { TelegramUpdateReconciliationService } from '../TelegramUpdateReconciliationService';
import { CommunityEventIngestionService } from '../../../../core/services/CommunityEventIngestionService';
import { DurableFileCommunityIntegrationRepository } from '../../../db/durable/DurableFileCommunityIntegrationRepository';
import { DurableFileCommunityHistoryRepository } from '../../../db/durable/DurableFileCommunityHistoryRepository';
import { DurableFileIngestionEventRepository } from '../../../db/durable/DurableFileIngestionEventRepository';

dotenv.config();

async function run() {
  const config = loadTelegramConfigFromEnv(process.env);
  const client = new HttpTelegramClient(config);
  
  const integrationRepo = new DurableFileCommunityIntegrationRepository('.data/community_integrations.json');
  const historyRepo = new DurableFileCommunityHistoryRepository('.data/community_history.json');
  const ingestionEventRepo = new DurableFileIngestionEventRepository('.data/ingestion_events.json');
  
  const ingestionService = new CommunityEventIngestionService(ingestionEventRepo, historyRepo, integrationRepo);
  
  const reconciliation = new TelegramUpdateReconciliationService(
    client,
    config,
    ingestionService,
    integrationRepo
  );
  
  console.log('Triggering reconciliation...');
  const result = await reconciliation.reconcileUpdates();
  console.log('Reconciliation result:', JSON.stringify(result, null, 2));
}

run().catch(console.error);
