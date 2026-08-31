import { User } from '../domain/user';

export interface AuthenticatedIdentity {
  user: User;
  token?: string;
}

/**
 * Provider-Neutral Authorization & Authentication Service Interface.
 *
 * Enforces:
 * 1. Request authentication via bearer token / session credentials.
 * 2. Role-based and ownership-based integration management authorization.
 * 3. Operational telemetry access control.
 * 4. Multi-tenant community isolation.
 */
export interface IAuthorizationService {
  /**
   * Resolves and authenticates a request using the provided Authorization header.
   * Returns AuthenticatedIdentity if valid, or null if missing/invalid/forged.
   */
  authenticateRequest(authHeader?: string): Promise<AuthenticatedIdentity | null>;

  /**
   * Determines if the caller has global administrative authority (can manage all communities).
   */
  canManageAllIntegrations(identity: AuthenticatedIdentity | null): boolean;

  /**
   * Determines if the caller can inspect operational health reports.
   */
  canViewOperationalHealth(identity: AuthenticatedIdentity | null): boolean;

  /**
   * Determines if the caller can manage integrations for a specific Cohorta community.
   * Enforces community ownership (creators can only manage their own communities, admins can manage all).
   */
  canManageCommunity(identity: AuthenticatedIdentity | null, communityId: string): Promise<boolean>;
}
