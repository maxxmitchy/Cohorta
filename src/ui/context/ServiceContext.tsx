import { createContext, useContext, ReactNode } from 'react';
import { DiscoveryService } from '../../core/services/DiscoveryService';
import { RankingService } from '../../core/services/RankingService';
import { CommunityDetailService } from '../../core/services/CommunityDetailService';
import { MockAuthService } from '../../infrastructure/db/mock/MockAuthService';
import { MembershipService } from '../../core/services/MembershipService';
import { IPaymentService } from '../../core/services/IPaymentService';
import { MockPaymentService } from '../../infrastructure/db/mock/MockPaymentService';
import { MockDiscoveryQueryRepository } from '../../infrastructure/db/mock/MockDiscoveryQueryRepository';
import { MockCommunityDetailQueryRepository } from '../../infrastructure/db/mock/MockCommunityDetailQueryRepository';
import { MockMembershipRepository } from '../../infrastructure/db/mock/MockMembershipRepository';
import { MockCommunityHistoryQueryRepository } from '../../infrastructure/db/mock/MockCommunityHistoryQueryRepository';
import { MockCatchUpGenerator } from '../../infrastructure/ai/MockCatchUpGenerator';
import { ICommunityHistoryService } from '../../core/services/ICommunityHistoryService';
import { CommunityHistoryService } from '../../core/services/CommunityHistoryService';
import { ICatchUpService } from '../../core/services/ICatchUpService';
import { CatchUpService } from '../../core/services/CatchUpService';

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
  authService: MockAuthService;
  membershipService: MembershipService;
  paymentService: IPaymentService;
  communityHistoryService: ICommunityHistoryService;
  catchUpService: ICatchUpService;
}

// Temporary manual DI wiring. 
// When moving to production, replace Mock repositories with Postgres/Firebase repositories here.
const rankingService = new RankingService();
const discoveryQueryRepo = new MockDiscoveryQueryRepository();
const discoveryService = new DiscoveryService(discoveryQueryRepo, rankingService);

const detailQueryRepo = new MockCommunityDetailQueryRepository();
const communityDetailService = new CommunityDetailService(detailQueryRepo);

const mockAuthService = new MockAuthService();
const mockMembershipRepo = new MockMembershipRepository();
const mockPaymentService = new MockPaymentService();
const membershipService = new MembershipService(mockMembershipRepo, mockMembershipRepo, mockPaymentService);

const historyQueryRepo = new MockCommunityHistoryQueryRepository();
const catchUpGenerator = new MockCatchUpGenerator();
const communityHistoryService = new CommunityHistoryService(historyQueryRepo, mockMembershipRepo);
const catchUpService = new CatchUpService(historyQueryRepo, mockMembershipRepo, catchUpGenerator);

const defaultRegistry: ServiceRegistry = {
  discoveryService,
  communityDetailService,
  authService: mockAuthService,
  membershipService,
  paymentService: mockPaymentService,
  communityHistoryService,
  catchUpService,
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
