'use client';

import {
  BarChart3, TrendingUp, TrendingDown, Eye, MousePointerClick,
  Reply, Mail, AlertTriangle, Users, CheckCircle, ArrowRight,
  Clock,
} from 'lucide-react';
import type { StepMetrics, SequenceAnalyticsData } from '@/lib/types';
import { STEP_TYPE_CONFIG } from './StepNode';

interface SequenceAnalyticsProps {
  analytics: SequenceAnalyticsData;
}

export default function SequenceAnalytics({ analytics }: SequenceAnalyticsProps) {
  const { step_metrics } = analytics;
  const maxSent = Math.max(...step_metrics.map(m => m.sent_count), 1);

  return (
    <div className="space-y-6">
      {/* Overview KPIs */}
      <div className="grid grid-cols-5 gap-3">
        <KpiCard label="Total Enrolled" value={analytics.total_enrolled} icon={Users} color="text-blue-400" />
        <KpiCard label="Active" value={analytics.active_enrolled} icon={Mail} color="text-green-400" />
        <KpiCard label="Completed" value={analytics.completed} icon={CheckCircle} color="text-gray-400" />
        <KpiCard label="Replied" value={analytics.replied} icon={Reply} color="text-cyan-400" />
        <KpiCard label="Booked" value={analytics.booked} icon={CheckCircle} color="text-purple-400" />
      </div>

      {/* Drop-off Funnel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-white">Step-by-Step Drop-off</h3>
        </div>

        {step_metrics.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No execution data yet. Enroll contacts and run the sequence to see analytics.</p>
        ) : (
          <div className="space-y-2">
            {step_metrics.map((metric, index) => {
              const config = STEP_TYPE_CONFIG[metric.step_type as string] || STEP_TYPE_CONFIG.email;
              const Icon = config.icon;
              const barWidth = (metric.sent_count / maxSent) * 100;
              const prevSent = index > 0 ? step_metrics[index - 1].sent_count : metric.sent_count;
              const dropoff = prevSent > 0 ? ((prevSent - metric.sent_count) / prevSent * 100) : 0;

              return (
                <div key={metric.step_id} className="group">
                  <div className="flex items-center gap-3">
                    {/* Step indicator */}
                    <div className="flex items-center gap-2 w-[120px] flex-shrink-0">
                      <div className={`w-6 h-6 rounded ${config.bgColor} flex items-center justify-center`}>
                        <Icon className="w-3 h-3 text-white" />
                      </div>
                      <div>
                        <span className="text-xs font-medium text-white">Step {metric.step_order}</span>
                        {metric.branch_condition && (
                          <span className="text-[9px] text-gray-500 block">{metric.branch_condition}</span>
                        )}
                      </div>
                    </div>

                    {/* Bar */}
                    <div className="flex-1 relative">
                      <div className="h-8 bg-gray-800 rounded-lg overflow-hidden relative">
                        {/* Sent bar (full) */}
                        <div
                          className="h-full bg-gray-700 rounded-lg transition-all duration-300 absolute left-0 top-0"
                          style={{ width: `${barWidth}%` }}
                        />
                        {/* Opened bar (overlay) */}
                        {metric.sent_count > 0 && (
                          <div
                            className="h-full bg-blue-600/40 rounded-lg transition-all duration-300 absolute left-0 top-0"
                            style={{ width: `${(metric.opened_count / maxSent) * 100}%` }}
                          />
                        )}
                        {/* Replied bar (overlay) */}
                        {metric.replied_count > 0 && (
                          <div
                            className="h-full bg-green-600/40 rounded-lg transition-all duration-300 absolute left-0 top-0"
                            style={{ width: `${(metric.replied_count / maxSent) * 100}%` }}
                          />
                        )}

                        {/* Labels inside bar */}
                        <div className="absolute inset-0 flex items-center px-2.5 gap-4">
                          <span className="text-[10px] font-medium text-gray-300 z-10">{metric.sent_count} sent</span>
                          {metric.opened_count > 0 && (
                            <span className="text-[10px] text-blue-300 z-10">{metric.opened_count} opened</span>
                          )}
                          {metric.replied_count > 0 && (
                            <span className="text-[10px] text-green-300 z-10">{metric.replied_count} replied</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-3 w-[200px] flex-shrink-0">
                      <MetricBadge value={metric.open_rate} label="open" icon={Eye} color="text-blue-400" />
                      <MetricBadge value={metric.click_rate} label="click" icon={MousePointerClick} color="text-cyan-400" />
                      <MetricBadge value={metric.reply_rate} label="reply" icon={Reply} color="text-green-400" />
                    </div>

                    {/* Drop-off indicator */}
                    {index > 0 && dropoff > 0 && (
                      <div className="w-[60px] flex-shrink-0 text-right">
                        <span className={`text-[10px] font-medium ${dropoff > 30 ? 'text-red-400' : dropoff > 15 ? 'text-yellow-400' : 'text-gray-500'}`}>
                          -{dropoff.toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Drop-off connector between steps */}
                  {index < step_metrics.length - 1 && (
                    <div className="flex items-center pl-[132px] py-0.5">
                      <div className="w-px h-3 bg-gray-800 ml-3" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Channel Performance */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-white">Channel Performance</h3>
        </div>

        <ChannelBreakdown metrics={step_metrics} />
      </div>

      {/* Sequence Optimization Insights */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          <h3 className="text-sm font-semibold text-white">Optimization Insights</h3>
        </div>

        <InsightsList metrics={step_metrics} analytics={analytics} />
      </div>
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Users; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function MetricBadge({ value, label, icon: Icon, color }: { value: number; label: string; icon: typeof Eye; color: string }) {
  return (
    <div className="flex items-center gap-0.5">
      <Icon className={`w-2.5 h-2.5 ${color}`} />
      <span className={`text-[10px] font-medium ${color}`}>{value}%</span>
    </div>
  );
}

function ChannelBreakdown({ metrics }: { metrics: StepMetrics[] }) {
  // Aggregate by step_type
  type ChannelMetrics = { sent: number; opened: number; clicked: number; replied: number; bounced: number };
  const channels: Record<string, ChannelMetrics> = {};

  for (const m of metrics) {
    const key = (m as unknown as { step_type: string }).step_type || 'email';
    if (!channels[key]) channels[key] = { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };
    channels[key].sent += m.sent_count;
    channels[key].opened += m.opened_count;
    channels[key].clicked += m.clicked_count;
    channels[key].replied += m.replied_count;
    channels[key].bounced += m.bounced_count;
  }

  if (Object.keys(channels).length === 0) {
    return <p className="text-sm text-gray-500 text-center py-4">No channel data yet</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(channels).map(([channel, stats]) => {
        const config = STEP_TYPE_CONFIG[channel] || STEP_TYPE_CONFIG.email;
        const Icon = config.icon;
        const openRate = stats.sent > 0 ? (stats.opened / stats.sent * 100) : 0;
        const replyRate = stats.sent > 0 ? (stats.replied / stats.sent * 100) : 0;

        return (
          <div key={channel} className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6 h-6 rounded ${config.bgColor} flex items-center justify-center`}>
                <Icon className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-medium text-white">{config.label}</span>
              <span className="text-[10px] text-gray-500 ml-auto">{stats.sent} sent</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-bold text-blue-400">{openRate.toFixed(1)}%</p>
                <p className="text-[9px] text-gray-500">Open</p>
              </div>
              <div>
                <p className="text-sm font-bold text-cyan-400">{stats.sent > 0 ? (stats.clicked / stats.sent * 100).toFixed(1) : '0.0'}%</p>
                <p className="text-[9px] text-gray-500">Click</p>
              </div>
              <div>
                <p className="text-sm font-bold text-green-400">{replyRate.toFixed(1)}%</p>
                <p className="text-[9px] text-gray-500">Reply</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InsightsList({ metrics, analytics }: { metrics: StepMetrics[]; analytics: SequenceAnalyticsData }) {
  const insights: { text: string; type: 'warning' | 'success' | 'info' }[] = [];

  // Find best performing step
  const bestOpen = metrics.reduce((best, m) => m.open_rate > (best?.open_rate || 0) ? m : best, null as StepMetrics | null);
  if (bestOpen && bestOpen.open_rate > 0) {
    insights.push({
      text: `Step ${bestOpen.step_order} has the highest open rate at ${bestOpen.open_rate}%`,
      type: 'success',
    });
  }

  // Find worst performing step
  const worstOpen = metrics.filter(m => m.sent_count > 5).reduce((worst, m) => m.open_rate < (worst?.open_rate || 100) ? m : worst, null as StepMetrics | null);
  if (worstOpen && worstOpen.open_rate < 20 && worstOpen.sent_count > 5) {
    insights.push({
      text: `Step ${worstOpen.step_order} has a low open rate of ${worstOpen.open_rate}%. Consider changing the subject line or channel.`,
      type: 'warning',
    });
  }

  // Check for high bounce rate
  const highBounce = metrics.find(m => m.bounced_count > 0 && m.bounced_count / m.sent_count > 0.1);
  if (highBounce) {
    insights.push({
      text: `Step ${highBounce.step_order} has ${highBounce.bounced_count} bounces. Clean up your contact list.`,
      type: 'warning',
    });
  }

  // Completion rate
  if (analytics.total_enrolled > 0) {
    const completionRate = (analytics.completed / analytics.total_enrolled * 100);
    if (completionRate < 30) {
      insights.push({
        text: `Only ${completionRate.toFixed(0)}% of enrolled contacts complete the sequence. Consider shortening it.`,
        type: 'info',
      });
    }
  }

  // Optimal length analysis
  if (metrics.length > 5) {
    const lastWithReplies = [...metrics].reverse().findIndex(m => m.replied_count > 0);
    if (lastWithReplies > 2) {
      insights.push({
        text: `Last ${lastWithReplies} steps had no replies. Sequence might be too long.`,
        type: 'info',
      });
    }
  }

  if (insights.length === 0) {
    insights.push({ text: 'Not enough data for insights yet. Keep running the sequence!', type: 'info' });
  }

  const typeColors = {
    warning: 'text-yellow-400 bg-yellow-900/20 border-yellow-800/30',
    success: 'text-green-400 bg-green-900/20 border-green-800/30',
    info: 'text-blue-400 bg-blue-900/20 border-blue-800/30',
  };

  return (
    <div className="space-y-2">
      {insights.map((insight, i) => (
        <div key={i} className={`text-xs p-3 rounded-lg border ${typeColors[insight.type]}`}>
          {insight.text}
        </div>
      ))}
    </div>
  );
}
