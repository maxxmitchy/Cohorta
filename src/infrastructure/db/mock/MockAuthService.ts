import { IAuthService } from '../../../core/services/IAuthService';
import { Session } from '../../../core/domain/session';
import { mockUsers } from './mockData';

export class MockAuthService implements IAuthService {
  private currentUserId: string | null = null; // Default to unauthenticated

  async getCurrentSession(): Promise<Session> {
    if (!this.currentUserId) {
      return { state: 'unauthenticated' };
    }

    const user = mockUsers.find(u => u.id === this.currentUserId);
    if (!user) {
      return { state: 'unauthenticated' };
    }

    return {
      state: 'authenticated',
      user,
    };
  }

  async setMockUser(userId: string | null): Promise<void> {
    this.currentUserId = userId;
  }
}
