import { Link } from 'react-router-dom';
import { Users, Activity, CheckCircle2, Circle, Radio, HelpCircle, Shield, Zap, Loader2 } from 'lucide-react';
import { CommunityDetailReadModel } from '../../../core/readmodels/CommunityDetailReadModel';
import { cn } from '../../../lib/utils';
import { formatPricing } from '../../utils/formatPricing';
import { useAuth } from '../../context/AuthContext';
import { useServices } from '../../context/ServiceContext';
import { useState } from 'react';

interface Props {
  community: CommunityDetailReadModel;
  onJoinSuccess?: () => void;
}

export function CommunityDetailVisitor({ community, onJoinSuccess }: Props) {
  const { session } = useAuth();
  const { membershipService, paymentService } = useServices();
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (planId?: string, isPaid: boolean = false, amount: number = 0, currency: string = 'USD') => {
    if (session.state !== 'authenticated' || !session.user) {
      setError('Please sign in to join this community.');
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      if (isPaid) {
        const paymentResult = await paymentService.processMockPayment(session.user.id, planId || 'paid', amount, currency);
        if (!paymentResult.success) {
          throw new Error(paymentResult.error || 'Payment failed.');
        }
      }

      await membershipService.joinCommunity(session.user.id, community.id, planId);
      if (onJoinSuccess) {
        onJoinSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while joining.');
      setIsJoining(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
      {/* Left Column - Main Content */}
      <div className="lg:col-span-8 flex flex-col gap-12">
        {/* SECTION 1 - IDENTITY */}
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm font-semibold">
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">{community.categoryName}</span>
            <span className="text-neutral-400">&bull;</span>
            <span className="text-neutral-500">{community.skillLevel}</span>
          </div>
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-neutral-900 sm:text-5xl">
            {community.name}
          </h1>
          <p className="text-xl leading-relaxed text-neutral-600">
            {community.description}
          </p>
        </section>

        {/* SECTION 2 - HAPPENING NOW */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600">
            <Activity className="h-4 w-4" />
            Happening Now
          </h2>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium text-neutral-500">Currently Learning</p>
              <p className="text-lg font-bold text-neutral-900">{community.currentTopic || 'General Topics'}</p>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-neutral-500">Active Members</p>
              <p className="text-lg font-bold text-neutral-900">{community.activeToday.toLocaleString()} learning today</p>
            </div>
          </div>
        </section>

        {/* SECTION 3 - LEARNING JOURNEY */}
        <section>
          <h2 className="mb-8 text-2xl font-bold tracking-tight text-neutral-900">The Learning Journey</h2>
          <div className="relative border-l-2 border-neutral-100 pl-8 ml-3">
            {community.roadmap.map((item) => {
              const isCompleted = item.status === 'completed';
              const isCurrent = item.status === 'current';
              const isUpcoming = item.status === 'upcoming';
              
              return (
                <div key={item.id} className={cn("relative mb-10 last:mb-0", isUpcoming && "opacity-60")}>
                  {/* Timeline Marker */}
                  <div className="absolute -left-[41px] flex h-5 w-5 items-center justify-center bg-white">
                    {isCompleted && <CheckCircle2 className="h-5 w-5 text-neutral-300" />}
                    {isCurrent && <Radio className="h-5 w-5 text-emerald-500 animate-pulse" />}
                    {isUpcoming && <Circle className="h-4 w-4 text-neutral-200" />}
                  </div>
                  
                  <div className={cn("flex flex-col gap-1 rounded-xl p-5 transition-colors", isCurrent ? "bg-emerald-50/50 border border-emerald-100" : "bg-white")}>
                    {isCurrent && (
                      <span className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-600">
                        Current Focus
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-neutral-900">{item.title}</h3>
                    <p className="text-base text-neutral-600">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 4 - THE PEOPLE */}
        <section className="border-t border-neutral-100 pt-12">
          <h2 className="mb-8 text-2xl font-bold tracking-tight text-neutral-900">Who You Are Joining</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-white p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                <Users className="h-6 w-6 text-neutral-600" />
              </div>
              <h3 className="text-3xl font-bold text-neutral-900">{community.memberCount.toLocaleString()}</h3>
              <p className="mt-1 text-sm font-medium text-neutral-500">Total Learners</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-900 p-6 text-white">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800">
                <span className="text-xl font-bold">{community.creatorName.charAt(0)}</span>
              </div>
              <h3 className="text-xl font-bold">{community.creatorName}</h3>
              <p className="mt-1 text-sm font-medium text-neutral-400">{community.creatorRole}</p>
            </div>
          </div>
        </section>
      </div>

      {/* Right Column - Sticky Join / Membership Card */}
      <div className="lg:col-span-4">
        <div className="sticky top-8 flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl shadow-neutral-200/50 sm:p-8">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">Join the Community</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Get immediate access to the roadmap, discussions, and {community.memberCount.toLocaleString()} peers.
            </p>
          </div>

          <ul className="flex flex-col gap-3 py-4 border-y border-neutral-100">
            <li className="flex items-start gap-3 text-sm text-neutral-700">
              <Shield className="h-5 w-5 shrink-0 text-neutral-400" />
              <span>Structured learning roadmap</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-neutral-700">
              <Users className="h-5 w-5 shrink-0 text-neutral-400" />
              <span>Active peer discussions</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-neutral-700">
              <Zap className="h-5 w-5 shrink-0 text-neutral-400" />
              <span>AI Catch Me Up <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">Coming soon</span></span>
            </li>
          </ul>

          <div className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100">
                {error}
              </div>
            )}
            
            {community.hasFreeEntry ? (
              <button 
                onClick={() => handleJoin('free')}
                disabled={isJoining}
                className="flex h-14 w-full items-center justify-center rounded-xl bg-neutral-900 text-base font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
              >
                {isJoining ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Join for Free'}
              </button>
            ) : community.primaryPricing ? (
              <button 
                onClick={() => handleJoin('primary', true, community.primaryPricing?.amount || 0, community.primaryPricing?.currency || 'USD')}
                disabled={isJoining}
                className="flex h-14 w-full items-center justify-center rounded-xl bg-neutral-900 text-base font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
              >
                {isJoining ? <Loader2 className="h-5 w-5 animate-spin" /> : `Join for ${formatPricing(community.primaryPricing)}`}
              </button>
            ) : (
              <button disabled className="flex h-14 w-full items-center justify-center rounded-xl bg-neutral-200 text-base font-bold text-neutral-500 cursor-not-allowed">
                Currently Unavailable
              </button>
            )}
          </div>

          {/* Other Pricing Options */}
          {community.alternativePricing.length > 0 && (
            <div className="mt-2 text-center text-xs text-neutral-500">
              Also available: {community.alternativePricing.map(p => formatPricing(p)).join(', ')}
            </div>
          )}
          
          {community.hasFreeEntry && community.alternativePricing.some(p => p.type === 'paid') && (
            <div className="mt-2 text-center text-xs text-neutral-500">
              Paid upgrades available inside
            </div>
          )}

          {/* Platform Trust */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-400">
            <HelpCircle className="h-4 w-4" />
            <span>Cancel anytime. Secure checkout.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
