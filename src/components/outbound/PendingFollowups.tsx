'use client';

import { useState, useEffect } from 'react';
import { Loader2, Clock, Mail, Phone, MessageSquare, Zap, ChevronDown, ChevronUp } from 'lucide-react';

interface PendingEmail {
  id: number;
  lead_id: string;
  business_name: string | null;
  contact_name: string | null;
  step_number: number;
  status: string;
  channel: string;
  delay_days: number;
  scheduled_at: string | null;
  subject: string | null;
  angle: string | null;
  template_name: string | null;
  total_steps: number;
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  ready: { label: 'Ready', bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
  scheduled: { label: 'Scheduled', bg: 'bg-blue-500/15', text: 'text-blue-400' },
  pending: { label: 'Pending', bg: 'bg-gray-500/15', text: 'text-gray-400' },
};

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  call: Phone,
  sms: MessageSquare,
};

export default function PendingFollowups() {
  const [emails, setEmails] = useState<PendingEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch('/api/bdr/campaigns/pending')
      .then(res => res.json())
      .then(data => setEmails(data.pending || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (emails.length === 0) return null;

  const readyCount = emails.filter(e => e.status === 'ready').length;
  const scheduledCount = emails.filter(e => e.status === 'scheduled').length;
  const pendingCount = emails.filter(e => e.status === 'pending').length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Pending Follow-ups</span>
          <span className="text-xs text-gray-500">({emails.length})</span>
        </div>
        <div className="flex items-center gap-3">
          {readyCount > 0 && (
            <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded-full">
              {readyCount} ready
            </span>
          )}
          {scheduledCount > 0 && (
            <span className="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full">
              {scheduledCount} scheduled
            </span>
          )}
          {pendingCount > 0 && (
            <span className="text-[10px] bg-gray-500/15 text-gray-400 px-2 py-0.5 rounded-full">
              {pendingCount} pending
            </span>
          )}
          {collapsed ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {/* Table */}
      {!collapsed && (
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="text-gray-500 border-t border-b border-gray-800">
                <th className="text-left py-2 px-4 font-medium">Business</th>
                <th className="text-center py-2 px-3 font-medium">Step</th>
                <th className="text-center py-2 px-3 font-medium">Channel</th>
                <th className="text-left py-2 px-3 font-medium">Subject</th>
                <th className="text-center py-2 px-3 font-medium">Status</th>
                <th className="text-center py-2 px-3 font-medium">Delay</th>
                <th className="text-right py-2 px-4 font-medium">Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {emails.map(email => {
                const sc = statusConfig[email.status] || statusConfig.pending;
                const ChannelIcon = channelIcons[email.channel] || Zap;

                return (
                  <tr key={email.id} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                    <td className="py-2 px-4">
                      <div className="text-gray-200 truncate max-w-[180px]">
                        {email.business_name || 'Unknown'}
                      </div>
                      {email.contact_name && (
                        <div className="text-[10px] text-gray-600">{email.contact_name}</div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-gray-300">
                        {email.step_number}/{email.total_steps}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <ChannelIcon className="w-3.5 h-3.5 text-gray-400 mx-auto" />
                    </td>
                    <td className="py-2 px-3">
                      <div className="text-gray-400 truncate max-w-[220px]">
                        {email.subject || '--'}
                      </div>
                      {email.angle && (
                        <div className="text-[10px] text-gray-600">{email.angle.replace(/_/g, ' ')}</div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {email.delay_days > 0 ? (
                        <span className="text-gray-400">+{email.delay_days}d</span>
                      ) : (
                        <span className="text-gray-600">--</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {email.scheduled_at ? (
                        <div>
                          <div className="text-gray-300">
                            {new Date(email.scheduled_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                          </div>
                          <div className="text-[10px] text-gray-600">
                            {new Date(email.scheduled_at).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-600">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
