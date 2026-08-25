import { Session } from '../domain/session';

export interface IAuthService {
  /**
   * Retrieves the current mock session state.
   */
  getCurrentSession(): Promise<Session>;
  
  /**
   * Dev tool: Force a specific user ID for testing mock states.
   */
  setMockUser(userId: string | null): Promise<void>;
}
