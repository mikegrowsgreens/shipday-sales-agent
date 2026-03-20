'use client';

import { useState, useEffect } from 'react';
import {
  Shield, Building2, Users, BarChart3, Activity,
  ChevronRight, Loader2, ExternalLink,
} from 'lucide-react';

interface Tenant {
  org_id: number;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  user_count: number;
  contact_count: number;
  last_activity: string | null;
  created_at: string;
}

interface SystemStats {
  total_orgs: number;
  total_users: number;
  total_contacts: number;
  active_orgs: number;
  plans: Record<string, number>;
}

export default function AdminDashboardPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/tenants').then(r => r.json()),
      fetch('/api/admin/system-stats').then(r => r.json()),
    ])
      .then(([tenantsData, statsData]) => {
        if (tenantsData.error) throw new Error(tenantsData.error);
        setTenants(tenantsData.tenants || []);
        setStats(statsData);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-950/50 border border-red-900 rounded-xl p-4 text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-yellow-400" />
        <h1 className="text-2xl font-bold text-white">Super Admin Dashboard</h1>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Building2} label="Total Orgs" value={stats.total_orgs} />
          <StatCard icon={Users} label="Total Users" value={stats.total_users} />
          <StatCard icon={BarChart3} label="Total Contacts" value={stats.total_contacts} />
          <StatCard icon={Activity} label="Active Orgs" value={stats.active_orgs} />
        </div>
      )}

      {/* Plan distribution */}
      {stats?.plans && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Plan Distribution</h2>
          <div className="flex gap-4">
            {Object.entries(stats.plans).map(([plan, count]) => (
              <div key={plan} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  plan === 'pro' ? 'bg-purple-500/20 text-purple-400' :
                  plan === 'starter' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-gray-700 text-gray-400'
                }`}>{plan}</span>
                <span className="text-white font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tenant list */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-medium text-gray-400">All Organizations</h2>
        </div>
        <div className="divide-y divide-gray-800">
          {tenants.map(t => (
            <div key={t.org_id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{t.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    t.plan === 'pro' ? 'bg-purple-500/20 text-purple-400' :
                    t.plan === 'starter' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>{t.plan}</span>
                  {!t.is_active && <span className="px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400">inactive</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {t.user_count} users · {t.contact_count} contacts · Created {new Date(t.created_at).toLocaleDateString()}
                </div>
              </div>
              <a href={`/api/admin/tenants/${t.org_id}`} className="text-gray-500 hover:text-white">
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          ))}
          {tenants.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-500">No organizations found</div>
          )}
        </div>
      </div>

      {/* System health link */}
      <a href="/api/health" target="_blank" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
        System Health <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-500" />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <span className="text-2xl font-bold text-white">{value.toLocaleString()}</span>
    </div>
  );
}
