'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Calendar, Mail, Phone, Video,
  Database, Link2, BarChart3, CheckCircle2,
  AlertTriangle, XCircle, RefreshCw, Loader2,
  ArrowRight, Clock, Zap,
} from 'lucide-react';

type HealthStatus = 'healthy' | 'warning' | 'error' | 'unconfigured';

interface CheckResult {
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

interface HealthData {
  status: HealthStatus;
  checked_at: string;
  checks: Record<string, CheckResult>;
  env_summary: Record<string, boolean | string>;
}

const STATUS_ICONS: Record<HealthStatus, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  unconfigured: AlertTriangle,
};

const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: 'text-green-500',
  warning: 'text-yellow-500',
  error: 'text-red-500',
  unconfigured: 'text-gray-400',
};

const STATUS_BG: Record<HealthStatus, string> = {
  healthy: 'bg-green-50 border-green-200',
  warning: 'bg-yellow-50 border-yellow-200',
  error: 'bg-red-50 border-red-200',
  unconfigured: 'bg-gray-50 border-gray-200',
};

const CHECK_LABELS: Record<string, { label: string; icon: typeof Activity }> = {
  google_calendar: { label: 'Google Calendar', icon: Calendar },
  gmail_sync: { label: 'Gmail Sync', icon: Mail },
  fathom: { label: 'Fathom Recordings', icon: Video },
  email_tracking: { label: 'Email Tracking', icon: BarChart3 },
  sequences: { label: 'Sequences', icon: Zap },
  campaigns: { label: 'Outbound Campaigns', icon: ArrowRight },
  databases: { label: 'Databases', icon: Database },
  n8n: { label: 'n8n Automation', icon: Link2 },
  followups: { label: 'Follow-ups', icon: Clock },
};

function StatusBadge({ status }: { status: HealthStatus }) {
  const Icon = STATUS_ICONS[status];
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
      <Icon className="w-3.5 h-3.5" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </div>
  );
}

function IntegrationCard({ name, check }: { name: string; check: CheckResult }) {
  const config = CHECK_LABELS[name] || { label: name, icon: Activity };
  const Icon = config.icon;

  return (
    <div className={`border rounded-xl p-4 ${STATUS_BG[check.status]}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${STATUS_COLORS[check.status]}`} />
          <h3 className="font-semibold text-gray-900">{config.label}</h3>
        </div>
        <StatusBadge status={check.status} />
      </div>
      <p className="text-sm text-gray-600 mb-2">{check.message}</p>
      {check.details && (
        <div className="mt-2 pt-2 border-t border-gray-200/50">
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(check.details).map(([key, value]) => (
              <div key={key} className="text-xs">
                <span className="text-gray-400">{key.replace(/_/g, ' ')}:</span>{' '}
                <span className="text-gray-700 font-medium">
                  {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/integration-health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const statusCounts = data
    ? Object.values(data.checks).reduce(
        (acc, c) => {
          acc[c.status] = (acc[c.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      )
    : {};

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-6 h-6 text-blue-600" />
              Integration Health
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Real-time status of all SalesHub data connections
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-gray-400">
                Last checked: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh
            </button>
          </div>
        </div>

        {/* Overall status banner */}
        {data && (
          <div
            className={`rounded-xl border p-4 mb-6 flex items-center justify-between ${STATUS_BG[data.status]}`}
          >
            <div className="flex items-center gap-3">
              {(() => {
                const Icon = STATUS_ICONS[data.status];
                return <Icon className={`w-6 h-6 ${STATUS_COLORS[data.status]}`} />;
              })()}
              <div>
                <p className="font-semibold text-gray-900">
                  Overall: {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
                </p>
                <p className="text-xs text-gray-500">
                  {statusCounts.healthy || 0} healthy
                  {statusCounts.warning ? `, ${statusCounts.warning} warnings` : ''}
                  {statusCounts.error ? `, ${statusCounts.error} errors` : ''}
                </p>
              </div>
            </div>
            <Phone className="w-5 h-5 text-gray-300" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Integration cards grid */}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {Object.entries(data.checks).map(([name, check]) => (
              <IntegrationCard key={name} name={name} check={check} />
            ))}
          </div>
        )}

        {/* Env summary */}
        {data && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Environment Variables
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(data.env_summary).map(([key, value]) => (
                <div key={key} className="text-xs">
                  <span className="text-gray-400 block">{key}</span>
                  <span
                    className={`font-medium ${
                      value === true
                        ? 'text-green-600'
                        : value === false
                          ? 'text-red-500'
                          : 'text-gray-600'
                    }`}
                  >
                    {typeof value === 'boolean' ? (value ? 'Set' : 'Missing') : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
}
