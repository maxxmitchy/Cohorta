import { Activity, CheckCircle2, Circle, Lock, PlayCircle, Sparkles } from 'lucide-react';
import { MemberCommunityReadModel } from '../../../core/readmodels/MemberCommunityReadModel';
import { cn } from '../../../lib/utils';
import { useNavigate } from 'react-router-dom';

interface Props {
  community: MemberCommunityReadModel;
}

export function CommunityDetailMember({ community }: Props) {
  const navigate = useNavigate();

  const handleContinueLearning = () => {
    if (community.nextAction) {
      navigate(`/c/${community.communityId}/learn/${community.nextAction.roadmapItemId}`);
    }
  };

  return (
    <div className="flex flex-col gap-12">
      {/* Member Header */}
      <section className="flex flex-col items-start gap-4 border-b border-neutral-100 pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700">
              {community.categoryName}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">
              You're in
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
            {community.name}
          </h1>
        </div>
        
        {community.nextAction && (
          <button 
            onClick={handleContinueLearning}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-neutral-900 px-6 py-4 text-sm font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <PlayCircle className="h-5 w-5" />
            Continue Learning
          </button>
        )}
      </section>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
        {/* Left Column - Progress & Roadmap */}
        <div className="lg:col-span-8 flex flex-col gap-12">
          
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="mb-6 text-xl font-bold tracking-tight text-neutral-900">Your Progress</h2>
            
            {/* Progress Bar */}
            <div className="mb-8">
              <div className="mb-2 flex items-center justify-between text-sm font-medium">
                <span className="text-neutral-500">
                  {community.completedItems} of {community.totalItems} completed
                </span>
                <span className="text-neutral-900">
                  {Math.round((community.completedItems / Math.max(1, community.totalItems)) * 100)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div 
                  className="h-full bg-neutral-900 transition-all duration-1000 ease-out"
                  style={{ width: `${(community.completedItems / Math.max(1, community.totalItems)) * 100}%` }}
                />
              </div>
            </div>

            {/* Personalized Roadmap */}
            <div className="relative border-l-2 border-neutral-100 pl-8 ml-3">
              {community.roadmap.map((item) => {
                const isUserCompleted = item.userProgressStatus === 'completed';
                const isUserCurrent = item.userProgressStatus === 'current';
                const isUserLocked = item.userProgressStatus === 'locked';
                
                return (
                  <div key={item.id} className={cn("relative mb-8 last:mb-0", isUserLocked && "opacity-50")}>
                    {/* Timeline Marker */}
                    <div className="absolute -left-[41px] flex h-5 w-5 items-center justify-center bg-white">
                      {isUserCompleted && <CheckCircle2 className="h-5 w-5 text-neutral-900" />}
                      {isUserCurrent && <PlayCircle className="h-5 w-5 text-emerald-500 animate-pulse" />}
                      {isUserLocked && <Lock className="h-4 w-4 text-neutral-300" />}
                    </div>
                    
                    <div className={cn("flex flex-col gap-1 rounded-xl p-4 transition-colors", isUserCurrent ? "bg-emerald-50/50 border border-emerald-100" : "")}>
                      {isUserCurrent && (
                        <span className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-600">
                          Current Focus
                        </span>
                      )}
                      <h3 className={cn("text-base font-bold", isUserLocked ? "text-neutral-500" : "text-neutral-900")}>
                        {item.title}
                      </h3>
                      {(!isUserLocked || isUserCurrent) && (
                        <p className="mt-1 text-sm text-neutral-600">{item.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>

        {/* Right Column - Community Pulse & Catch Up */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          
          <section className="rounded-2xl border border-neutral-200 bg-neutral-900 p-6 text-white shadow-xl shadow-neutral-900/10 sm:p-8">
            <h2 className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-400">
              <Activity className="h-4 w-4" />
              Community Now
            </h2>
            <p className="mb-1 text-sm font-medium text-neutral-400">Currently Learning</p>
            <p className="mb-6 text-lg font-bold">{community.currentTopic || 'General Topics'}</p>
            
            <p className="mb-1 text-sm font-medium text-neutral-400">Active Members</p>
            <p className="text-lg font-bold">{community.activeToday.toLocaleString()} learning today</p>
          </section>

          <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 sm:p-8">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="mb-2 text-lg font-bold text-neutral-900">Catch Me Up</h2>
            <p className="mb-6 text-sm leading-relaxed text-neutral-600">
              You joined this community after several learning stages. Eventually, Cohorta will summarize the important discussions, resources, and milestones you missed.
            </p>
            <div className="inline-flex items-center justify-center rounded-lg bg-blue-100/50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-blue-700 backdrop-blur-sm">
              Coming Soon
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
