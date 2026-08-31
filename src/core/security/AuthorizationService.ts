import { IUserRepository } from '../repositories/IUserRepository';
import { ICommunityRepository } from '../repositories/ICommunityRepository';
import { IAuthorizationService, AuthenticatedIdentity } from './IAuthorizationService';

export class AuthorizationService implements IAuthorizationService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly communityRepo: ICommunityRepository
  ) {}

  async authenticateRequest(authHeader?: string): Promise<AuthenticatedIdentity | null> {
    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }

    const trimmed = authHeader.trim();
    if (!trimmed.toLowerCase().startsWith('bearer ')) {
      return null;
    }

    const rawToken = trimmed.slice(7).trim();
    if (!rawToken) {
      return null;
    }

    // 1. Check production / environment administrative key if configured
    const adminKey = process.env.COHORTA_ADMIN_API_KEY;
    if (adminKey && adminKey.length > 0 && rawToken === adminKey) {
      return {
        user: {
          id: 'u_admin_system',
          name: 'Platform Operator',
          email: 'ops@cohorta.internal',
          role: 'admin',
          createdAt: new Date(0),
        },
        token: rawToken,
      };
    }

    // 2. Resolve token to user identity (supports mock_token_<userId> and direct <userId>)
    const userId = rawToken.startsWith('mock_token_') ? rawToken.replace('mock_token_', '') : rawToken;
    const user = await this.userRepo.getUserById(userId);

    if (!user) {
      return null;
    }

    return {
      user,
      token: rawToken,
    };
  }

  canManageAllIntegrations(identity: AuthenticatedIdentity | null): boolean {
    if (!identity || !identity.user) {
      return false;
    }
    return identity.user.role === 'admin';
  }

  canViewOperationalHealth(identity: AuthenticatedIdentity | null): boolean {
    if (!identity || !identity.user) {
      return false;
    }
    // Global operational telemetry reveals multi-tenant queues and error traces; restricted to admins
    return identity.user.role === 'admin';
  }

  async canManageCommunity(identity: AuthenticatedIdentity | null, communityId: string): Promise<boolean> {
    if (!identity || !identity.user || !communityId) {
      return false;
    }

    // System administrators can manage integrations across all communities
    if (identity.user.role === 'admin') {
      return true;
    }

    // Community creators can only manage integrations for communities they own
    if (identity.user.role === 'creator') {
      const community = await this.communityRepo.getCommunityById(communityId.trim());
      if (community && community.creatorId === identity.user.id) {
        return true;
      }
    }

    return false;
  }
}
