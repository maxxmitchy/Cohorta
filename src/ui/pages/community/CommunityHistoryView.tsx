import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Clock, 
  CheckCircle2, 
  Circle, 
  PlayCircle, 
  MessageSquare, 
  ExternalLink, 
  Activity, 
  Sparkles, 
  Layers, 
  ShieldAlert,
  Calendar
} from 'lucide-react';
import { useServices } from '../../context/ServiceContext';
import { useAuth } from '../../context/AuthContext';
import { CommunityHistoryReadModel, HistoricalTimelineTopic } from '../../../core/readmodels/CommunityHistoryReadModel';
import { Discussion } from '../../../core/domain/discussion';
import { DiscussionModal } from './DiscussionModal';
import { cn } from '../../../lib/utils';

export function CommunityHistoryView() {
  const { communityId } = useParams();
  const { communityHistoryService } = useServices();
  const { session } = useAuth();

  const [historyData, setHistoryData] = useState<CommunityHistoryReadModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedDiscussion, setSelectedDiscussion] = useState<Discussion | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!communityId) return;
    if (session.state !== 'authenticated' || !session.user) {
      setErrorMessage('Please sign in to view the community learning history.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await communityHistoryService.getCommunityHistory(session.user.id, communityId);
      setHistoryData(data);
      if (data.timeline.length > 0) {
        // Default selection to current active topic or first topic
        const current = data.timeline.find(t => t.status === 'current');
        setSelectedTopicId(current ? current.roadmapItemId : data.timeline[0].roadmapItemId);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to load community learning history.');
    } finally {
      setIsLoading(false);
    }
  }, [communityId, communityHistoryService, session]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
          <p className="text-sm font-medium text-neutral-500">Loading community history archive...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !historyData) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-600" />
          <h2 className="text-xl font-bold text-neutral-900">Access Restricted</h2>
          <p className="mt-2 text-sm text-neutral-600">
            {errorMessage || 'You must be an active member of this community to access its history.'}
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

  const activeTopic = historyData.timeline.find(t => t.roadmapItemId === selectedTopicId) || historyData.timeline[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Navigation Header */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          to={`/c/${communityId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {historyData.communityName}
        </Link>

        <Link
          to={`/c/${communityId}/catch-up`}
          className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Catch Me Up Briefing
        </Link>
      </div>

      {/* Main Title & Pulse Banner */}
      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700">
              {historyData.categoryName}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Community Learning Archive
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
            {historyData.communityName} History
          </h1>
          <p className="mt-2 text-sm text-neutral-600 max-w-2xl leading-relaxed">
            The chronological record of everything this community has explored, built, and resolved across roadmap milestones.
          </p>
        </div>

        {/* Lightweight Community Pulse */}
        <div className="lg:col-span-4 rounded-2xl border border-neutral-200 bg-neutral-900 p-5 text-white shadow-md">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <Activity className="h-4 w-4" />
            Community Pulse
          </div>
          <p className="text-xs text-neutral-400">Current Milestone</p>
          <p className="text-sm font-bold text-white mb-3">{historyData.pulse.currentTopic}</p>
          <div className="flex items-center justify-between border-t border-neutral-800 pt-3 text-xs">
            <span className="text-neutral-400">Archived Threads</span>
            <span className="font-bold text-emerald-300">{historyData.totalDiscussions} discussions</span>
          </div>
        </div>
      </div>

      {/* Main Layout: Timeline Topics Selector on Left, Topic Archive Details on Right */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        
        {/* Timeline Navigation (Left) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
              Learning Timeline
            </h2>
            <span className="text-xs text-neutral-400">{historyData.timeline.length} Milestones</span>
          </div>

          <div className="space-y-2">
            {historyData.timeline.map((topic: HistoricalTimelineTopic) => {
              const isSelected = topic.roadmapItemId === activeTopic?.roadmapItemId;
              const isCompleted = topic.status === 'completed';
              const isCurrent = topic.status === 'current';
              const isUpcoming = topic.status === 'upcoming';

              return (
                <button
                  key={topic.roadmapItemId}
                  onClick={() => setSelectedTopicId(topic.roadmapItemId)}
                  className={cn(
                    "w-full text-left rounded-2xl border p-4 transition-all",
                    isSelected 
                      ? "border-neutral-900 bg-white shadow-md ring-1 ring-neutral-900" 
                      : "border-neutral-200 bg-white/70 hover:bg-white hover:border-neutral-300"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-xs font-bold text-neutral-700">
                        {topic.orderIndex}
                      </span>
                      <span className="text-sm font-bold text-neutral-900">
                        {topic.title}
                      </span>
                    </div>

                    <div className="shrink-0">
                      {isCompleted && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" />
                          Done
                        </span>
                      )}
                      {isCurrent && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <PlayCircle className="h-3 w-3 animate-pulse" />
                          Current
                        </span>
                      )}
                      {isUpcoming && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
                          <Circle className="h-3 w-3" />
                          Upcoming
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-neutral-500 line-clamp-2">
                    {topic.description}
                  </p>

                  <div className="mt-3 flex items-center gap-3 text-[11px] text-neutral-400">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {topic.discussionCount} threads
                    </span>
                    {topic.completedAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(topic.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Topic Details & Discussions (Right) */}
        <div className="lg:col-span-7">
          {activeTopic ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs sm:p-8 space-y-6">
              
              {/* Header */}
              <div className="border-b border-neutral-100 pb-6">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-700">
                    Milestone {activeTopic.orderIndex}
                  </span>
                  <span className="text-xs font-semibold text-neutral-400">
                    Status: {activeTopic.status}
                  </span>
                </div>
                <h3 className="text-2xl font-extrabold text-neutral-900">
                  {activeTopic.title}
                </h3>
                <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                  {activeTopic.description}
                </p>

                {activeTopic.keyIdea && (
                  <div className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Consensus Takeaway
                    </span>
                    <p className="mt-1 text-xs font-medium text-neutral-800 leading-relaxed">
                      "{activeTopic.keyIdea}"
                    </p>
                  </div>
                )}
              </div>

              {/* Discussions & Threads */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Historical Discussions ({activeTopic.discussions.length})
                  </h4>
                  <span className="text-[11px] text-neutral-400">Click any thread to inspect</span>
                </div>

                {activeTopic.discussions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-xs text-neutral-400">
                    No discussions archived for this milestone yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeTopic.discussions.map((disc: Discussion) => (
                      <div
                        key={disc.id}
                        onClick={() => setSelectedDiscussion(disc)}
                        className="cursor-pointer rounded-2xl border border-neutral-200 p-5 hover:border-neutral-400 hover:bg-neutral-50/50 transition-all"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img
                              src={disc.author.avatarUrl}
                              alt={disc.author.name}
                              className="h-6 w-6 rounded-full border border-neutral-200 object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <span className="text-xs font-bold text-neutral-900">{disc.author.name}</span>
                            {disc.author.role === 'creator' && (
                              <span className="rounded bg-neutral-900 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase">
                                Creator
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-neutral-400">
                            {new Date(disc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>

                        <h5 className="text-sm font-bold text-neutral-900 mb-1">
                          {disc.title}
                        </h5>
                        <p className="text-xs text-neutral-600 line-clamp-2 mb-3">
                          {disc.content}
                        </p>

                        {disc.resolutionSummary && (
                          <div className="mb-3 rounded-lg bg-emerald-50 p-2 text-[11px] text-emerald-800">
                            <span className="font-bold">Takeaway: </span>{disc.resolutionSummary}
                          </div>
                        )}

                        <div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-[11px] text-neutral-500">
                          <span className="flex items-center gap-1 font-medium">
                            <MessageSquare className="h-3.5 w-3.5" />
                            {disc.replyCount} {disc.replyCount === 1 ? 'reply' : 'replies'}
                          </span>
                          <span className="font-bold text-neutral-700 hover:text-neutral-900">
                            View Discussion →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Key Resources Section */}
              {activeTopic.keyResources.length > 0 && (
                <div className="border-t border-neutral-100 pt-6 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Milestone Resources
                  </h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {activeTopic.keyResources.map(res => (
                      <a
                        key={res.id}
                        href={res.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-xl border border-neutral-200 p-3 hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
                          <span className="text-xs font-semibold text-neutral-800 truncate">{res.title}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 p-12 text-center text-sm text-neutral-400">
              Select a milestone from the left to view discussions and resources.
            </div>
          )}
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
