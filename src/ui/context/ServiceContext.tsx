import { createContext, useContext, ReactNode } from 'react';
import { DiscoveryService } from '../../core/services/DiscoveryService';
import { RankingService } from '../../core/services/RankingService';
import { CommunityDetailService } from '../../core/services/CommunityDetailService';
import { MockDiscoveryQueryRepository } from '../../infrastructure/db/mock/MockDiscoveryQueryRepository';
import { MockCommunityDetailQueryRepository } from '../../infrastructure/db/mock/MockCommunityDetailQueryRepository';

/**
 * ServiceRegistry acts as our temporary Composition Root.
 * 
 * IMPORTANT ARCHITECTURAL RULE:
 * UI components must NEVER instantiate repositories, database clients, payment clients,
 * Telegram clients, or AI clients.
 * 
 * Note: In a production environment, infrastructure composition should occur
 * strictly outside the UI layer (e.g. at the server entry point or via a robust DI container),
 * not at module scope inside a React context file.
 */
export interface ServiceRegistry {
  discoveryService: DiscoveryService;
  communityDetailService: CommunityDetailService;
}

// Temporary manual DI wiring. 
// When moving to production, replace Mock repositories with Postgres/Firebase repositories here.
const rankingService = new RankingService();
const discoveryQueryRepo = new MockDiscoveryQueryRepository();
const discoveryService = new DiscoveryService(discoveryQueryRepo, rankingService);

const detailQueryRepo = new MockCommunityDetailQueryRepository();
const communityDetailService = new CommunityDetailService(detailQueryRepo);

const defaultRegistry: ServiceRegistry = {
  discoveryService,
  communityDetailService,
};


const ServiceContext = createContext<ServiceRegistry | null>(null);

export function ServiceProvider({ children, registry = defaultRegistry }: { children: ReactNode, registry?: ServiceRegistry }) {
  return (
    <ServiceContext.Provider value={registry}>
      {children}
    </ServiceContext.Provider>
  );
}

export function useServices(): ServiceRegistry {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error('useServices must be used within a ServiceProvider');
  }
  return context;
}
