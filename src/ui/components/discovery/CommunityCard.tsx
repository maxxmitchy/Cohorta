import { Users, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CommunityDiscoveryReadModel } from '../../../core/readmodels/CommunityDiscoveryReadModel';
import { formatPricing } from '../../utils/formatPricing';

interface CommunityCardProps {
  community: CommunityDiscoveryReadModel;
}

export default function CommunityCard({ community }: CommunityCardProps) {
  return (
    <Link 
      to={`/c/${community.id}`}
      className="group block rounded-2xl border border-neutral-200/60 bg-white p-6 transition-all hover:border-neutral-900/10 hover:shadow-xl hover:shadow-neutral-200/50"
    >
      {/* Top Meta: Category & People */}
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600 transition-colors group-hover:bg-neutral-900 group-hover:text-white">
          {community.categoryName}
        </span>
        <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-500">
          <Users className="h-4 w-4" />
          <span>{community.memberCount.toLocaleString()} learning</span>
        </div>
      </div>

      {/* Identity */}
      <h3 className="mb-2 text-2xl font-bold tracking-tight text-neutral-900 group-hover:text-black">
        {community.name}
      </h3>
      <p className="mb-8 line-clamp-2 text-sm leading-relaxed text-neutral-600">
        {community.description}
      </p>

      {/* Happening Now Section */}
      <div className="rounded-xl bg-neutral-50 p-4 transition-colors group-hover:bg-neutral-100">
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            Currently Learning
          </span>
          <span className="text-xs font-semibold text-emerald-600">
            {community.activeToday.toLocaleString()} active now
          </span>
        </div>
        <span className="block truncate text-base font-semibold text-neutral-900">
          {community.currentTopic || 'General Discussion'}
        </span>
      </div>

      {/* Bottom Row */}
      <div className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4">
        <span className="text-sm font-medium text-neutral-500">
          {community.skillLevel}
        </span>
        <span className="text-sm font-bold text-neutral-900">
          {formatPricing(community.pricing)}
        </span>
      </div>
    </Link>
  );
}
