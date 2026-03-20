'use client';

import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Copy, Trash2, Loader2, AlertTriangle, Check, ShieldAlert } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApiKey {
  key_id: number;
  key_name: string;
  key_prefix: string;
  permissions: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface NewKeyResponse {
  key: string;
  prefix: string;
  name: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState<NewKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  // ─── Data Loading ───────────────────────────────────────────────────────

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/api-keys');
      if (res.status === 403) {
        const data = await res.json();
        if (data.code === 'PLAN_UPGRADE_REQUIRED') {
          setNeedsUpgrade(true);
          setLoading(false);
          return;
        }
      }
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch (e) {
      console.error('Failed to load API keys:', e);
      setError('Failed to load API keys.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  // ─── Actions ────────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data);
        setNewKeyName('');
        await loadKeys();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to create API key.');
      }
    } catch (e) {
      console.error('Failed to create API key:', e);
      setError('Failed to create API key.');
    }
    setCreating(false);
  }

  async function handleRevoke(keyId: number) {
    setRevoking(keyId);
    setError(null);
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId }),
      });
      if (res.ok) {
        setKeys(prev => prev.filter(k => k.key_id !== keyId));
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to revoke API key.');
      }
    } catch (e) {
      console.error('Failed to revoke API key:', e);
      setError('Failed to revoke API key.');
    }
    setRevoking(null);
    setConfirmRevoke(null);
  }

  function handleCopy() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Feature gate: plan upgrade required
  if (needsUpgrade) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Key className="w-6 h-6 text-gray-400" />
          <div>
            <h1 className="text-xl font-bold text-white">API Keys</h1>
            <p className="text-sm text-gray-400">Manage API keys for programmatic access to your data.</p>
          </div>
        </div>
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-8 text-center">
          <ShieldAlert className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Upgrade Required</h2>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            API key access is available on higher-tier plans. Upgrade your plan to generate keys and access your data programmatically.
          </p>
          <a
            href="/settings/billing"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-500 text-black font-medium rounded-lg hover:bg-yellow-400 transition-colors"
          >
            View Plans
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Key className="w-6 h-6 text-gray-400" />
        <div>
          <h1 className="text-xl font-bold text-white">API Keys</h1>
          <p className="text-sm text-gray-400">Manage API keys for programmatic access to your data.</p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300 text-sm">
            Dismiss
          </button>
        </div>
      )}

      {/* New Key Display */}
      {newKey && (
        <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/5 p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-green-400 mb-1">Key Created: {newKey.name}</h3>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                <p className="text-xs text-yellow-300">Copy this key now. It won&apos;t be shown again.</p>
              </div>
            </div>
            <button
              onClick={() => setNewKey(null)}
              className="text-gray-400 hover:text-gray-300 text-sm"
            >
              Dismiss
            </button>
          </div>
          <div className="flex items-center gap-2 bg-black/40 rounded-md px-4 py-3">
            <code className="text-sm text-green-300 font-mono flex-1 break-all select-all">
              {newKey.key}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 p-2 rounded-md hover:bg-white/10 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Create Key Form */}
      <form onSubmit={handleCreate} className="mb-8 flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="key-name" className="block text-sm font-medium text-gray-300 mb-1.5">
            Key Name
          </label>
          <input
            id="key-name"
            type="text"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            placeholder="e.g. Production, n8n Integration"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !newKeyName.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Generate Key
        </button>
      </form>

      {/* Keys Table or Empty State */}
      {keys.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-12 text-center">
          <Key className="w-8 h-8 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No API keys yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Key Prefix</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Created</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Last Used</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.key_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-medium">{k.key_name}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-gray-400 font-mono bg-white/5 px-2 py-0.5 rounded">
                      {k.key_prefix}...
                    </code>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{relativeDate(k.created_at)}</td>
                  <td className="px-4 py-3 text-gray-400">{relativeDate(k.last_used_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {confirmRevoke === k.key_id ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="text-xs text-red-400">Revoke?</span>
                        <button
                          onClick={() => handleRevoke(k.key_id)}
                          disabled={revoking === k.key_id}
                          className="px-2.5 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-500 disabled:opacity-50 transition-colors"
                        >
                          {revoking === k.key_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            'Yes'
                          )}
                        </button>
                        <button
                          onClick={() => setConfirmRevoke(null)}
                          className="px-2.5 py-1 text-xs bg-white/10 text-gray-300 rounded hover:bg-white/20 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRevoke(k.key_id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
