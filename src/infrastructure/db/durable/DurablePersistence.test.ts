import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DurableFileIngestionEventRepository } from './DurableFileIngestionEventRepository';
import { DurableFileCommunityHistoryRepository } from './DurableFileCommunityHistoryRepository';
import { DurableFileCommunityIntegrationRepository } from './DurableFileCommunityIntegrationRepository';
import { CommunityEventIngestionService } from '../../../core/services/CommunityEventIngestionService';
import { ExternalCommunitySourceEvent } from '../../../core/source/ExternalCommunitySourceEvent';

describe('Durable File Persistence & Server Restart Survival', () => {
  let tempDir: string;
  let ingestionFilePath: string;
  let historyFilePath: string;
  let integrationFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cohorta-durable-test-'));
    ingestionFilePath = path.join(tempDir, 'ingestion_events.json');
    historyFilePath = path.join(tempDir, 'community_history.json');
    integrationFilePath = path.join(tempDir, 'community_integrations.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('1. Survives simulated server restart: Events and Discussions persist across instances', async () => {
    // === SERVER INSTANCE 1 ===
    const ingestionRepo1 = new DurableFileIngestionEventRepository(ingestionFilePath);
    const historyRepo1 = new DurableFileCommunityHistoryRepository(historyFilePath, false);
    const integrationRepo1 = new DurableFileCommunityIntegrationRepository(integrationFilePath);

    await integrationRepo1.saveIntegration({
      id: 'int_tg_persist',
      communityId: 'com_persist',
      providerType: 'telegram',
      providerCommunityId: '-100999888',
      isActive: true,
      metadata: { credentialsRef: 'env:TELEGRAM_BOT_TOKEN', syncIntervalMinutes: 5 },
      createdAt: new Date('2026-01-01'),
    });

    const ingestionService1 = new CommunityEventIngestionService(
      ingestionRepo1,
      historyRepo1,
      integrationRepo1
    );

    const event: ExternalCommunitySourceEvent = {
      provider: 'telegram',
      externalCommunityId: '-100999888',
      externalEventId: 'upd_restart_1',
      externalMessageId: 'msg_restart_1',
      eventType: 'message_created',
      timestamp: new Date('2026-03-01T17:00:00Z'),
      author: { externalUserId: 'u_persist', displayName: 'Durable User' },
      content: 'Persisted message that must survive process restart.',
      topicHint: 'Durability',
    };

    const res1 = await ingestionService1.ingestEvent(event);
    expect(res1.outcome).toBe('processed');

    // Verify files were written to disk
    expect(fs.existsSync(ingestionFilePath)).toBe(true);
    expect(fs.existsSync(historyFilePath)).toBe(true);
    expect(fs.existsSync(integrationFilePath)).toBe(true);

    // === SIMULATED SERVER RESTART / CRASH (Brand New Instances instantiated from disk) ===
    const ingestionRepo2 = new DurableFileIngestionEventRepository(ingestionFilePath);
    const historyRepo2 = new DurableFileCommunityHistoryRepository(historyFilePath, false);
    const integrationRepo2 = new DurableFileCommunityIntegrationRepository(integrationFilePath);

    // 1. Verify history was reloaded from disk
    const reloadedDiscussions = await historyRepo2.getAllDiscussions('com_persist');
    expect(reloadedDiscussions).toHaveLength(1);
    expect(reloadedDiscussions[0].content).toBe('Persisted message that must survive process restart.');

    // 2. Verify ingestion event record was reloaded from disk
    const reloadedRecord = await ingestionRepo2.findByEventKey('telegram:-100999888:upd_restart_1');
    expect(reloadedRecord).not.toBeNull();
    expect(reloadedRecord?.status).toBe('processed');

    // 3. New server instance receives same duplicate event -> correctly identifies duplicate!
    const ingestionService2 = new CommunityEventIngestionService(
      ingestionRepo2,
      historyRepo2,
      integrationRepo2
    );

    const res2 = await ingestionService2.ingestEvent(event);
    expect(res2.outcome).toBe('duplicate_ignored');

    // Ensure discussions count is still 1
    const finalDiscussions = await historyRepo2.getAllDiscussions('com_persist');
    expect(finalDiscussions).toHaveLength(1);
  });
});
