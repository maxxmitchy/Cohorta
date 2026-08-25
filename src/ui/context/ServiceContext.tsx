import { createContext, useContext, ReactNode } from 'react';
import { DiscoveryService } from '../../core/services/DiscoveryService';
import { RankingService } from '../../core/services/RankingService';
import { MockDiscoveryQueryRepository } from '../../infrastructure/db/mock/MockDiscoveryQueryRepository';

/**
 * ServiceRegistry acts as our Composition Root.
 * It instantiates and wires together the infrastructure and service layers.
 */
export interface ServiceRegistry {
  discoveryService: DiscoveryService;
}

// Temporary manual DI wiring. 
// When moving to production, replace Mock repositories with Postgres/Firebase repositories here.
const rankingService = new RankingService();
const discoveryQueryRepo = new MockDiscoveryQueryRepository();
const discoveryService = new DiscoveryService(discoveryQueryRepo, rankingService);

const defaultRegistry: ServiceRegistry = {
  discoveryService,
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
