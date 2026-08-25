import { useParams } from 'react-router-dom';

export default function CommunityDetail() {
  const { communityId } = useParams();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-96 rounded-2xl border-2 border-dashed border-neutral-200 flex flex-col items-center justify-center text-neutral-400 bg-white gap-2">
        <span>[Community Detail View - Pending Phase 9]</span>
        <span className="text-sm">Viewing ID: {communityId}</span>
      </div>
    </div>
  );
}
