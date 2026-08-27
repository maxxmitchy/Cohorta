import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Sparkles, 
  CheckCircle2, 
  Compass, 
  PlayCircle, 
  MessageSquare, 
  ExternalLink, 
  BookOpen, 
  Layers, 
  Calendar, 
  ArrowRight,
  ShieldAlert,
  Flame
} from 'lucide-react';
import { useServices } from '../../context/ServiceContext';
import { useAuth } from '../../context/AuthContext';
import { CatchUpReadModel, MissedTopicInsight } from '../../../core/readmodels/CatchUpReadModel';
import { Discussion } from '../../../core/domain/discussion';
import { DiscussionModal } from './DiscussionModal';

export function CommunityCatchUpView() {
  const { communityId } = useParams();
  const navigate = useNavigate();
  const { catchUpService } = useServices();
  const { session } = useAuth();

  const [catchUpData, setCatchUpData] = useState<CatchUpReadModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDiscussion, setSelectedDiscussion] = useState<Discussion | null>(null);

  const fetchCatchUp = useCallback(async () => {
    if (!communityId) return;
    if (session.state !== 'authenticated' || !session.user) {
      setErrorMessage('Please sign in to view the member catch-up briefing.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await catchUpService.getCatchUp(session.user.id, communityId);
      setCatchUpData(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to generate Catch Up briefing.');
    } finally {
      setIsLoading(false);
    }
  }, [communityId, catchUpService, session]);

  useEffect(() => {
    fetchCatchUp();
  }, [fetchCatchUp]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
          <p className="text-sm font-medium text-neutral-500">Synthesizing community history & missed context...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !catchUpData) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-600" />
          <h2 className="text-xl font-bold text-neutral-900">Access Restricted</h2>
          <p className="mt-2 text-sm text-neutral-600">
            {errorMessage || 'You must be an active member of this community to access the Catch Up experience.'}
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link
              to={`/c/${communityId}`}
              className="rounded-xl bg-neutral-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-neutral-800 transition-colors"
            >
              View Community Page
            </Link>
            <Link
              to="/"
              className="rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Back to Discovery
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Breadcrumb Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          to={`/c/${communityId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {catchUpData.communityName}
        </Link>

        <div className="flex items-center gap-2">
          <Link
            to={`/c/${communityId}/history`}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Full Timeline & Archive
          </Link>
        </div>
      </div>

      {/* Hero Briefing Card */}
      <header className="relative mb-10 overflow-hidden rounded-3xl border border-neutral-200 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 p-8 text-white shadow-xl sm:p-10">
        <div className="relative z-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" />
            Catch Me Up Briefing
          </div>

          <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {catchUpData.summaryHeadline}
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-neutral-300">
            {catchUpData.summaryNarrative}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-neutral-400">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-neutral-400" />
              Joined on {new Date(catchUpData.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-neutral-400" />
              {catchUpData.hasMissedContent ? `${catchUpData.missedTopicsCount} previous milestones summarized` : 'In sync with cohort start'}
            </div>
          </div>
        </div>
      </header>

      {/* 3-Part Architecture: WHAT HAPPENED -> WHERE WE ARE NOW -> WHAT TO DO NEXT */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        
        {/* Left Column: WHAT YOU MISSED (Historical context) */}
        <div className="lg:col-span-8 space-y-10">
          
          <section>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
                  {catchUpData.hasMissedContent ? 'What You Missed' : 'Community Foundations'}
                </h2>
                <p className="text-xs text-neutral-500">
                  {catchUpData.hasMissedContent 
                    ? 'Synthesized key ideas and discussions covered before you joined' 
                    : 'The core topics that set up our current focus'}
                </p>
              </div>
            </div>

            {catchUpData.hasMissedContent ? (
              <div className="space-y-6">
                {catchUpData.missedTopics.map((topic: MissedTopicInsight) => (
                  <div 
                    key={topic.roadmapItemId}
                    className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs hover:border-neutral-300 transition-all sm:p-7"
                  >
                    {/* Topic Header */}
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 text-xs font-bold text-neutral-800">
                          {topic.orderIndex}
                        </span>
                        <div>
                          <h3 className="text-lg font-bold text-neutral-900">{topic.title}</h3>
                          {topic.completedAt && (
                            <span className="text-[11px] text-neutral-400">
                              Completed {new Date(topic.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        ✓ Completed
                      </span>
                    </div>

                    {/* Key Idea (The differentiator takeaway) */}
                    <div className="mb-4 rounded-xl border border-neutral-100 bg-neutral-50/80 p-4">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                        Key Takeaway
                      </div>
                      <p className="text-sm font-medium text-neutral-900 leading-relaxed">
                        "{topic.keyIdea}"
                      </p>
                    </div>

                    <p className="mb-5 text-sm text-neutral-600 leading-relaxed">
                      {topic.summary}
                    </p>

                    {/* Notable Discussions within this topic */}
                    {topic.notableDiscussions.length > 0 && (
                      <div className="space-y-2 border-t border-neutral-100 pt-4">
                        <div className="flex items-center justify-between text-xs font-semibold text-neutral-500">
                          <span>Notable Community Discussions ({topic.discussionCount})</span>
                          <span className="text-[11px] text-neutral-400">Click to read resolution</span>
                        </div>
                        <div className="space-y-2">
                          {topic.notableDiscussions.map((disc: Discussion) => (
                            <button
                              key={disc.id}
                              onClick={() => setSelectedDiscussion(disc)}
                              className="w-full text-left flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-3 hover:border-neutral-300 hover:bg-neutral-50/70 transition-colors group"
                            >
                              <div className="flex items-center gap-2.5">
                                <MessageSquare className="h-4 w-4 text-neutral-400 group-hover:text-neutral-900 transition-colors" />
                                <span className="text-xs font-semibold text-neutral-800 line-clamp-1 group-hover:text-neutral-900">
                                  {disc.title}
                                </span>
                              </div>
                              <span className="shrink-0 text-[11px] font-medium text-neutral-400 group-hover:text-neutral-700">
                                {disc.replyCount} {disc.replyCount === 1 ? 'reply' : 'replies'} →
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommended Resources */}
                    {topic.topResources.length > 0 && (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold text-neutral-400 uppercase">Top Resources:</span>
                        {topic.topResources.map(res => (
                          <a
                            key={res.id}
                            href={res.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {res.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
                <h3 className="text-lg font-bold text-neutral-900">You haven't missed any past topics</h3>
                <p className="mt-2 text-sm text-neutral-600 max-w-md mx-auto">
                  You joined when this community kicked off. You have access to all live threads and current focus milestones.
                </p>
                <div className="mt-6">
                  <Link
                    to={`/c/${communityId}/history`}
                    className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition-colors"
                  >
                    Browse Community Archive
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </section>

        </div>

        {/* Right Column: WHERE WE ARE NOW & WHAT TO DO NEXT */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* CURRENTLY LEARNING (Active Community Focus) */}
          <section className="rounded-2xl border border-neutral-200 bg-neutral-900 p-6 text-white shadow-lg sm:p-7">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-400">
              <Flame className="h-4 w-4" />
              Currently Learning
            </div>
            
            <h3 className="text-xl font-extrabold text-white mb-2">
              {catchUpData.currentFocusContext.title}
            </h3>

            <p className="text-xs text-neutral-300 leading-relaxed mb-4">
              {catchUpData.currentFocusContext.description}
            </p>

            <div className="rounded-xl border border-neutral-800 bg-neutral-800/80 p-3.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-1">
                Why It Matters Now
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed">
                {catchUpData.currentFocusContext.whyItMattersNow}
              </p>
            </div>
          </section>

          {/* WHAT I SHOULD DO NEXT (Recommended Starting Point) */}
          <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-neutral-50 p-6 shadow-xs sm:p-7">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-800">
              <Compass className="h-4 w-4 text-emerald-600" />
              Recommended Next Action
            </div>

            <h4 className="text-base font-bold text-neutral-900 mb-1">
              {catchUpData.recommendedStartingPoint.title}
            </h4>

            <p className="text-xs text-neutral-600 leading-relaxed mb-5">
              {catchUpData.recommendedStartingPoint.reason}
            </p>

            <button
              onClick={() => {
                navigate(`/c/${communityId}/learn/${catchUpData.recommendedStartingPoint.roadmapItemId}`);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-3.5 text-xs font-bold text-white hover:bg-neutral-800 transition-all active:scale-[0.99] shadow-sm"
            >
              <PlayCircle className="h-4 w-4" />
              Start Learning Here
            </button>
          </section>

          {/* Quick Nav Card to Member Journey */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h4 className="text-sm font-bold text-neutral-900 mb-2">Personal Progress</h4>
            <p className="text-xs text-neutral-500 mb-4">
              Your personal roadmap progression is tracked independently from the community timeline.
            </p>
            <Link
              to={`/c/${communityId}`}
              className="flex items-center justify-between text-xs font-bold text-neutral-900 hover:text-blue-600 transition-colors"
            >
              View Personal Progress Tracker
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

        </div>
      </div>

      {/* Discussion Inspection Modal */}
      <DiscussionModal
        discussion={selectedDiscussion}
        onClose={() => setSelectedDiscussion(null)}
      />
    </div>
  );
}
