import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '../../core/domain/session';
import { useServices } from './ServiceContext';
import { MockAuthService } from '../../infrastructure/db/mock/MockAuthService';

interface AuthContextValue {
  session: Session;
  isLoading: boolean;
  signIn: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
  setDevUser: (userId: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { authService } = useServices();
  const [session, setSession] = useState<Session>({ state: 'unauthenticated' });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    authService.getCurrentSession().then((initialSession) => {
      if (isMounted) {
        setSession(initialSession);
        setIsLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [authService]);

  const signIn = async (userId: string) => {
    setIsLoading(true);
    const newSession = await authService.signIn(userId);
    setSession(newSession);
    setIsLoading(false);
  };

  const signOut = async () => {
    setIsLoading(true);
    await authService.signOut();
    setSession({ state: 'unauthenticated' });
    setIsLoading(false);
  };

  const setDevUser = async (userId: string | null) => {
    setIsLoading(true);
    // Explicitly cast to the mock service to access dev tools
    const mockService = authService as MockAuthService;
    const newSession = await mockService.setMockUserForDevelopment(userId);
    setSession(newSession);
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider value={{ session, isLoading, signIn, signOut, setDevUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
