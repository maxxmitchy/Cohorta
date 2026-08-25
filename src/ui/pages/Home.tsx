import { useEffect, useState } from 'react';
import { Flame, TrendingUp, Sparkles, Clock, Loader2, AlertCircle } from 'lucide-react';
import { SortCriteria } from '../../core/services/RankingService';
import { CommunityDiscoveryReadModel } from '../../core/readmodels/CommunityDiscoveryReadModel';
import CommunityCard from '../components/discovery/CommunityCard';
import { cn } from '../../lib/utils';
import { useServices } from '../context/ServiceContext';

export default function Home() {
  const [communities, setCommunities] = useState<CommunityDiscoveryReadModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SortCriteria>('trending');

  const { discoveryService } = useServices();

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const feed = await discoveryService.getDiscoveryFeed(activeTab);
        if (isMounted) setCommunities(feed);
      } catch (err) {
        if (isMounted) setError("Failed to load communities. Please try again later.");
        console.error("Discovery Feed Error:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [activeTab, discoveryService]);

  const tabs = [
    { id: 'trending', label: 'Trending', icon: Flame },
    { id: 'active', label: 'Most Active', icon: Sparkles },
    { id: 'growing', label: 'Fastest Growing', icon: TrendingUp },
    { id: 'new', label: 'Newest', icon: Clock },
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h1 className="text-5xl font-extrabold tracking-tight text-neutral-900 sm:text-6xl mb-6">
          Find your people.<br/>Learn your thing.
        </h1>
        <p className="text-xl text-neutral-600">
          Discover active, expert-led communities where people are actually learning and building together. Stop watching courses alone.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {/* Sorting / Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SortCriteria)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  isActive 
                    ? "bg-neutral-900 text-white" 
                    : "bg-white text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 shadow-sm border border-neutral-200"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-white" : "text-neutral-400")} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* State Handling (Loading, Error, Empty, Success) */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-red-200 bg-red-50 text-red-500">
            <AlertCircle className="h-8 w-8" />
            <p className="font-medium">{error}</p>
          </div>
        ) : communities.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50 text-neutral-500">
            <p>No communities found.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {communities.map(community => (
              <CommunityCard 
                key={community.id} 
                community={community} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
