import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useServices } from '../context/ServiceContext';
import { useAuth } from '../context/AuthContext';
import { CommunityDetailReadModel } from '../../core/readmodels/CommunityDetailReadModel';
import { MemberCommunityReadModel } from '../../core/readmodels/MemberCommunityReadModel';
import { CommunityDetailVisitor } from './community/CommunityDetailVisitor';
import { CommunityDetailMember } from './community/CommunityDetailMember';

export default function CommunityDetail() {
  const { communityId } = useParams();
  const { communityDetailService, membershipService } = useServices();
  const { session } = useAuth();
  
  const [visitorData, setVisitorData] = useState<CommunityDetailReadModel | null>(null);
  const [memberData, setMemberData] = useState<MemberCommunityReadModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!communityId) return;
    setIsLoading(true);
    try {
      if (session.state === 'authenticated' && session.user) {
        // Check if they are a member
        const memberView = await membershipService.getMemberCommunityView(session.user.id, communityId);
        if (memberView) {
          setMemberData(memberView);
          setIsLoading(false);
          return;
        }
      }
      
      // Fallback to visitor view
      setMemberData(null);
      const data = await communityDetailService.getCommunityDetail(communityId);
      setVisitorData(data);
    } catch (err) {
      console.error("Failed to load community detail", err);
    } finally {
      setIsLoading(false);
    }
  }, [communityId, communityDetailService, membershipService, session]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleJoinSuccess = () => {
    fetchDetail();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
      </div>
    );
  }

  if (!memberData && !visitorData) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <h2 className="text-2xl font-bold text-neutral-900">Community not found</h2>
        <Link to="/" className="mt-4 text-sm font-medium text-blue-600 hover:underline">
          Return to discovery
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to Discovery
      </Link>

      {memberData ? (
        <CommunityDetailMember community={memberData} />
      ) : (
        <CommunityDetailVisitor community={visitorData!} onJoinSuccess={handleJoinSuccess} />
      )}
    </div>
  );
}
