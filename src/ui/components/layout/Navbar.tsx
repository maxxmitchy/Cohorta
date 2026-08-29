import { Link } from 'react-router-dom';
import { Search, Compass, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { mockUsers } from '../../../infrastructure/db/mock/mockData';
import { useAuth } from '../../context/AuthContext';

export default function Navbar() {
  const { session, setDevUser } = useAuth();
  const [showDevMenu, setShowDevMenu] = useState(false);

  const handleSwitchUser = async (userId: string | null) => {
    await setDevUser(userId);
    setShowDevMenu(false);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-neutral-900 flex items-center justify-center">
              <Compass className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-neutral-900">Cohorta</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">Explore</Link>
            <Link to="/admin/integrations" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">Integrations</Link>
            {session.state === 'authenticated' && (
              <span className="text-sm font-medium text-neutral-600 hover:text-neutral-900 cursor-pointer">My Communities</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input 
              type="text" 
              placeholder="Search communities..." 
              className="h-9 w-64 rounded-full border border-neutral-200 bg-neutral-50 pl-9 pr-4 text-sm focus:border-neutral-300 focus:outline-none focus:ring-0"
            />
          </div>

          {/* Dev Auth Switcher */}
          <div className="relative">
            <button 
              onClick={() => setShowDevMenu(!showDevMenu)}
              className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              {session.state === 'authenticated' ? session.user?.name : 'Sign In'}
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            </button>

            {showDevMenu && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
                <div className="mb-2 px-2 pb-2 text-xs font-bold text-neutral-400 border-b border-neutral-100 uppercase tracking-wider">
                  Dev: Switch User
                </div>
                <button 
                  onClick={() => handleSwitchUser(null)}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  Unauthenticated (Visitor)
                </button>
                {mockUsers.filter(u => u.role === 'learner').map(user => (
                  <button 
                    key={user.id}
                    onClick={() => handleSwitchUser(user.id)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    {user.name} ({user.id.replace('u_member_', '').replace('u_visitor', 'visitor')})
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}
