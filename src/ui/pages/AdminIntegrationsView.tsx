import { useEffect, useState, useCallback } from 'react';
import { Radio, RefreshCw, Plus, CheckCircle, AlertTriangle, ShieldCheck, XCircle, ShieldAlert, Lock, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { mockUsers } from '../../infrastructure/db/mock/mockData';

interface IntegrationSummary {
  id: string;
  communityId: string;
  providerType: string;
  providerCommunityId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  lastSuccessfulIngestionAt?: string;
  lastFailedIngestionAt?: string;
  lastProcessingError?: string;
  lastCheckpoint?: string | number;
}

interface IngestionHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  totalEvents: number;
  processedCount: number;
  inFlightCount: number;
  staleCount: number;
  failedCount: number;
  permanentlyFailedCount: number;
  activeIntegrationsCount: number;
  generatedAt: string;
}

export function AdminIntegrationsView() {
  const { session, setDevUser } = useAuth();
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [health, setHealth] = useState<IngestionHealthReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // New integration form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [providerType, setProviderType] = useState('telegram');
  const [providerCommunityId, setProviderCommunityId] = useState('');
  const [communityId, setCommunityId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchIntegrationsAndHealth = useCallback(async () => {
    if (session.state !== 'authenticated' || !session.user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const authHeaders: HeadersInit = {
        Authorization: `Bearer ${session.user.id}`,
      };

      const integrationsRes = await fetch('/api/integrations', {
        headers: authHeaders,
      });

      if (!integrationsRes.ok) {
        const errData = await integrationsRes.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to load integrations (HTTP ${integrationsRes.status})`);
      }

      const integrationsData = await integrationsRes.json();
      setIntegrations(integrationsData.integrations || []);

      // If user is admin, fetch operational telemetry report
      if (session.user.role === 'admin') {
        const healthRes = await fetch('/api/integrations/health', {
          headers: authHeaders,
        });
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setHealth(healthData);
        }
      } else {
        setHealth(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchIntegrationsAndHealth();
  }, [fetchIntegrationsAndHealth]);

  const handleToggleActive = async (integration: IntegrationSummary) => {
    if (session.state !== 'authenticated' || !session.user) {
      setError('You must be signed in to perform this action.');
      return;
    }

    try {
      setActionMessage(null);
      setError(null);
      const action = integration.isActive ? 'disable' : 'enable';
      const res = await fetch(
        `/api/integrations/${integration.providerType}/${encodeURIComponent(integration.providerCommunityId)}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.user.id}`,
          },
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Action failed (HTTP ${res.status})`);
      }

      setActionMessage(`Integration for chat ${integration.providerCommunityId} was ${action}d successfully.`);
      await fetchIntegrationsAndHealth();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  const handleCreateIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (session.state !== 'authenticated' || !session.user) {
      setError('You must be signed in to create an integration.');
      return;
    }

    if (!providerCommunityId.trim() || !communityId.trim()) {
      setError('Both External Chat ID and Cohorta Community ID are required.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setActionMessage(null);

      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.user.id}`,
        },
        body: JSON.stringify({
          providerType,
          providerCommunityId: providerCommunityId.trim(),
          communityId: communityId.trim(),
          isActive: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Creation failed (HTTP ${res.status})`);
      }

      setActionMessage(`Integration created: ${providerType} chat ${providerCommunityId.trim()} → community ${communityId.trim()}`);
      setProviderCommunityId('');
      setCommunityId('');
      setShowAddForm(false);
      await fetchIntegrationsAndHealth();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Unauthenticated View (401 UI Equivalent)
  if (session.state === 'unauthenticated' || !session.user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
          <Lock className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Authentication Required</h1>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            You must be signed in with an administrative or community creator account to access Community Integration controls.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-left shadow-sm space-y-4">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Development Sign-In
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mockUsers.filter((u) => u.role === 'admin').map((user) => (
              <button
                key={user.id}
                onClick={() => setDevUser(user.id)}
                className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 hover:border-neutral-900 bg-neutral-50 hover:bg-white text-left transition-colors"
              >
                <div>
                  <div className="text-sm font-semibold text-neutral-900">{user.name}</div>
                  <div className="text-xs text-neutral-500">{user.email}</div>
                </div>
                <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Admin</span>
              </button>
            ))}
            {mockUsers.filter((u) => u.role === 'creator').slice(0, 2).map((user) => (
              <button
                key={user.id}
                onClick={() => setDevUser(user.id)}
                className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 hover:border-neutral-900 bg-neutral-50 hover:bg-white text-left transition-colors"
              >
                <div>
                  <div className="text-sm font-semibold text-neutral-900">{user.name}</div>
                  <div className="text-xs text-neutral-500">{user.email}</div>
                </div>
                <span className="text-[10px] uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Creator</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 2. Unauthorized View (403 UI Equivalent for learners/mentors)
  const isAuthorized = session.user.role === 'admin' || session.user.role === 'creator';
  if (!isAuthorized) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600 border border-red-200">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Access Denied (403)</h1>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Your account <span className="font-semibold text-neutral-800">({session.user.name})</span> has the role <span className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-700">{session.user.role}</span>. Administrative integration management is restricted to platform operators and community creators.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-left shadow-sm space-y-4">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Switch to Authorized Operator / Creator
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mockUsers.filter((u) => u.role === 'admin').map((user) => (
              <button
                key={user.id}
                onClick={() => setDevUser(user.id)}
                className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 hover:border-neutral-900 bg-neutral-50 hover:bg-white text-left transition-colors"
              >
                <div>
                  <div className="text-sm font-semibold text-neutral-900">{user.name}</div>
                  <div className="text-xs text-neutral-500">{user.email}</div>
                </div>
                <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Admin</span>
              </button>
            ))}
            {mockUsers.filter((u) => u.role === 'creator').slice(0, 2).map((user) => (
              <button
                key={user.id}
                onClick={() => setDevUser(user.id)}
                className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 hover:border-neutral-900 bg-neutral-50 hover:bg-white text-left transition-colors"
              >
                <div>
                  <div className="text-sm font-semibold text-neutral-900">{user.name}</div>
                  <div className="text-xs text-neutral-500">{user.email}</div>
                </div>
                <span className="text-[10px] uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Creator</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 3. Authorized View (Admin / Creator)
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-6 w-6 text-neutral-800" />
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Community Integrations</h1>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Authoritative bindings between external channels and Cohorta communities.
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
            <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>
              Signed in as <strong className="text-neutral-800">{session.user.name}</strong> (
              <span className="uppercase font-semibold text-xs tracking-wider text-indigo-600">{session.user.role}</span>
              )
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            id="refresh-integrations-btn"
            onClick={fetchIntegrationsAndHealth}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            id="add-integration-btn"
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800 focus:outline-none"
          >
            <Plus className="h-4 w-4" />
            <span>{showAddForm ? 'Cancel' : 'Connect Channel'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionMessage && (
        <div id="integration-action-success" className="rounded-lg bg-neutral-900 text-white px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {error && (
        <div id="integration-action-error" className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Create Integration Form */}
      {showAddForm && (
        <form
          id="create-integration-form"
          onSubmit={handleCreateIntegration}
          className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4"
        >
          <h2 className="text-base font-semibold text-neutral-900">Add Community Integration</h2>
          <p className="text-xs text-neutral-500">
            Strict invariant: Only registered integrations will accept events. Unknown external channels are dropped without creating synthetic communities.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="provider-type-select" className="block text-xs font-medium text-neutral-700 mb-1">
                Provider
              </label>
              <select
                id="provider-type-select"
                value={providerType}
                onChange={(e) => setProviderType(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none"
              >
                <option value="telegram">Telegram</option>
                <option value="discord">Discord</option>
                <option value="slack">Slack</option>
              </select>
            </div>
            <div>
              <label htmlFor="provider-chat-id-input" className="block text-xs font-medium text-neutral-700 mb-1">
                External Chat ID (e.g. -1001234567890)
              </label>
              <input
                id="provider-chat-id-input"
                type="text"
                value={providerCommunityId}
                onChange={(e) => setProviderCommunityId(e.target.value)}
                placeholder="-100192837465"
                required
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="target-community-id-input" className="block text-xs font-medium text-neutral-700 mb-1">
                Cohorta Community ID
              </label>
              <input
                id="target-community-id-input"
                type="text"
                value={communityId}
                onChange={(e) => setCommunityId(e.target.value)}
                placeholder="com_1"
                required
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              id="submit-integration-btn"
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {submitting ? 'Connecting...' : 'Establish Binding'}
            </button>
          </div>
        </form>
      )}

      {/* Operational Health Overview (Admin Only) */}
      {health && session.user.role === 'admin' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-xs font-medium text-neutral-500">Pipeline Status</div>
            <div className="mt-1 flex items-center gap-2">
              {health.status === 'healthy' && <CheckCircle className="h-4 w-4 text-emerald-600" />}
              {health.status === 'degraded' && <AlertTriangle className="h-4 w-4 text-amber-600" />}
              {health.status === 'unhealthy' && <XCircle className="h-4 w-4 text-red-600" />}
              <span className="text-base font-semibold capitalize text-neutral-900">{health.status}</span>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-xs font-medium text-neutral-500">Active Integrations</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">{health.activeIntegrationsCount}</div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-xs font-medium text-neutral-500">Processed Events</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">{health.processedCount}</div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-xs font-medium text-neutral-500">Failed / Dead-Letter</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">
              {health.failedCount} / {health.permanentlyFailedCount}
            </div>
          </div>
        </div>
      )}

      {/* Connected Integrations List */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-neutral-600" />
            <h2 className="text-sm font-semibold text-neutral-900">Persisted Channels</h2>
          </div>
          <span className="text-xs text-neutral-500">{integrations.length} configured</span>
        </div>

        {integrations.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            No community integrations configured yet. Use "Connect Channel" above to map a Telegram chat to a Cohorta community.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {integrations.map((item) => (
              <div key={item.id} className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-medium uppercase bg-neutral-100 text-neutral-700">
                      {item.providerType}
                    </span>
                    <span className="font-mono text-sm font-medium text-neutral-900">Chat ID: {item.providerCommunityId}</span>
                    <span className="text-neutral-400">→</span>
                    <span className="text-sm font-medium text-neutral-700">Community: {item.communityId}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-neutral-500 pt-1">
                    <span>Created: {new Date(item.createdAt).toLocaleDateString()}</span>
                    {item.lastSuccessfulIngestionAt && (
                      <span>Last Ingested: {new Date(item.lastSuccessfulIngestionAt).toLocaleTimeString()}</span>
                    )}
                    {item.lastCheckpoint !== undefined && <span>Offset: {String(item.lastCheckpoint)}</span>}
                  </div>

                  {item.lastProcessingError && (
                    <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 mt-1 inline-block">
                      Error: {item.lastProcessingError}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      item.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                    }`}
                  >
                    {item.isActive ? 'Active' : 'Disabled'}
                  </span>

                  <button
                    id={`toggle-integration-${item.providerCommunityId}`}
                    onClick={() => handleToggleActive(item)}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium focus:outline-none ${
                      item.isActive
                        ? 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                        : 'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800'
                    }`}
                  >
                    {item.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export default AdminIntegrationsView;
