import { Users, Flame, TrendingUp, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CommunityDiscoveryDTO } from '../../../core/dto/CommunityDiscoveryDTO';

interface CommunityCardProps {
  community: CommunityDiscoveryDTO;
}

export default function CommunityCard({ community }: CommunityCardProps) {
  return (
    <Link 
      to={`/c/${community.id}`}
      className="group block rounded-2xl border border-neutral-200 bg-white p-6 transition-all hover:border-neutral-900 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-neutral-900">{community.name}</h3>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            {community.categoryName} &bull; {community.skillLevel}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-900">
          <Star className="h-3.5 w-3.5 fill-current" />
          <span>{community.rating}</span>
        </div>
      </div>

      <p className="mb-6 line-clamp-2 text-sm leading-relaxed text-neutral-600">
        {community.description}
      </p>

      <div className="mb-6 grid grid-cols-3 gap-4 border-y border-neutral-100 py-4">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
            <Users className="h-3.5 w-3.5" />
            Learners
          </span>
          <span className="text-base font-semibold text-neutral-900">
            {community.memberCount.toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-orange-600">
            <Flame className="h-3.5 w-3.5" />
            Active
          </span>
          <span className="text-base font-semibold text-neutral-900">
            {community.activeToday.toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <TrendingUp className="h-3.5 w-3.5" />
            Growth
          </span>
          <span className="text-base font-semibold text-neutral-900">
            +{community.weeklyGrowthPercentage}%
          </span>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div className="flex-1 pr-4">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-neutral-400">
            Current Topic
          </span>
          <span className="block truncate text-sm font-semibold text-neutral-900">
            {community.currentTopic}
          </span>
        </div>
        <div className="flex h-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 px-5 text-sm font-medium text-white transition-transform group-hover:scale-105">
          {community.lowestPriceMonthly === 0 ? 'Free' : `$${community.lowestPriceMonthly}/mo`}
        </div>
      </div>
    </Link>
  );
}
