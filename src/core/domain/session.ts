import { User } from './user';

export type AuthState = 'unauthenticated' | 'authenticated';

export interface Session {
  state: AuthState;
  user?: User; // Only present if authenticated
}
