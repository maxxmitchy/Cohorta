import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useServices } from '../context/ServiceContext';
import { useAuth } from '../context/AuthContext';

export default function LearnPlaceholder() {
  const { communityId, roadmapItemId } = useParams();
  const { membershipService, communityDetailService } = useServices();
  const { session } = useAuth();
  
  const [communityName, setCommunityName] = useState<string>('...');
  const [itemTitle, setItemTitle] = useState<string>('...');
  const [status, setStatus] = useState<string>('locked');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      if (!communityId || !roadmapItemId || session.state !== 'authenticated' || !session.user) {
        setIsLoading(false);
        return;
      }
      
      try {
        const memberView = await membershipService.getMemberCommunityView(session.user.id, communityId);
        if (memberView && isMounted) {
          setCommunityName(memberView.name);
          const item = memberView.roadmap.find(r => r.id === roadmapItemId);
          if (item) {
            setItemTitle(item.title);
            setStatus(item.userProgressStatus);
          }
        } else if (isMounted) {
            // Unlikely to hit this if routing is correct, but fallback
            const data = await communityDetailService.getCommunityDetail(communityId);
            if (data) setCommunityName(data.name);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    fetchData();
    return () => { isMounted = false; };
  }, [communityId, roadmapItemId, membershipService, communityDetailService, session]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <Link to={`/c/${communityId}`} className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to {communityName}
      </Link>

      <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-xl shadow-neutral-200/40">
        <div className="border-b border-neutral-100 bg-neutral-50/50 px-8 py-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-emerald-700">
              {status}
            </span>
            <span className="text-sm font-medium text-neutral-500">
              {communityName}
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
            {itemTitle}
          </h1>
        </div>
        
        <div className="flex flex-col items-center justify-center py-24 text-center px-8">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <BookOpen className="h-10 w-10" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-neutral-900">Content Viewer</h2>
          <p className="max-w-md text-lg text-neutral-600">
            This is where you would view the course content, videos, and discussions for this specific topic.
          </p>
          
          <div className="mt-8 inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-bold text-neutral-500">
            <Clock className="h-4 w-4" />
            Coming Soon
          </div>
        </div>
      </div>
    </div>
  );
}
