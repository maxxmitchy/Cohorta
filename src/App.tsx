import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './ui/components/layout/Navbar';
import Home from './ui/pages/Home';
import CommunityDetail from './ui/pages/CommunityDetail';
import LearnPlaceholder from './ui/pages/LearnPlaceholder';
import Dashboard from './ui/pages/Dashboard';
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
