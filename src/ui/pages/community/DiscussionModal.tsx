import { X, CheckCircle2, MessageSquare, ExternalLink, HelpCircle, Sparkles, BookOpen, User, FolderGit2 } from 'lucide-react';
import { Discussion } from '../../../core/domain/discussion';

interface Props {
  discussion: Discussion | null;
  onClose: () => void;
}

export function DiscussionModal({ discussion, onClose }: Props) {
  if (!discussion) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-neutral-100 p-6">
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
              {discussion.topicTitle}
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-neutral-500">
              {discussion.type === 'question' && <HelpCircle className="h-3.5 w-3.5 text-amber-500" />}
              {discussion.type === 'learning_milestone' && <Sparkles className="h-3.5 w-3.5 text-emerald-500" />}
              {discussion.type === 'resource' && <BookOpen className="h-3.5 w-3.5 text-blue-500" />}
              {discussion.type.replace('_', ' ')}
            </span>
          </div>
          <button 
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Main Post */}
          <div>
            <div className="mb-3 flex items-center gap-3">
              <img 
                src={discussion.author.avatarUrl} 
                alt={discussion.author.name} 
                className="h-10 w-10 rounded-full border border-neutral-200 object-cover"
                referrerPolicy="no-referrer"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-neutral-900">{discussion.author.name}</span>
                  {discussion.author.role === 'creator' && (
                    <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                      Creator
                    </span>
                  )}
                </div>
                <span className="text-xs text-neutral-400">
                  {new Date(discussion.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>

            <h2 className="mb-2 text-lg font-bold text-neutral-900 leading-snug">
              {discussion.title}
            </h2>
            <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">
              {discussion.content}
            </p>
          </div>

          {/* Resolution Takeaway Banner if resolved */}
          {discussion.isResolved && discussion.resolutionSummary && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Community Resolution / Consensus
              </div>
              <p className="text-sm text-emerald-900 leading-relaxed">
                {discussion.resolutionSummary}
              </p>
            </div>
          )}

          {/* Attached Resources */}
          {discussion.resources && discussion.resources.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Attached Resources
              </div>
              <div className="space-y-2">
                {discussion.resources.map(res => (
                  <a
                    key={res.id}
                    href={res.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/80 p-3 hover:border-neutral-300 hover:bg-neutral-100/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {res.type === 'github' && <FolderGit2 className="h-4 w-4 text-neutral-700" />}
                      {res.type === 'paper' && <BookOpen className="h-4 w-4 text-blue-600" />}
                      {res.type === 'guide' && <ExternalLink className="h-4 w-4 text-emerald-600" />}
                      <span className="text-sm font-semibold text-neutral-900">{res.title}</span>
                    </div>
                    <ExternalLink className="h-4 w-4 text-neutral-400" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Replies Section */}
          <div className="space-y-4 border-t border-neutral-100 pt-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
              <MessageSquare className="h-3.5 w-3.5" />
              Replies ({discussion.replies.length})
            </div>

            {discussion.replies.length === 0 ? (
              <p className="text-xs italic text-neutral-400">No replies yet on this thread.</p>
            ) : (
              <div className="space-y-3">
                {discussion.replies.map(reply => (
                  <div 
                    key={reply.id} 
                    className={`rounded-xl border p-4 ${reply.isAnswer ? 'border-emerald-200 bg-emerald-50/40' : 'border-neutral-100 bg-neutral-50/60'}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img 
                          src={reply.author.avatarUrl} 
                          alt={reply.author.name} 
                          className="h-6 w-6 rounded-full border border-neutral-200 object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-xs font-bold text-neutral-900">{reply.author.name}</span>
                        {reply.author.role === 'creator' && (
                          <span className="rounded bg-neutral-900 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase">
                            Creator
                          </span>
                        )}
                        {reply.isAnswer && (
                          <span className="rounded bg-emerald-600 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase">
                            Key Answer
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-neutral-400">
                        {new Date(reply.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-wrap">
                      {reply.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/50 p-4 px-6 rounded-b-2xl">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <User className="h-3.5 w-3.5" />
            Learning Archive Thread
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 transition-colors"
          >
            Close Thread
          </button>
        </div>
      </div>
    </div>
  );
}
