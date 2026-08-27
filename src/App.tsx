import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './ui/components/layout/Navbar';
import Home from './ui/pages/Home';
import CommunityDetail from './ui/pages/CommunityDetail';
import LearnPlaceholder from './ui/pages/LearnPlaceholder';
import Dashboard from './ui/pages/Dashboard';
import { CommunityCatchUpView } from './ui/pages/community/CommunityCatchUpView';
import { CommunityHistoryView } from './ui/pages/community/CommunityHistoryView';
import { ServiceProvider } from './ui/context/ServiceContext';
import { AuthProvider } from './ui/context/AuthContext';

export default function App() {
  return (
    <ServiceProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-neutral-200">
            <Navbar />
            <main>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/c/:communityId" element={<CommunityDetail />} />
                <Route path="/c/:communityId/catch-up" element={<CommunityCatchUpView />} />
                <Route path="/c/:communityId/history" element={<CommunityHistoryView />} />
                <Route path="/c/:communityId/learn/:roadmapItemId" element={<LearnPlaceholder />} />
                <Route path="/dashboard/*" element={<Dashboard />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ServiceProvider>
  );
}
