import { query, queryShipday } from '@/lib/db';
import { Contact, Touchpoint } from '@/lib/types';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Mail, Phone, Globe, Linkedin,
  Star, Zap, Clock, Calendar, Tag, ExternalLink,
  Send, PhoneCall, MessageSquare, MousePointerClick, Eye,
  Target, GitBranch, TrendingUp,
} from 'lucide-react';
import ClickToCall from '@/components/phone/ClickToCall';

interface EnrollmentInfo {
  enrollment_id: number;
  sequence_name: string;
  status: string;
  current_step: number;
  started_at: string;
}

interface TaskInfo {
  task_id: number;
  task_type: string;
  title: string;
  status: string;
  priority: number;
  due_at: string | null;
}

interface CalendlyInfo {
  calendly_id: number;
  event_name: string | null;
  scheduled_at: string;
  cancelled: boolean;
}

interface BdrLeadInfo {
  lead_id: string;
  status: string;
  business_name: string | null;
  email_angle: string | null;
  fit_score: number | null;
  intent_score: number | null;
  total_score: number | null;
  emails_sent: number;
  emails_opened: number;
  emails_replied: number;
}

interface DealInfo {
  deal_id: string;
  company_name: string | null;
  pipeline_stage: string | null;
  agent_status: string | null;
  urgency_level: string | null;
  demo_date: string | null;
  drafts_count: number;
}

interface ContactDetail extends Contact {
  touchpoints: Touchpoint[];
  enrollments: EnrollmentInfo[];
  tasks: TaskInfo[];
  calendly_events: CalendlyInfo[];
  bdr_lead: BdrLeadInfo | null;
  deal: DealInfo | null;
}

async function getContact(id: string): Promise<ContactDetail | null> {
  try {
    const contactRows = await query<Contact>(
      `SELECT * FROM crm.contacts WHERE contact_id = $1`,
      [parseInt(id)]
    );
    if (contactRows.length === 0) return null;
    const contact = contactRows[0];

    const touchpoints = await query<Touchpoint>(
      `SELECT * FROM crm.touchpoints WHERE contact_id = $1 ORDER BY occurred_at DESC LIMIT 50`,
      [contact.contact_id]
    );

    const enrollments = await query<EnrollmentInfo>(
      `SELECT e.enrollment_id, s.name as sequence_name, e.status, e.current_step, e.started_at
       FROM crm.sequence_enrollments e
       JOIN crm.sequences s ON s.sequence_id = e.sequence_id
       WHERE e.contact_id = $1 ORDER BY e.started_at DESC`,
      [contact.contact_id]
    );

    const tasks = await query<TaskInfo>(
      `SELECT task_id, task_type, title, status, priority, due_at
       FROM crm.task_queue WHERE contact_id = $1 ORDER BY due_at ASC NULLS LAST`,
      [contact.contact_id]
    );

    const calendly_events = await query<CalendlyInfo>(
      `SELECT calendly_id, event_name, scheduled_at, cancelled
       FROM crm.calendly_events WHERE contact_id = $1 ORDER BY scheduled_at DESC`,
      [contact.contact_id]
    );

    // BDR lead data (if linked)
    let bdr_lead: BdrLeadInfo | null = null;
    if (contact.bdr_lead_id) {
      try {
        const leadRows = await query<{
          lead_id: string; status: string; business_name: string | null;
          email_angle: string | null; fit_score: number | null;
          intent_score: number | null; total_score: number | null;
        }>(
          `SELECT lead_id, status, business_name, email_angle, fit_score, intent_score, total_score
           FROM bdr.leads WHERE lead_id = $1`,
          [contact.bdr_lead_id]
        );
        if (leadRows.length > 0) {
          const l = leadRows[0];
          const sendStats = await query<{ sent: string; opened: string; replied: string }>(
            `SELECT COUNT(*)::text as sent,
                    COUNT(opened_at)::text as opened,
                    COUNT(replied_at)::text as replied
             FROM bdr.email_sends WHERE lead_id = $1`,
            [contact.bdr_lead_id]
          );
          bdr_lead = {
            ...l,
            emails_sent: parseInt(sendStats[0]?.sent || '0'),
            emails_opened: parseInt(sendStats[0]?.opened || '0'),
            emails_replied: parseInt(sendStats[0]?.replied || '0'),
          };
        }
      } catch { /* BDR data optional */ }
    }

    // Post-demo deal data (if linked)
    let deal: DealInfo | null = null;
    if (contact.shipday_deal_id) {
      try {
        const dealRows = await queryShipday<{
          deal_id: string; company_name: string | null; pipeline_stage: string | null;
          agent_status: string | null; urgency_level: string | null; demo_date: string | null;
        }>(
          `SELECT deal_id, company_name, pipeline_stage, agent_status, urgency_level, demo_date::text
           FROM shipday.deals WHERE deal_id = $1`,
          [contact.shipday_deal_id]
        );
        if (dealRows.length > 0) {
          const draftCount = await queryShipday<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM shipday.email_drafts WHERE deal_id = $1`,
            [contact.shipday_deal_id]
          );
          deal = {
            ...dealRows[0],
            drafts_count: parseInt(draftCount[0]?.count || '0'),
          };
        }
      } catch { /* Deal data optional */ }
    }

    return { ...contact, touchpoints, enrollments, tasks, calendly_events, bdr_lead, deal };
  } catch (error) {
    console.error('[contact detail] error:', error);
    return null;
  }
}

const stageColors: Record<string, string> = {
  raw: 'bg-gray-600',
  enriched: 'bg-blue-600',
  outreach: 'bg-cyan-600',
  engaged: 'bg-yellow-600',
  demo_completed: 'bg-orange-600',
  negotiation: 'bg-purple-600',
  won: 'bg-green-600',
  lost: 'bg-red-600',
  nurture: 'bg-pink-600',
};

const channelIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  phone: PhoneCall,
  linkedin: Linkedin,
  sms: MessageSquare,
  calendly: Calendar,
  manual: Eye,
};

const eventTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  sent: Send,
  opened: MousePointerClick,
  replied: MessageSquare,
  clicked: MousePointerClick,
  call_completed: PhoneCall,
  booked: Calendar,
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white ${stageColors[stage] || 'bg-gray-600'}`}>
      {stage.replace('_', ' ')}
    </span>
  );
}

function SourceBadge({ label, linked }: { label: string; linked: boolean }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${linked ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800/50' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>
      {label}
    </span>
  );
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await getContact(id);

  if (!contact) {
    return (
      <div className="p-6">
        <Link href="/contacts" className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Contacts
        </Link>
        <div className="mt-12 text-center">
          <p className="text-gray-500">Contact not found.</p>
        </div>
      </div>
    );
  }

  const fullName =
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || 'Unknown Contact';

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Back link */}
      <Link href="/contacts" className="text-sm text-gray-400 hover:text-white flex items-center gap-1 w-fit">
        <ArrowLeft className="w-4 h-4" /> Contacts
      </Link>

      {/* Contact Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{fullName}</h1>
              <StageBadge stage={contact.lifecycle_stage} />
            </div>
            {contact.title && (
              <p className="text-sm text-gray-400">{contact.title}</p>
            )}
            {contact.business_name && (
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-300">{contact.business_name}</span>
              </div>
            )}
          </div>

          {/* Scores */}
          <div className="flex gap-4">
            <div className="text-center">
              <div className="flex items-center gap-1 justify-center">
                <Star className="w-4 h-4 text-yellow-500" />
                <span className="text-xl font-bold text-yellow-500">{contact.lead_score}</span>
              </div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Lead Score</span>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-1 justify-center">
                <Zap className="w-4 h-4 text-cyan-500" />
                <span className="text-xl font-bold text-cyan-500">{contact.engagement_score}</span>
              </div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Engagement</span>
            </div>
          </div>
        </div>

        {/* Contact Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-5 border-t border-gray-800">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white">
              <Mail className="w-4 h-4 text-gray-500" /> <span className="truncate">{contact.email}</span>
            </a>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2">
              <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white">
                <Phone className="w-4 h-4 text-gray-500" /> {contact.phone}
              </a>
              <ClickToCall contactId={contact.contact_id} phone={contact.phone} size="sm" />
            </div>
          )}
          {contact.linkedin_url && (
            <a href={contact.linkedin_url} target="_blank" rel="noopener" className="flex items-center gap-2 text-sm text-gray-300 hover:text-white">
              <Linkedin className="w-4 h-4 text-gray-500" /> LinkedIn <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {contact.website && (
            <a href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`} target="_blank" rel="noopener" className="flex items-center gap-2 text-sm text-gray-300 hover:text-white">
              <Globe className="w-4 h-4 text-gray-500" /> Website <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Source System Links */}
        <div className="flex items-center gap-2 mt-4">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Sources:</span>
          <SourceBadge label="BDR" linked={!!contact.bdr_lead_id} />
          <SourceBadge label="Post-Demo" linked={!!contact.shipday_deal_id} />
          <SourceBadge label="Win-Call" linked={!!contact.wincall_deal_id} />
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <Tag className="w-3.5 h-3.5 text-gray-500" />
            {contact.tags.map((tag) => (
              <span key={tag} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Metadata */}
        {contact.metadata && Object.keys(contact.metadata).length > 0 && (
          <details className="mt-4">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
              Metadata
            </summary>
            <pre className="mt-2 text-[10px] text-gray-500 bg-gray-800/50 rounded p-3 overflow-x-auto">
              {JSON.stringify(contact.metadata, null, 2)}
            </pre>
          </details>
        )}
      </div>

      {/* Two column layout: Timeline + Side panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Timeline */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Activity Timeline</h2>

          {contact.touchpoints.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No touchpoints recorded yet</p>
              <p className="text-xs text-gray-600 mt-1">
                Enroll this contact in a sequence to start tracking activity
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {contact.touchpoints.map((tp) => {
                const ChannelIcon = channelIcons[tp.channel] || Eye;
                const EventIcon = eventTypeIcons[tp.event_type] || ChannelIcon;

                return (
                  <div key={tp.touchpoint_id} className="flex gap-3 py-2.5 border-b border-gray-800/50 last:border-0">
                    <div className="shrink-0 mt-0.5">
                      <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center">
                        <EventIcon className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-200">
                          <span className="capitalize">{tp.channel}</span>
                          {' · '}
                          <span className="text-gray-400">{tp.event_type.replace(/_/g, ' ')}</span>
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tp.direction === 'outbound' ? 'bg-blue-900/30 text-blue-400' : 'bg-green-900/30 text-green-400'}`}>
                          {tp.direction}
                        </span>
                      </div>
                      {tp.subject && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{tp.subject}</p>
                      )}
                      {tp.body_preview && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{tp.body_preview}</p>
                      )}
                      <span className="text-[10px] text-gray-600 mt-0.5 block">
                        {formatDateTime(tp.occurred_at)} · {tp.source_system}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side Panels */}
        <div className="space-y-6">
          {/* Active Sequences */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Sequences</h3>
            {contact.enrollments.length === 0 ? (
              <p className="text-xs text-gray-500">Not enrolled in any sequence</p>
            ) : (
              <div className="space-y-2">
                {contact.enrollments.map((e) => (
                  <div key={e.enrollment_id} className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-200">{e.sequence_name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        e.status === 'active' ? 'bg-green-900/40 text-green-400' :
                        e.status === 'paused' ? 'bg-yellow-900/40 text-yellow-400' :
                        e.status === 'completed' ? 'bg-gray-800 text-gray-400' :
                        'bg-blue-900/40 text-blue-400'
                      }`}>
                        {e.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Step {e.current_step} · Started {formatDate(e.started_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Tasks</h3>
            {contact.tasks.length === 0 ? (
              <p className="text-xs text-gray-500">No pending tasks</p>
            ) : (
              <div className="space-y-2">
                {contact.tasks.map((t) => (
                  <div key={t.task_id} className="flex items-center gap-2 bg-gray-800/50 rounded-lg p-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      t.status === 'pending' ? 'bg-yellow-500' :
                      t.status === 'in_progress' ? 'bg-blue-500' :
                      t.status === 'completed' ? 'bg-green-500' : 'bg-gray-500'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-300 truncate">{t.title}</p>
                      <p className="text-[10px] text-gray-500">
                        {t.task_type.replace(/_/g, ' ')}
                        {t.due_at && ` · due ${formatDate(t.due_at)}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calendly */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Meetings</h3>
            {contact.calendly_events.length === 0 ? (
              <p className="text-xs text-gray-500">No meetings scheduled</p>
            ) : (
              <div className="space-y-2">
                {contact.calendly_events.map((evt) => (
                  <div key={evt.calendly_id} className="flex items-center gap-2 bg-gray-800/50 rounded-lg p-2.5">
                    <Calendar className={`w-4 h-4 shrink-0 ${evt.cancelled ? 'text-red-500' : 'text-green-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${evt.cancelled ? 'text-red-400 line-through' : 'text-gray-300'}`}>
                        {evt.event_name || 'Meeting'}
                      </p>
                      <p className="text-[10px] text-gray-500">{formatDate(evt.scheduled_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BDR Lead Data */}
          {contact.bdr_lead && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-blue-400" /> BDR Lead
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className="text-gray-300 capitalize">{contact.bdr_lead.status.replace(/_/g, ' ')}</span>
                </div>
                {contact.bdr_lead.email_angle && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Angle</span>
                    <span className="text-gray-300 capitalize">{contact.bdr_lead.email_angle.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {contact.bdr_lead.total_score !== null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Score</span>
                    <span className="text-gray-300">{contact.bdr_lead.total_score} (fit:{contact.bdr_lead.fit_score} + intent:{contact.bdr_lead.intent_score})</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800/50">
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{contact.bdr_lead.emails_sent}</div>
                    <div className="text-[10px] text-gray-500">Sent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{contact.bdr_lead.emails_opened}</div>
                    <div className="text-[10px] text-gray-500">Opened</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{contact.bdr_lead.emails_replied}</div>
                    <div className="text-[10px] text-gray-500">Replied</div>
                  </div>
                </div>
              </div>
              <Link href="/outbound" className="mt-3 flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300">
                View in Outbound <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            </div>
          )}

          {/* Post-Demo Deal */}
          {contact.deal && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-purple-400" /> Post-Demo Deal
              </h3>
              <div className="space-y-2 text-xs">
                {contact.deal.company_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Company</span>
                    <span className="text-gray-300">{contact.deal.company_name}</span>
                  </div>
                )}
                {contact.deal.pipeline_stage && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Stage</span>
                    <span className="text-gray-300 capitalize">{contact.deal.pipeline_stage.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {contact.deal.urgency_level && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Urgency</span>
                    <span className={`capitalize ${
                      contact.deal.urgency_level === 'high' ? 'text-red-400' :
                      contact.deal.urgency_level === 'medium' ? 'text-yellow-400' : 'text-gray-400'
                    }`}>{contact.deal.urgency_level}</span>
                  </div>
                )}
                {contact.deal.demo_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Demo</span>
                    <span className="text-gray-300">{formatDate(contact.deal.demo_date)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 pt-2 border-t border-gray-800/50">
                  <TrendingUp className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-400">{contact.deal.drafts_count} follow-up drafts</span>
                </div>
              </div>
              <Link href={`/followups/${contact.deal.deal_id}`} className="mt-3 flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300">
                View Campaign <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            </div>
          )}

          {/* Dates */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Dates</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-300">{formatDate(contact.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Updated</span>
                <span className="text-gray-300">{timeAgo(contact.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
