import { Session } from '../domain/session';

export interface IAuthService {
  /**
   * Retrieves the current session state.
   */
  getCurrentSession(): Promise<Session>;
  
  /**
   * Signs in a user (mock abstraction).
   */
  signIn(userId: string): Promise<Session>;

  /**
   * Signs out the current user.
   */
  signOut(): Promise<void>;
}
