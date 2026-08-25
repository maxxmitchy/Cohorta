import { describe, it, expect } from 'vitest';
import { MockMembershipRepository } from './MockMembershipRepository';

describe('MockMembershipRepository', () => {
  const repo = new MockMembershipRepository();

  it('resolves member progress correctly for partial progress', async () => {
    const view = await repo.getMemberCommunityView('u_member_partial', 'com_1');
    expect(view).not.toBeNull();
    expect(view?.totalItems).toBeGreaterThan(0);
    expect(view?.completedItems).toBe(2);
    expect(view?.roadmap.find(r => r.userProgressStatus === 'completed')).toBeDefined();
    expect(view?.roadmap.find(r => r.userProgressStatus === 'current')).toBeDefined();
    expect(view?.roadmap.find(r => r.userProgressStatus === 'locked')).toBeDefined();
  });

  it('returns null for an unauthenticated or non-member user', async () => {
    const view = await repo.getMemberCommunityView('u_visitor', 'com_1');
    expect(view).toBeNull();
  });

  it('returns null for an expired membership', async () => {
    const view = await repo.getMemberCommunityView('u_member_expired', 'com_1');
    expect(view).toBeNull();
  });
});
