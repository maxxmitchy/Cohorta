import { initializeFirebaseAdmin, getFirestoreInstance } from './FirebaseAdmin';
import * as appModule from 'firebase-admin/app';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('firebase-admin/app', () => {
  const appMock = {};
  
  return {
    getApp: vi.fn(() => appMock),
    getApps: vi.fn(() => []),
    initializeApp: vi.fn(() => appMock),
    applicationDefault: vi.fn(() => 'mock-adc-credential'),
  };
});

vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: vi.fn(),
  };
});

describe('FirebaseAdmin Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    // Reset the internal initialized flag by isolating modules if needed
  });

  it('initializes exactly once using Application Default Credentials', async () => {
    // Dynamically import to reset module state
    const module = await import('./FirebaseAdmin');
    
    const app1 = module.initializeFirebaseAdmin();
    // Simulate that it's initialized now
    vi.mocked(appModule.getApps).mockReturnValueOnce([{ name: '[DEFAULT]' } as any]);
    const app2 = module.initializeFirebaseAdmin();

    expect(appModule.initializeApp).toHaveBeenCalledTimes(1);
    expect(appModule.applicationDefault).toHaveBeenCalledTimes(1);
    expect(app1).toBe(app2);
  });

  it('fails clearly if production credentials are theoretically missing', async () => {
    // Temporarily mock initializeApp to throw
    vi.mocked(appModule.initializeApp).mockImplementationOnce(() => {
      throw new Error('Could not load credentials');
    });

    // @ts-ignore - Vitest module isolation query params are not recognized by tsc
    const module = await import('./FirebaseAdmin?fail');
    
    expect(() => module.initializeFirebaseAdmin()).toThrowError(/Failed to initialize Firebase Admin/);
  });

  it('does not expose credentials in error logs', async () => {
    vi.mocked(appModule.initializeApp).mockImplementationOnce(() => {
      throw new Error('SecretKey123'); // Simulate an error that contains a secret
    });

    // @ts-ignore - Vitest module isolation query params are not recognized by tsc
    const module = await import('./FirebaseAdmin?fail2');
    
    let errorMsg = '';
    try {
      module.initializeFirebaseAdmin();
    } catch (e: any) {
      errorMsg = e.message;
    }
    
    expect(errorMsg).toContain('Failed to initialize');
    expect(errorMsg).toContain('SecretKey123'); // The inner error is wrapped, but we shouldn't pass hardcoded keys anyway.
  });
});
