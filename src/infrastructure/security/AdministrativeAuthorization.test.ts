import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { createServerApp } from '../../../server';
import { DurableFileIngestionEventRepository } from '../db/durable/DurableFileIngestionEventRepository';
import { DurableFileCommunityHistoryRepository } from '../db/durable/DurableFileCommunityHistoryRepository';
import { DurableFileCommunityIntegrationRepository } from '../db/durable/DurableFileCommunityIntegrationRepository';
import { MockUserRepository } from '../db/mock/MockUserRepository';
import { MockCommunityRepository } from '../db/mock/MockCommunityRepository';
import { Express } from 'express';

describe('Phase 13.7.1: Administrative Authorization & Integration Boundary Hardening', () => {
  const testDir = path.join(process.cwd(), '.data_test_security_authz_' + Date.now());
  const integrationsPath = path.join(testDir, 'community_integrations.json');
  const ingestionEventsPath = path.join(testDir, 'ingestion_events.json');
  const historyPath = path.join(testDir, 'community_history.json');

  let integrationRepo: DurableFileCommunityIntegrationRepository;
  let ingestionRepo: DurableFileIngestionEventRepository;
  let historyRepo: DurableFileCommunityHistoryRepository;
  let userRepo: MockUserRepository;
  let communityRepo: MockCommunityRepository;
  let app: Express;

  beforeEach(async () => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    integrationRepo = new DurableFileCommunityIntegrationRepository(integrationsPath);
    ingestionRepo = new DurableFileIngestionEventRepository(ingestionEventsPath);
    historyRepo = new DurableFileCommunityHistoryRepository(historyPath);
    userRepo = new MockUserRepository();
    communityRepo = new MockCommunityRepository();

    app = await createServerApp({
      ingestionRepo,
      historyRepo,
      integrationRepo,
      userRepo,
      communityRepo,
    });
  });

  afterEach(async () => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('1. Unauthenticated Request Rejection (401 Unauthorized)', () => {
    it('rejects unauthenticated GET /api/integrations', async () => {
      const res = await request(app).get('/api/integrations');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/i);
    });

    it('rejects unauthenticated GET /api/integrations/health', async () => {
      const res = await request(app).get('/api/integrations/health');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/i);
    });

    it('rejects unauthenticated POST /api/integrations', async () => {
      const res = await request(app).post('/api/integrations').send({
        providerType: 'telegram',
        providerCommunityId: '-100123456789',
        communityId: 'com_1',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/i);
    });

    it('rejects unauthenticated GET /api/integrations/:provider/:providerCommunityId', async () => {
      const res = await request(app).get('/api/integrations/telegram/-100123456789');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/i);
    });

    it('rejects unauthenticated POST /api/integrations/:provider/:providerCommunityId/enable', async () => {
      const res = await request(app).post('/api/integrations/telegram/-100123456789/enable');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/i);
    });

    it('rejects unauthenticated POST /api/integrations/:provider/:providerCommunityId/disable', async () => {
      const res = await request(app).post('/api/integrations/telegram/-100123456789/disable');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/i);
    });

    it('rejects unauthenticated DELETE /api/integrations/:provider/:providerCommunityId', async () => {
      const res = await request(app).delete('/api/integrations/telegram/-100123456789');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/i);
    });

    it('rejects forged or unknown bearer tokens', async () => {
      const res = await request(app)
        .get('/api/integrations')
        .set('Authorization', 'Bearer unknown_random_token_999');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/i);
    });
  });

  describe('2. Unauthorized Role Enforcement (403 Forbidden)', () => {
    // u_visitor is a 'learner'
    const learnerAuth = 'Bearer u_visitor';

    it('rejects learner viewing all integrations', async () => {
      const res = await request(app)
        .get('/api/integrations')
        .set('Authorization', learnerAuth);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/forbidden/i);
    });

    it('rejects learner viewing operational health telemetry', async () => {
      const res = await request(app)
        .get('/api/integrations/health')
        .set('Authorization', learnerAuth);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/forbidden/i);
    });

    it('rejects learner creating an integration', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', learnerAuth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '-100123456789',
          communityId: 'com_1',
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/forbidden/i);
    });

    it('rejects learner modifying or deleting existing integrations', async () => {
      // Pre-seed an integration via repository
      await integrationRepo.saveIntegration({
        id: 'int_telegram_-100123456789',
        communityId: 'com_1',
        providerType: 'telegram',
        providerCommunityId: '-100123456789',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const resDisable = await request(app)
        .post('/api/integrations/telegram/-100123456789/disable')
        .set('Authorization', learnerAuth);
      expect(resDisable.status).toBe(403);

      const resEnable = await request(app)
        .post('/api/integrations/telegram/-100123456789/enable')
        .set('Authorization', learnerAuth);
      expect(resEnable.status).toBe(403);

      const resDelete = await request(app)
        .delete('/api/integrations/telegram/-100123456789')
        .set('Authorization', learnerAuth);
      expect(resDelete.status).toBe(403);
    });
  });

  describe('3. Global Administrator Authority (u_admin)', () => {
    const adminAuth = 'Bearer u_admin';

    it('allows admin to view all integrations', async () => {
      await integrationRepo.saveIntegration({
        id: 'int_telegram_-1001111',
        communityId: 'com_1',
        providerType: 'telegram',
        providerCommunityId: '-1001111',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get('/api/integrations')
        .set('Authorization', adminAuth);
      expect(res.status).toBe(200);
      expect(res.body.integrations).toHaveLength(1);
    });

    it('allows admin to view operational health report', async () => {
      const res = await request(app)
        .get('/api/integrations/health')
        .set('Authorization', adminAuth);
      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
      expect(res.body.activeIntegrationsCount).toBeDefined();
    });

    it('allows admin to create an integration for any valid community', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', adminAuth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '-10099887766',
          communityId: 'com_2', // owned by u2
          isActive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.integration.providerCommunityId).toBe('-10099887766');
      expect(res.body.integration.communityId).toBe('com_2');
    });

    it('allows admin to inspect, toggle, and delete any integration', async () => {
      await integrationRepo.saveIntegration({
        id: 'int_telegram_-1005555',
        communityId: 'com_2',
        providerType: 'telegram',
        providerCommunityId: '-1005555',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Get
      const getRes = await request(app)
        .get('/api/integrations/telegram/-1005555')
        .set('Authorization', adminAuth);
      expect(getRes.status).toBe(200);
      expect(getRes.body.integration.isActive).toBe(true);

      // Disable
      const disableRes = await request(app)
        .post('/api/integrations/telegram/-1005555/disable')
        .set('Authorization', adminAuth);
      expect(disableRes.status).toBe(200);
      expect(disableRes.body.integration.isActive).toBe(false);

      // Enable
      const enableRes = await request(app)
        .post('/api/integrations/telegram/-1005555/enable')
        .set('Authorization', adminAuth);
      expect(enableRes.status).toBe(200);
      expect(enableRes.body.integration.isActive).toBe(true);

      // Delete
      const deleteRes = await request(app)
        .delete('/api/integrations/telegram/-1005555')
        .set('Authorization', adminAuth);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
    });
  });

  describe('4. Multi-Tenant Scoping & Community Creator Isolation', () => {
    // In mockData: u1 owns com_1 and com_empty. u2 owns com_2.
    const creator1Auth = 'Bearer u1';
    const creator2Auth = 'Bearer u2';

    it('allows creator to create and manage integrations on their own community (com_1)', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', creator1Auth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '-100112233',
          communityId: 'com_1',
        });

      expect(res.status).toBe(201);
      expect(res.body.integration.communityId).toBe('com_1');

      // Creator 1 can view
      const getRes = await request(app)
        .get('/api/integrations/telegram/-100112233')
        .set('Authorization', creator1Auth);
      expect(getRes.status).toBe(200);

      // Creator 1 can disable
      const disableRes = await request(app)
        .post('/api/integrations/telegram/-100112233/disable')
        .set('Authorization', creator1Auth);
      expect(disableRes.status).toBe(200);
      expect(disableRes.body.integration.isActive).toBe(false);
    });

    it('strictly isolates tenant boundaries: creator 1 cannot mutate creator 2 community (com_2)', async () => {
      // Pre-seed an integration on com_2 (owned by u2)
      await integrationRepo.saveIntegration({
        id: 'int_telegram_-1002222',
        communityId: 'com_2',
        providerType: 'telegram',
        providerCommunityId: '-1002222',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Creator 1 attempts to create integration on com_2 -> 403
      const createRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', creator1Auth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '-1009999',
          communityId: 'com_2',
        });
      expect(createRes.status).toBe(403);
      expect(createRes.body.error).toMatch(/not authorized to manage integrations for this community/i);

      // Creator 1 attempts to inspect com_2 integration -> 403
      const getRes = await request(app)
        .get('/api/integrations/telegram/-1002222')
        .set('Authorization', creator1Auth);
      expect(getRes.status).toBe(403);

      // Creator 1 attempts to disable com_2 integration -> 403
      const disableRes = await request(app)
        .post('/api/integrations/telegram/-1002222/disable')
        .set('Authorization', creator1Auth);
      expect(disableRes.status).toBe(403);

      // Creator 1 attempts to delete com_2 integration -> 403
      const deleteRes = await request(app)
        .delete('/api/integrations/telegram/-1002222')
        .set('Authorization', creator1Auth);
      expect(deleteRes.status).toBe(403);

      // Verify that Creator 2 CAN manage their own integration
      const creator2Disable = await request(app)
        .post('/api/integrations/telegram/-1002222/disable')
        .set('Authorization', creator2Auth);
      expect(creator2Disable.status).toBe(200);
    });

    it('filters GET /api/integrations to only owned communities for creators', async () => {
      // Seed integration for com_1 (u1) and com_2 (u2)
      await integrationRepo.saveIntegration({
        id: 'int_telegram_-1001111',
        communityId: 'com_1',
        providerType: 'telegram',
        providerCommunityId: '-1001111',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await integrationRepo.saveIntegration({
        id: 'int_telegram_-1002222',
        communityId: 'com_2',
        providerType: 'telegram',
        providerCommunityId: '-1002222',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Creator 1 only sees com_1 integration
      const res1 = await request(app)
        .get('/api/integrations')
        .set('Authorization', creator1Auth);
      expect(res1.status).toBe(200);
      expect(res1.body.integrations).toHaveLength(1);
      expect(res1.body.integrations[0].communityId).toBe('com_1');

      // Creator 2 only sees com_2 integration
      const res2 = await request(app)
        .get('/api/integrations')
        .set('Authorization', creator2Auth);
      expect(res2.status).toBe(200);
      expect(res2.body.integrations).toHaveLength(1);
      expect(res2.body.integrations[0].communityId).toBe('com_2');
    });
  });

  describe('5. Client Forgery & Parameter Tampering Resistance', () => {
    const learnerAuth = 'Bearer u_visitor';

    it('ignores client-sent isAdmin and role in body', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', learnerAuth)
        .send({
          isAdmin: true,
          role: 'admin',
          isAuthorized: true,
          providerType: 'telegram',
          providerCommunityId: '-100123456789',
          communityId: 'com_1',
        });
      expect(res.status).toBe(403);
    });

    it('ignores client-sent query parameters like ?role=admin', async () => {
      const res = await request(app)
        .get('/api/integrations?role=admin&isAdmin=true')
        .set('Authorization', learnerAuth);
      expect(res.status).toBe(403);
    });

    it('ignores forged custom headers like x-admin: true', async () => {
      const res = await request(app)
        .get('/api/integrations')
        .set('Authorization', learnerAuth)
        .set('x-admin', 'true')
        .set('x-role', 'admin')
        .set('x-is-admin', 'true');
      expect(res.status).toBe(403);
    });
  });

  describe('6. Telegram Webhook Credential Separation', () => {
    it('rejects Telegram webhook secret token as administrative authorization', async () => {
      // An attacker attempts to use the telegram bot secret token to access admin integration endpoints
      const res = await request(app)
        .get('/api/integrations')
        .set('x-telegram-bot-api-secret-token', 'super_secret_webhook_token');
      expect(res.status).toBe(401);
    });

    it('rejects Telegram webhook secret token as Bearer token', async () => {
      const res = await request(app)
        .get('/api/integrations')
        .set('Authorization', 'Bearer super_secret_webhook_token');
      expect(res.status).toBe(401);
    });
  });

  describe('7. Input Validation & Conflict Hardening', () => {
    const adminAuth = 'Bearer u_admin';

    it('rejects unsupported provider type', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', adminAuth)
        .send({
          providerType: 'unsupported_chat_app',
          providerCommunityId: '-100123',
          communityId: 'com_1',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/unsupported provider/i);
    });

    it('rejects empty or whitespace-only providerCommunityId', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', adminAuth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '   ',
          communityId: 'com_1',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/providerCommunityId/i);
    });

    it('rejects overly long providerCommunityId (> 128 chars)', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', adminAuth)
        .send({
          providerType: 'telegram',
          providerCommunityId: 'a'.repeat(129),
          communityId: 'com_1',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot exceed 128 characters/i);
    });

    it('rejects control characters in identifiers', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', adminAuth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '-100123\x00\x1F',
          communityId: 'com_1',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid control characters/i);
    });

    it('rejects integration pointing to non-existent Cohorta community', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', adminAuth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '-10012345',
          communityId: 'c_phantom_nonexistent_community',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not exist/i);
    });

    it('enforces 1:1 invariant and rejects duplicate and conflicting mappings (409)', async () => {
      // 1. Create initial valid integration
      const res1 = await request(app)
        .post('/api/integrations')
        .set('Authorization', adminAuth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '-100778899',
          communityId: 'com_1',
        });
      expect(res1.status).toBe(201);

      // 2. Duplicate mapping on same community -> 409
      const dupRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', adminAuth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '-100778899',
          communityId: 'com_1',
        });
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error).toMatch(/already exists/i);

      // 3. Conflicting mapping targeting different community -> 409
      const conflictRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', adminAuth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '-100778899',
          communityId: 'com_2',
        });
      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error).toMatch(/already mapped to/i);
    });
  });

  describe('8. Durability, Deletion & Non-Destructive Integrity', () => {
    const adminAuth = 'Bearer u_admin';

    it('persists integration across fresh service instantiations', async () => {
      const createRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', adminAuth)
        .send({
          providerType: 'telegram',
          providerCommunityId: '-100999111',
          communityId: 'com_1',
          isActive: true,
        });
      expect(createRes.status).toBe(201);

      // Create a fresh app instance pointing to the same durable disk file
      const freshIntegrationRepo = new DurableFileCommunityIntegrationRepository(integrationsPath);
      const freshApp = await createServerApp({
        ingestionRepo,
        historyRepo,
        integrationRepo: freshIntegrationRepo,
        userRepo,
        communityRepo,
      });

      const getRes = await request(freshApp)
        .get('/api/integrations/telegram/-100999111')
        .set('Authorization', adminAuth);
      expect(getRes.status).toBe(200);
      expect(getRes.body.integration.communityId).toBe('com_1');
      expect(getRes.body.integration.isActive).toBe(true);
    });

    it('safely deactivates or removes integration without deleting historical data', async () => {
      // 1. Seed integration and historical message
      await integrationRepo.saveIntegration({
        id: 'int_telegram_-100888',
        communityId: 'com_1',
        providerType: 'telegram',
        providerCommunityId: '-100888',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await historyRepo.saveDiscussion({
        id: 'disc_hist_1',
        communityId: 'com_1',
        title: 'Preserved Historical Discussion',
        content: 'Historical message from Telegram',
        author: {
          id: 'user_tg_1',
          name: 'Telegram User',
          role: 'member',
          avatarUrl: '',
        },
        roadmapItemId: '',
        topicTitle: '',
        type: 'discussion',
        createdAt: new Date(),
        replyCount: 0,
        replies: [],
        sourceProvenance: {
          provider: 'telegram',
          externalCommunityId: '-100888',
          externalMessageId: '101',
          originalTimestamp: new Date(),
          ingestedAt: new Date(),
        }
      });

      // 2. Delete integration via Admin API
      const delRes = await request(app)
        .delete('/api/integrations/telegram/-100888')
        .set('Authorization', adminAuth);
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // 3. Confirm integration is removed from active mappings
      const getRes = await request(app)
        .get('/api/integrations/telegram/-100888')
        .set('Authorization', adminAuth);
      expect(getRes.status).toBe(404);

      // 4. Confirm historical discussion remains 100% intact
      const history = await historyRepo.getAllDiscussions('com_1');
      const target = history.find((d) => d.id === 'disc_hist_1');
      expect(target).toBeDefined();
      expect(target?.title).toBe('Preserved Historical Discussion');
    });
  });
});
