'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3, Check, X, Loader2, ArrowUpRight,
  Users, Mail, Sparkles, GitBranch, Megaphone, UserCheck,
  Phone, Zap, Brain, Calendar, Globe, Shield, Key, Linkedin,
  GraduationCap, Palette,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LimitInfo {
  current: number;
  limit: number;
  percentage: number;
}

interface UsageData {
  plan: string;
  planDisplayName: string;
  limits: Record<string, LimitInfo>;
  features: Record<string, boolean>;
  rawUsage: Record<string, unknown>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMIT_META: Record<string, { label: string; icon: React.ReactNode }> = {
  contacts:      { label: 'Contacts',       icon: <Users className="w-4 h-4" /> },
  emails:        { label: 'Emails / month',  icon: <Mail className="w-4 h-4" /> },
  aiGenerations: { label: 'AI Generations',  icon: <Sparkles className="w-4 h-4" /> },
  sequences:     { label: 'Sequences',       icon: <GitBranch className="w-4 h-4" /> },
  campaigns:     { label: 'Campaigns',       icon: <Megaphone className="w-4 h-4" /> },
  users:         { label: 'Team Members',    icon: <UserCheck className="w-4 h-4" /> },
};

const FEATURE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  sequences:            { label: 'Sequences',              icon: <GitBranch className="w-4 h-4" /> },
  campaigns:            { label: 'Campaigns',              icon: <Megaphone className="w-4 h-4" /> },
  aiGeneration:         { label: 'AI Generation',          icon: <Sparkles className="w-4 h-4" /> },
  phoneDialer:          { label: 'Phone Dialer',           icon: <Phone className="w-4 h-4" /> },
  coaching:             { label: 'Coaching & Intel',        icon: <GraduationCap className="w-4 h-4" /> },
  customBranding:       { label: 'Custom Branding',        icon: <Palette className="w-4 h-4" /> },
  apiAccess:            { label: 'API Access',             icon: <Key className="w-4 h-4" /> },
  linkedinIntegration:  { label: 'LinkedIn Integration',   icon: <Linkedin className="w-4 h-4" /> },
  automations:          { label: 'Automations',            icon: <Zap className="w-4 h-4" /> },
  aiBrain:              { label: 'AI Brain',               icon: <Brain className="w-4 h-4" /> },
  calendarBooking:      { label: 'Calendar Booking',       icon: <Calendar className="w-4 h-4" /> },
  customDomain:         { label: 'Custom Domain',          icon: <Globe className="w-4 h-4" /> },
  advancedRoles:        { label: 'Advanced Roles',         icon: <Shield className="w-4 h-4" /> },
};

const PLAN_COLORS: Record<string, string> = {
  free:    'bg-gray-600 text-gray-200',
  starter: 'bg-blue-600 text-blue-100',
  pro:     'bg-purple-600 text-purple-100',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function barColor(pct: number): string {
  if (pct > 80) return 'bg-red-500';
  if (pct >= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UsageDashboardPage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch('/api/settings/usage');
        if (!res.ok) throw new Error(`Failed to load usage data (${res.status})`);
        const json = await res.json();
        setData(json);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchUsage();
  }, []);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          {error ?? 'Failed to load usage data.'}
        </div>
      </div>
    );
  }

  const { plan, planDisplayName, limits, features } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-gray-400" />
          <h1 className="text-2xl font-semibold text-white">Usage &amp; Limits</h1>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${
            PLAN_COLORS[plan] ?? PLAN_COLORS.free
          }`}
        >
          {planDisplayName || plan} Plan
        </span>
      </div>

      {/* ── Usage Bars ─────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-medium text-white mb-5">Resource Usage</h2>
        <div className="space-y-5">
          {Object.entries(limits).map(([key, info]) => {
            const meta = LIMIT_META[key] ?? { label: key, icon: null };
            const isUnlimited = info.limit === -1;
            const pct = isUnlimited ? 0 : Math.min(info.percentage, 100);

            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-2 text-sm text-gray-300">
                    {meta.icon}
                    {meta.label}
                  </span>
                  <span className="text-sm text-gray-400">
                    {isUnlimited ? (
                      <span className="text-green-400 font-medium">
                        {info.current.toLocaleString()} / Unlimited
                      </span>
                    ) : (
                      <>
                        <span className="text-white font-medium">
                          {info.current.toLocaleString()}
                        </span>
                        {' / '}
                        {info.limit.toLocaleString()}
                      </>
                    )}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  {!isUnlimited && (
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                  {isUnlimited && (
                    <div className="h-full rounded-full bg-green-500/30 w-full" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Feature Matrix ─────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-medium text-white mb-5">Plan Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(features).map(([key, enabled]) => {
            const meta = FEATURE_META[key] ?? { label: key, icon: null };
            return (
              <div
                key={key}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-800/50"
              >
                <span className="text-gray-400">{meta.icon}</span>
                <span className="flex-1 text-sm text-gray-300">{meta.label}</span>
                {enabled ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <X className="w-4 h-4 text-gray-600" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Upgrade CTA ────────────────────────────────────────────────────── */}
      {plan !== 'pro' && (
        <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-purple-700/50 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-white font-medium mb-1">
              Unlock more with an upgrade
            </h3>
            <p className="text-sm text-gray-400">
              Upgrade your plan to access higher limits, advanced features, and priority support.
            </p>
          </div>
          <a
            href="#"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            Upgrade Plan
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>
      )}
    </div>
  );
}
