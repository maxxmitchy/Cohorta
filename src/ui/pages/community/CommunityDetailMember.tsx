import { Activity, CheckCircle2, Circle, Lock, PlayCircle, Sparkles, Clock, ArrowRight, BookOpen, MessageSquare } from 'lucide-react';
import { MemberCommunityReadModel } from '../../../core/readmodels/MemberCommunityReadModel';
import { cn } from '../../../lib/utils';
import { useNavigate, Link } from 'react-router-dom';

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
    <div className="flex flex-col gap-10">
      {/* Member Header */}
      <section className="flex flex-col items-start gap-4 border-b border-neutral-100 pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700">
              {community.categoryName}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">
              Active Member
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
            {community.name}
          </h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/c/${community.communityId}/history`}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-xs font-bold text-neutral-700 shadow-xs hover:bg-neutral-50 transition-colors"
          >
            <Clock className="h-4 w-4 text-neutral-500" />
            Timeline & Archive
          </Link>

          {community.nextAction && (
            <button 
              onClick={handleContinueLearning}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-neutral-900 px-6 py-3.5 text-xs font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-sm"
            >
              <PlayCircle className="h-4 w-4" />
              Continue Learning
            </button>
          )}
        </div>
      </section>

      {/* Prominent Catch Me Up Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-blue-50/40 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              Catch Me Up
            </div>
            <h2 className="text-xl font-bold text-neutral-900 sm:text-2xl">
              Understand what happened before you joined
            </h2>
            <p className="text-xs text-neutral-600 leading-relaxed sm:text-sm">
              Get an instant synthesis of earlier cohort milestones, key takeaways, and resolved community discussions so you can jump straight into the current topic.
            </p>
          </div>

          <Link
            to={`/c/${community.communityId}/catch-up`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 py-4 text-xs font-bold text-white shadow-md hover:bg-neutral-800 transition-all active:scale-[0.98]"
          >
            Open Catch Up Briefing
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* Left Column - Progress & Roadmap */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          
          <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-neutral-900">Your Learning Progress</h2>
                <p className="text-xs text-neutral-500">Tracked independently from the group pace</p>
              </div>
              <span className="text-xs font-bold text-neutral-500">
                {community.completedItems} of {community.totalItems} done
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="mb-8">
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div 
                  className="h-full bg-neutral-900 transition-all duration-1000 ease-out"
                  style={{ width: `${(community.completedItems / Math.max(1, community.totalItems)) * 100}%` }}
                />
              </div>
            </div>

            {/* Personalized Roadmap */}
            <div className="relative border-l-2 border-neutral-100 pl-8 ml-3 space-y-6">
              {community.roadmap.map((item) => {
                const isUserCompleted = item.userProgressStatus === 'completed';
                const isUserCurrent = item.userProgressStatus === 'current';
                const isUserLocked = item.userProgressStatus === 'locked';
                
                return (
                  <div key={item.id} className={cn("relative", isUserLocked && "opacity-60")}>
                    {/* Timeline Marker */}
                    <div className="absolute -left-[41px] flex h-5 w-5 items-center justify-center bg-white">
                      {isUserCompleted && <CheckCircle2 className="h-5 w-5 text-neutral-900" />}
                      {isUserCurrent && <PlayCircle className="h-5 w-5 text-emerald-500 animate-pulse" />}
                      {isUserLocked && <Lock className="h-4 w-4 text-neutral-300" />}
                    </div>
                    
                    <div className={cn(
                      "flex flex-col gap-1 rounded-2xl p-4 transition-all border", 
                      isUserCurrent 
                        ? "bg-emerald-50/50 border-emerald-200" 
                        : "bg-white border-neutral-100 hover:border-neutral-200"
                    )}>
                      {isUserCurrent && (
                        <span className="mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                          Current Personal Milestone
                        </span>
                      )}
                      <div className="flex items-center justify-between">
                        <h3 className={cn("text-sm font-bold", isUserLocked ? "text-neutral-500" : "text-neutral-900")}>
                          {item.title}
                        </h3>
                        {isUserCurrent && (
                          <button
                            onClick={() => navigate(`/c/${community.communityId}/learn/${item.id}`)}
                            className="text-xs font-bold text-emerald-700 hover:underline"
                          >
                            Open →
                          </button>
                        )}
                      </div>
                      {(!isUserLocked || isUserCurrent) && (
                        <p className="mt-1 text-xs text-neutral-600 leading-relaxed">{item.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>

        {/* Right Column - Community Pulse & Current Focus */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          <section className="rounded-3xl border border-neutral-200 bg-neutral-900 p-6 text-white shadow-xl shadow-neutral-900/10 sm:p-7">
            <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-400">
              <Activity className="h-4 w-4" />
              Community Currently Learning
            </h2>
            <p className="mb-1 text-xs font-medium text-neutral-400">Active Group Milestone</p>
            <p className="mb-6 text-lg font-extrabold text-white">{community.currentTopic || 'General Topics'}</p>
            
            <p className="mb-1 text-xs font-medium text-neutral-400">Active Members</p>
            <p className="text-base font-bold text-white mb-6">{community.activeToday.toLocaleString()} builders today</p>

            <Link
              to={`/c/${community.communityId}/history`}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 px-4 py-3 text-xs font-bold text-white transition-colors"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Browse Learning Archive
            </Link>
          </section>

          {/* Quick Context Card */}
          <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs">
            <h3 className="text-sm font-bold text-neutral-900 mb-2">Cohort Timeline</h3>
            <p className="text-xs text-neutral-600 leading-relaxed mb-4">
              Review what the group discussed before you joined, read consensus takeaways, and see shared resources.
            </p>
            <Link
              to={`/c/${community.communityId}/catch-up`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-900 hover:text-emerald-600 transition-colors"
            >
              Review What You Missed <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </section>

        </div>
      </div>
    </div>
  );
}

