'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  Send,
  Users,
  Eye,
  MousePointerClick,
  Reply,
  BarChart3,
  Trophy,
} from 'lucide-react';
import { EmailTrackingNav } from '@/components/email-tracking/EmailTrackingNav';
import HeatmapChart from '@/components/email-tracking/HeatmapChart';
import TrendChart from '@/components/analytics/TrendChart';
import Link from 'next/link';

interface KPIs {
  emailsSent: number;
  uniqueRecipients: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;
  openRate: string;
  clickRate: string;
  replyRate: string;
  avgOpensPerEmail: string;
}

interface TopEmail {
  id: string;
  subject: string;
  to_email: string;
  open_count: number;
  click_count: number;
  replied: boolean;
  sent_at: string;
  contact_name: string | null;
}

interface DailyTrend {
  day: string;
  sent: string;
  opened: string;
  clicked: string;
}

interface ProductivityData {
  kpis: KPIs;
  sendHeatmap: number[][];
  openHeatmap: number[][];
  topEmails: TopEmail[];
  dailyTrend: DailyTrend[];
  period: string;
}

const periods = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
] as const;

export default function EmailProductivityPage() {
  const [data, setData] = useState<ProductivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('30d');
  const [trendMetric, setTrendMetric] = useState<'sent' | 'opened' | 'clicked'>('sent');

  const fetchData = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/email-tracking/productivity?period=${p}`);
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setData(await res.json());
    } catch (err) {
      console.error('[productivity] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load productivity data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [fetchData, period]);

  if (loading && !data) {
    return (
      <div className="p-6">
        <EmailTrackingNav />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <EmailTrackingNav />
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <p className="text-sm text-gray-300">{error}</p>
            <button
              onClick={() => fetchData(period)}
              className="text-xs text-blue-400 hover:text-blue-300 underline"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, sendHeatmap, openHeatmap, topEmails, dailyTrend } = data;

  const trendData = dailyTrend.map((t) => ({
    label: new Date(t.day).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    value: parseInt(t[trendMetric]),
  }));

  const trendColors: Record<string, string> = {
    sent: 'bg-gray-500',
    opened: 'bg-green-500',
    clicked: 'bg-blue-500',
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <EmailTrackingNav />

      {/* Header with period toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Productivity</h1>
          <p className="text-sm text-gray-400 mt-1">
            Sending patterns, engagement rates, and performance insights
          </p>
        </div>
        <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                period === p.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Send} label="Emails Sent" value={kpis.emailsSent} />
        <KpiCard icon={Users} label="Recipients" value={kpis.uniqueRecipients} />
        <KpiCard icon={Eye} label="Open Rate" value={`${kpis.openRate}%`} color="text-green-400" />
        <KpiCard
          icon={MousePointerClick}
          label="Click Rate"
          value={`${kpis.clickRate}%`}
          color="text-blue-400"
        />
        <KpiCard
          icon={Reply}
          label="Reply Rate"
          value={`${kpis.replyRate}%`}
          color="text-purple-400"
        />
        <KpiCard
          icon={BarChart3}
          label="Avg Opens/Email"
          value={kpis.avgOpensPerEmail}
          color="text-yellow-400"
        />
      </div>

      {/* Heatmaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <HeatmapChart title="When you send emails" grid={sendHeatmap} />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <HeatmapChart title="When your emails get opened" grid={openHeatmap} />
        </div>
      </div>

      {/* Daily Trend */}
      {dailyTrend.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">Daily Activity Trend</h3>
            <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5">
              {(['sent', 'opened', 'clicked'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setTrendMetric(m)}
                  className={`px-2.5 py-1 text-[10px] rounded-md transition-colors capitalize ${
                    trendMetric === m
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <TrendChart
            data={trendData}
            color={trendColors[trendMetric]}
            height={120}
          />
        </div>
      )}

      {/* Top Performing Emails */}
      {topEmails.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            Top Performing Emails
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left py-2">Subject</th>
                <th className="text-left py-2">Recipient</th>
                <th className="text-right py-2">Opens</th>
                <th className="text-right py-2">Clicks</th>
                <th className="text-right py-2">Replied</th>
                <th className="text-right py-2">Sent</th>
              </tr>
            </thead>
            <tbody>
              {topEmails.map((email) => (
                <tr
                  key={email.id}
                  className="border-t border-gray-800 hover:bg-gray-800/50 transition-colors"
                >
                  <td className="py-2.5">
                    <Link
                      href={`/email-tracking/${email.id}`}
                      className="text-gray-300 hover:text-white truncate block max-w-[220px]"
                    >
                      {email.subject || '(no subject)'}
                    </Link>
                  </td>
                  <td className="py-2.5 text-gray-400 truncate max-w-[140px]">
                    {email.contact_name?.trim() || email.to_email}
                  </td>
                  <td className="py-2.5 text-right text-green-400 font-medium">
                    {email.open_count}
                  </td>
                  <td className="py-2.5 text-right text-blue-400 font-medium">
                    {email.click_count}
                  </td>
                  <td className="py-2.5 text-right">
                    {email.replied ? (
                      <span className="text-purple-400">Yes</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-gray-500">
                    {new Date(email.sent_at).toLocaleDateString('en', {
                      month: 'short',
                      day: 'numeric',
                    })}
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

// Inline KPI card matching existing design system
function KpiCard({
  icon: Icon,
  label,
  value,
  color = 'text-white',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
