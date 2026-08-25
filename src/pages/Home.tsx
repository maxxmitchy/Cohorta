import { useEffect, useState } from 'react';
import { Flame, TrendingUp, Sparkles, Clock, Loader2 } from 'lucide-react';
import { api } from '../lib/db/api';
import { Category, Community } from '../lib/db/schema';
import CommunityCard from '../components/discovery/CommunityCard';
import { cn } from '../lib/utils';

type SortTab = 'trending' | 'active' | 'new' | 'growing';

export default function Home() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SortTab>('trending');

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [fetchedCategories, fetchedCommunities] = await Promise.all([
          api.getCategories(),
          activeTab === 'trending' ? api.getTrendingCommunities() : api.getCommunities()
        ]);
        setCategories(fetchedCategories);
        
        // Simple mock sorting based on activeTab
        let sorted = [...fetchedCommunities];
        if (activeTab === 'active') sorted = sorted.sort((a, b) => b.activeToday - a.activeToday);
        if (activeTab === 'growing') sorted = sorted.sort((a, b) => b.weeklyGrowthPercentage - a.weeklyGrowthPercentage);
        if (activeTab === 'new') sorted = sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        setCommunities(sorted);
      } catch (error) {
        console.error("Failed to fetch discovery data", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [activeTab]);

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
                onClick={() => setActiveTab(tab.id as SortTab)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  isActive 
                    ? "bg-neutral-900 text-white" 
                    : "bg-white text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-white" : "text-neutral-400")} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Discovery Feed Grid */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {communities.map(community => (
              <CommunityCard 
                key={community.id} 
                community={community} 
                category={categories.find(c => c.id === community.categoryId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
