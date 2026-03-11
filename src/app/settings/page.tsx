'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Building2, Users, Save, Plus, Shield, Mail, User, Check, X,
  Brain, Trash2, FileText, Loader2,
  Sparkles, Webhook, Bell, Send, Download, Clock, Zap, AlertCircle,
  CheckCircle, XCircle, RefreshCw, Eye, Phone, Calendar, Server,
  ToggleLeft, ToggleRight, Key,
} from 'lucide-react';
import DOMPurify from 'dompurify';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Org {
  org_id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  domain: string | null;
  settings: Record<string, unknown>;
  plan: string;
}

interface OrgUser {
  user_id: number;
  email: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface BrainContent {
  id: string;
  content_type: string;
  title: string;
  raw_text: string | null;
  key_claims: string[];
  value_props: string[];
  pain_points_addressed: string[];
  source_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from_name: string;
  from_email: string;
  encryption: string;
}

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  type: 'inbound' | 'outbound';
  last_triggered?: string;
  status?: 'healthy' | 'degraded' | 'down' | 'unknown';
  last_checked?: string;
}

interface IntegrationConfig {
  n8n_webhooks: WebhookConfig[];
  twilio: { account_sid: string; auth_token: string; phone_number: string };
  calendly: { api_key: string; event_url: string };
  fathom: { api_key: string };
}

interface SendingConfig {
  daily_limit: number;
  warmup_enabled: boolean;
  warmup_start: number;
  warmup_increment: number;
  warmup_target: number;
  warmup_current_day: number;
  send_window_start: string;
  send_window_end: string;
  send_window_timezone: string;
  send_days: string[];
  delay_between_emails_min: number;
  delay_between_emails_max: number;
}

interface NotificationConfig {
  email_replies: boolean;
  email_demos_booked: boolean;
  email_hot_leads: boolean;
  sms_replies: boolean;
  sms_demos_booked: boolean;
  sms_hot_leads: boolean;
  daily_summary: boolean;
  weekly_report: boolean;
  notify_phone: string;
  notify_email: string;
}

type SettingsTab = 'profile' | 'email' | 'integrations' | 'sending' | 'notifications' | 'team' | 'export';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [org, setOrg] = useState<Org | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Profile form
  const [orgName, setOrgName] = useState('');
  const [orgDomain, setOrgDomain] = useState('');
  const [orgLogo, setOrgLogo] = useState('');

  // SMTP
  const [smtp, setSmtp] = useState<SmtpConfig>({ host: '', port: 587, username: '', password: '', from_name: '', from_email: '', encryption: 'tls' });

  // Signature
  const [signature, setSignature] = useState('');
  const [signaturePreview, setSignaturePreview] = useState(false);
  const [changeLevel, setChangeLevel] = useState(3);
  const [regenerating, setRegenerating] = useState(false);

  // Integrations
  const [integrations, setIntegrations] = useState<IntegrationConfig>({
    n8n_webhooks: [],
    twilio: { account_sid: '', auth_token: '', phone_number: '' },
    calendly: { api_key: '', event_url: '' },
    fathom: { api_key: '' },
  });

  // Webhooks
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  // Sending
  const [sending, setSendingState] = useState<SendingConfig>({
    daily_limit: 50, warmup_enabled: false, warmup_start: 10, warmup_increment: 5,
    warmup_target: 50, warmup_current_day: 0, send_window_start: '08:00',
    send_window_end: '18:00', send_window_timezone: 'America/Denver',
    send_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    delay_between_emails_min: 60, delay_between_emails_max: 180,
  });

  // Notifications
  const [notifications, setNotifications] = useState<NotificationConfig>({
    email_replies: true, email_demos_booked: true, email_hot_leads: true,
    sms_replies: false, sms_demos_booked: false, sms_hot_leads: false,
    daily_summary: true, weekly_report: true, notify_phone: '', notify_email: '',
  });

  // Team
  const [showAddUser, setShowAddUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('member');

  // Brain
  const [brainContent, setBrainContent] = useState<BrainContent[]>([]);

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [exportTables, setExportTables] = useState<string[]>(['contacts', 'deals', 'campaigns', 'leads', 'brain']);

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadOrg = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/org');
      if (res.ok) {
        const data = await res.json();
        setOrg(data);
        setOrgName(data.name || '');
        setOrgDomain(data.domain || '');
        setOrgLogo(data.logo_url || '');
      }
    } catch (e) { console.error('Failed to load org:', e); }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) { console.error('Failed to load users:', e); }
  }, []);

  const loadSmtp = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/smtp');
      if (res.ok) {
        const data = await res.json();
        if (data.smtp) setSmtp(data.smtp);
      }
    } catch (e) { console.error('Failed to load SMTP:', e); }
  }, []);

  const loadSignature = useCallback(async () => {
    try {
      const res = await fetch('/api/signature');
      if (res.ok) {
        const data = await res.json();
        setSignature(data.signature || '');
      }
    } catch (e) { console.error('Failed to load signature:', e); }
  }, []);

  const loadIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/integrations');
      if (res.ok) {
        const data = await res.json();
        if (data.integrations) {
          setIntegrations(data.integrations);
          setWebhooks(data.integrations.n8n_webhooks || []);
        }
      }
    } catch (e) { console.error('Failed to load integrations:', e); }
  }, []);

  const loadSending = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/sending');
      if (res.ok) {
        const data = await res.json();
        if (data.sending) setSendingState(data.sending);
      }
    } catch (e) { console.error('Failed to load sending:', e); }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/notifications');
      if (res.ok) {
        const data = await res.json();
        if (data.notifications) setNotifications(data.notifications);
      }
    } catch (e) { console.error('Failed to load notifications:', e); }
  }, []);

  const loadBrain = useCallback(async () => {
    try {
      const res = await fetch('/api/brain');
      if (res.ok) {
        const data = await res.json();
        setBrainContent(data.content || data || []);
      }
    } catch (e) { console.error('Failed to load brain:', e); }
  }, []);

  useEffect(() => {
    Promise.all([loadOrg(), loadUsers(), loadSmtp(), loadSignature(), loadIntegrations(), loadSending(), loadNotifications(), loadBrain()])
      .finally(() => setLoading(false));
  }, [loadOrg, loadUsers, loadSmtp, loadSignature, loadIntegrations, loadSending, loadNotifications, loadBrain]);

  // ─── Save Handlers ────────────────────────────────────────────────────────

  function showSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveProfile() {
    setSaving(true);
    await fetch('/api/admin/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: orgName, domain: orgDomain, logo_url: orgLogo }),
    });
    setSaving(false);
    showSaved();
  }

  async function saveSmtp() {
    setSaving(true);
    await fetch('/api/settings/smtp', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(smtp),
    });
    setSaving(false);
    showSaved();
  }

  async function saveSignature() {
    setSaving(true);
    await fetch('/api/admin/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { email_signature: signature } }),
    });
    setSaving(false);
    showSaved();
  }

  async function scrapeSignature() {
    setRegenerating(true);
    const res = await fetch('/api/signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scrape' }),
    });
    if (res.ok) {
      const data = await res.json();
      setSignature(data.signature);
    }
    setRegenerating(false);
  }

  async function regenerateSignature() {
    setRegenerating(true);
    const res = await fetch('/api/signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'regenerate', current_signature: signature, change_level: changeLevel }),
    });
    if (res.ok) {
      const data = await res.json();
      setSignature(data.signature);
    }
    setRegenerating(false);
  }

  async function saveIntegrations() {
    setSaving(true);
    await fetch('/api/settings/integrations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...integrations, n8n_webhooks: webhooks }),
    });
    setSaving(false);
    showSaved();
  }

  async function testWebhook(webhook: WebhookConfig) {
    setTestingWebhook(webhook.id);
    try {
      const res = await fetch('/api/settings/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', url: webhook.url }),
      });
      const data = await res.json();
      setWebhooks(prev => prev.map(w =>
        w.id === webhook.id
          ? { ...w, status: data.status, last_checked: new Date().toISOString() }
          : w
      ));
    } catch {
      setWebhooks(prev => prev.map(w =>
        w.id === webhook.id
          ? { ...w, status: 'down' as const, last_checked: new Date().toISOString() }
          : w
      ));
    }
    setTestingWebhook(null);
  }

  async function testAllWebhooks() {
    for (const wh of webhooks) {
      await testWebhook(wh);
    }
  }

  async function saveSending() {
    setSaving(true);
    await fetch('/api/settings/sending', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sending),
    });
    setSaving(false);
    showSaved();
  }

  async function saveNotifications() {
    setSaving(true);
    await fetch('/api/settings/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notifications),
    });
    setSaving(false);
    showSaved();
  }

  async function addUser() {
    if (!newEmail.trim() || !newPassword.trim()) return;
    setSaving(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword, display_name: newName, role: newRole }),
    });
    if (res.ok) {
      setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('member');
      setShowAddUser(false);
      await loadUsers();
    }
    setSaving(false);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch('/api/settings/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: exportFormat, tables: exportTables }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `saleshub-export.${exportFormat}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) { console.error('Export failed:', e); }
    setExporting(false);
  }

  // ─── UI Helpers ───────────────────────────────────────────────────────────

  function addWebhook() {
    setWebhooks(prev => [...prev, {
      id: crypto.randomUUID(),
      name: '',
      url: '',
      type: 'outbound',
      status: 'unknown',
    }]);
  }

  function removeWebhook(id: string) {
    setWebhooks(prev => prev.filter(w => w.id !== id));
  }

  function updateWebhook(id: string, field: string, value: string) {
    setWebhooks(prev => prev.map(w => w.id === id ? { ...w, [field]: value } : w));
  }

  function toggleDay(day: string) {
    setSendingState(prev => ({
      ...prev,
      send_days: prev.send_days.includes(day)
        ? prev.send_days.filter(d => d !== day)
        : [...prev.send_days, day],
    }));
  }

  function toggleExportTable(table: string) {
    setExportTables(prev =>
      prev.includes(table) ? prev.filter(t => t !== table) : [...prev, table]
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'profile', label: 'Profile', icon: Building2 },
    { id: 'email', label: 'Email & Signature', icon: Mail },
    { id: 'integrations', label: 'Integrations', icon: Webhook },
    { id: 'sending', label: 'Sending', icon: Send },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'export', label: 'Data Export', icon: Download },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-gray-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Settings</h1>
            <p className="text-sm text-gray-400">{org?.name || 'Organization'} &middot; {org?.plan || 'Pro'} plan</p>
          </div>
        </div>
        {saved && (
          <div className="flex items-center gap-2 text-green-400 text-sm bg-green-900/20 px-3 py-1.5 rounded-lg">
            <Check className="w-4 h-4" /> Saved
          </div>
        )}
      </div>

      {/* Tab Nav */}
      <div className="flex gap-1 mb-6 bg-gray-900 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">

        {/* ─── PROFILE ──────────────────────────────────────────────────────── */}
        {tab === 'profile' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Organization Profile</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Organization Name</label>
                <input
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Domain</label>
                <input
                  value={orgDomain}
                  onChange={e => setOrgDomain(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  placeholder="company.com"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">Logo URL</label>
                <input
                  value={orgLogo}
                  onChange={e => setOrgLogo(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Slug</p>
                <p className="text-sm text-white font-mono">{org?.slug || '—'}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Plan</p>
                <p className="text-sm text-white capitalize">{org?.plan || 'pro'}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Team Size</p>
                <p className="text-sm text-white">{users.length} member{users.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Brain Content</p>
                <p className="text-sm text-white">{brainContent.length} items</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveProfile} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Profile
              </button>
            </div>
          </div>
        )}

        {/* ─── EMAIL & SIGNATURE ──────────────────────────────────────────── */}
        {tab === 'email' && (
          <div className="space-y-8">
            {/* SMTP Config */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Server className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">SMTP Configuration</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SMTP Host</label>
                  <input value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" placeholder="smtp.gmail.com" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Port</label>
                  <input type="number" value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: parseInt(e.target.value) || 587 }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Username</label>
                  <input value={smtp.username} onChange={e => setSmtp(s => ({ ...s, username: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Password</label>
                  <input type="password" value={smtp.password} onChange={e => setSmtp(s => ({ ...s, password: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">From Name</label>
                  <input value={smtp.from_name} onChange={e => setSmtp(s => ({ ...s, from_name: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" placeholder="Mike Paulus" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">From Email</label>
                  <input value={smtp.from_email} onChange={e => setSmtp(s => ({ ...s, from_email: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" placeholder="mike@shipday.com" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Encryption</label>
                  <select value={smtp.encryption} onChange={e => setSmtp(s => ({ ...s, encryption: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                    <option value="tls">TLS</option>
                    <option value="ssl">SSL</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={saveSmtp} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save SMTP
                </button>
              </div>
            </div>

            <div className="border-t border-gray-700" />

            {/* Signature Editor */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <h2 className="text-lg font-semibold text-white">Email Signature</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSignaturePreview(!signaturePreview)} className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium">
                    <Eye className="w-3.5 h-3.5" /> {signaturePreview ? 'Edit' : 'Preview'}
                  </button>
                  <button onClick={scrapeSignature} disabled={regenerating} className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium">
                    <Mail className="w-3.5 h-3.5" /> Import from Gmail
                  </button>
                </div>
              </div>

              {signaturePreview ? (
                <div className="bg-white rounded-lg p-6 min-h-[120px]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signature) }} />
              ) : (
                <textarea
                  value={signature}
                  onChange={e => setSignature(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-xs"
                  placeholder="Paste your HTML signature here..."
                />
              )}

              {/* AI Regenerate */}
              <div className="mt-4 bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">AI Signature Generator</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">Change Intensity</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={1} max={5} value={changeLevel}
                        onChange={e => setChangeLevel(parseInt(e.target.value))}
                        className="flex-1 accent-purple-500"
                      />
                      <span className="text-xs text-gray-400 w-24 text-right">
                        {['', 'Minimal', 'Light', 'Moderate', 'Significant', 'Complete'][changeLevel]}
                      </span>
                    </div>
                  </div>
                  <button onClick={regenerateSignature} disabled={regenerating} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded-lg text-sm font-medium">
                    {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Regenerate
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Uses your Brain content for social proof and messaging.</p>
              </div>

              <div className="flex justify-end mt-4">
                <button onClick={saveSignature} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Signature
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── INTEGRATIONS ───────────────────────────────────────────────── */}
        {tab === 'integrations' && (
          <div className="space-y-8">
            {/* n8n Webhook Health Monitor */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Webhook className="w-5 h-5 text-blue-400" />
                  <h2 className="text-lg font-semibold text-white">n8n Webhook Monitor</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={testAllWebhooks} className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium">
                    <RefreshCw className="w-3.5 h-3.5" /> Test All
                  </button>
                  <button onClick={addWebhook} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium">
                    <Plus className="w-3.5 h-3.5" /> Add Webhook
                  </button>
                </div>
              </div>

              {webhooks.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No webhooks configured. Add one to start monitoring.
                </div>
              ) : (
                <div className="space-y-3">
                  {webhooks.map(wh => (
                    <div key={wh.id} className="bg-gray-800 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          {wh.status === 'healthy' && <CheckCircle className="w-5 h-5 text-green-400" />}
                          {wh.status === 'degraded' && <AlertCircle className="w-5 h-5 text-yellow-400" />}
                          {wh.status === 'down' && <XCircle className="w-5 h-5 text-red-400" />}
                          {(!wh.status || wh.status === 'unknown') && <AlertCircle className="w-5 h-5 text-gray-500" />}
                        </div>

                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            value={wh.name}
                            onChange={e => updateWebhook(wh.id, 'name', e.target.value)}
                            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                            placeholder="Webhook name"
                          />
                          <input
                            value={wh.url}
                            onChange={e => updateWebhook(wh.id, 'url', e.target.value)}
                            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm md:col-span-2"
                            placeholder="https://automation.mikegrowsgreens.com/webhook/..."
                          />
                        </div>

                        <select
                          value={wh.type}
                          onChange={e => updateWebhook(wh.id, 'type', e.target.value)}
                          className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-gray-300 text-xs"
                        >
                          <option value="outbound">Outbound</option>
                          <option value="inbound">Inbound</option>
                        </select>

                        <button
                          onClick={() => testWebhook(wh)}
                          disabled={testingWebhook === wh.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs"
                        >
                          {testingWebhook === wh.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          Test
                        </button>

                        <button onClick={() => removeWebhook(wh.id)} className="text-gray-500 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {wh.last_checked && (
                        <p className="text-xs text-gray-500 mt-2 ml-8">
                          Last checked: {new Date(wh.last_checked).toLocaleString()}
                          {wh.last_triggered && <> &middot; Last triggered: {new Date(wh.last_triggered).toLocaleString()}</>}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-4">
                <button onClick={saveIntegrations} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Webhooks
                </button>
              </div>
            </div>

            <div className="border-t border-gray-700" />

            {/* Twilio */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Phone className="w-5 h-5 text-green-400" />
                <h2 className="text-lg font-semibold text-white">Twilio</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Account SID</label>
                  <input value={integrations.twilio.account_sid} onChange={e => setIntegrations(prev => ({ ...prev, twilio: { ...prev.twilio, account_sid: e.target.value } }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" placeholder="AC..." />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Auth Token</label>
                  <input type="password" value={integrations.twilio.auth_token} onChange={e => setIntegrations(prev => ({ ...prev, twilio: { ...prev.twilio, auth_token: e.target.value } }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Phone Number</label>
                  <input value={integrations.twilio.phone_number} onChange={e => setIntegrations(prev => ({ ...prev, twilio: { ...prev.twilio, phone_number: e.target.value } }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" placeholder="+1..." />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-700" />

            {/* Calendly */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">Calendly</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">API Key</label>
                  <input type="password" value={integrations.calendly.api_key} onChange={e => setIntegrations(prev => ({ ...prev, calendly: { ...prev.calendly, api_key: e.target.value } }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Default Event URL</label>
                  <input value={integrations.calendly.event_url} onChange={e => setIntegrations(prev => ({ ...prev, calendly: { ...prev.calendly, event_url: e.target.value } }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" placeholder="https://calendly.com/..." />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-700" />

            {/* Fathom */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-semibold text-white">Fathom AI</h2>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">API Key</label>
                <input type="password" value={integrations.fathom.api_key} onChange={e => setIntegrations(prev => ({ ...prev, fathom: { ...prev.fathom, api_key: e.target.value } }))} className="w-full max-w-md px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={saveIntegrations} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Integrations
              </button>
            </div>
          </div>
        )}

        {/* ─── SENDING ────────────────────────────────────────────────────── */}
        {tab === 'sending' && (
          <div className="space-y-8">
            {/* Daily Volume */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Send className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">Daily Volume Limits</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Max Emails Per Day</label>
                  <input type="number" value={sending.daily_limit} onChange={e => setSendingState(s => ({ ...s, daily_limit: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Delay Between Emails (seconds)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={sending.delay_between_emails_min} onChange={e => setSendingState(s => ({ ...s, delay_between_emails_min: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" placeholder="Min" />
                    <span className="text-gray-500">to</span>
                    <input type="number" value={sending.delay_between_emails_max} onChange={e => setSendingState(s => ({ ...s, delay_between_emails_max: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" placeholder="Max" />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-700" />

            {/* Warm-up Schedule */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-400" />
                  <h2 className="text-lg font-semibold text-white">Warm-Up Schedule</h2>
                </div>
                <button
                  onClick={() => setSendingState(s => ({ ...s, warmup_enabled: !s.warmup_enabled }))}
                  className="flex items-center gap-2 text-sm"
                >
                  {sending.warmup_enabled
                    ? <ToggleRight className="w-6 h-6 text-green-400" />
                    : <ToggleLeft className="w-6 h-6 text-gray-500" />
                  }
                  <span className={sending.warmup_enabled ? 'text-green-400' : 'text-gray-500'}>
                    {sending.warmup_enabled ? 'Active' : 'Disabled'}
                  </span>
                </button>
              </div>

              {sending.warmup_enabled && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Start Volume</label>
                    <input type="number" value={sending.warmup_start} onChange={e => setSendingState(s => ({ ...s, warmup_start: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Daily Increment</label>
                    <input type="number" value={sending.warmup_increment} onChange={e => setSendingState(s => ({ ...s, warmup_increment: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Target Volume</label>
                    <input type="number" value={sending.warmup_target} onChange={e => setSendingState(s => ({ ...s, warmup_target: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Current Day</label>
                    <div className="flex items-center gap-2 h-[42px]">
                      <span className="text-white text-lg font-bold">{sending.warmup_current_day}</span>
                      <span className="text-gray-500 text-sm">/ {Math.ceil((sending.warmup_target - sending.warmup_start) / (sending.warmup_increment || 1))} days</span>
                    </div>
                  </div>
                </div>
              )}

              {sending.warmup_enabled && (
                <div className="mt-3 bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400">
                    Today&apos;s limit: <span className="text-white font-medium">{Math.min(sending.warmup_start + (sending.warmup_current_day * sending.warmup_increment), sending.warmup_target)}</span> emails
                    &middot; Target reached in <span className="text-white font-medium">{Math.max(0, Math.ceil((sending.warmup_target - sending.warmup_start) / (sending.warmup_increment || 1)) - sending.warmup_current_day)}</span> days
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-700" />

            {/* Sending Windows */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">Sending Windows</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Start Time</label>
                  <input type="time" value={sending.send_window_start} onChange={e => setSendingState(s => ({ ...s, send_window_start: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">End Time</label>
                  <input type="time" value={sending.send_window_end} onChange={e => setSendingState(s => ({ ...s, send_window_end: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Timezone</label>
                  <select value={sending.send_window_timezone} onChange={e => setSendingState(s => ({ ...s, send_window_timezone: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                    <option value="America/Denver">Mountain (Denver)</option>
                    <option value="America/New_York">Eastern (New York)</option>
                    <option value="America/Chicago">Central (Chicago)</option>
                    <option value="America/Los_Angeles">Pacific (LA)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm text-gray-400 mb-2">Active Days</label>
                <div className="flex gap-2">
                  {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        sending.send_days.includes(day)
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : 'bg-gray-800 text-gray-500 border border-gray-700'
                      }`}
                    >
                      {day.charAt(0).toUpperCase() + day.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveSending} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Sending Config
              </button>
            </div>
          </div>
        )}

        {/* ─── NOTIFICATIONS ──────────────────────────────────────────────── */}
        {tab === 'notifications' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Notification Preferences</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notification Email</label>
                <input value={notifications.notify_email} onChange={e => setNotifications(n => ({ ...n, notify_email: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" placeholder="you@company.com" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">SMS Phone Number</label>
                <input value={notifications.notify_phone} onChange={e => setNotifications(n => ({ ...n, notify_phone: e.target.value }))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" placeholder="+1..." />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Email Alerts */}
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-medium text-white">Email Alerts</h3>
                </div>
                <div className="space-y-3">
                  {([
                    { key: 'email_replies' as const, label: 'New Replies' },
                    { key: 'email_demos_booked' as const, label: 'Demos Booked' },
                    { key: 'email_hot_leads' as const, label: 'Hot Lead Detected' },
                  ]).map(item => (
                    <div key={item.key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">{item.label}</span>
                      <button onClick={() => setNotifications(n => ({ ...n, [item.key]: !n[item.key] }))}>
                        {notifications[item.key]
                          ? <ToggleRight className="w-6 h-6 text-green-400" />
                          : <ToggleLeft className="w-6 h-6 text-gray-500" />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* SMS Alerts */}
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Phone className="w-4 h-4 text-green-400" />
                  <h3 className="text-sm font-medium text-white">SMS Alerts</h3>
                </div>
                <div className="space-y-3">
                  {([
                    { key: 'sms_replies' as const, label: 'New Replies' },
                    { key: 'sms_demos_booked' as const, label: 'Demos Booked' },
                    { key: 'sms_hot_leads' as const, label: 'Hot Lead Detected' },
                  ]).map(item => (
                    <div key={item.key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">{item.label}</span>
                      <button onClick={() => setNotifications(n => ({ ...n, [item.key]: !n[item.key] }))}>
                        {notifications[item.key]
                          ? <ToggleRight className="w-6 h-6 text-green-400" />
                          : <ToggleLeft className="w-6 h-6 text-gray-500" />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Summaries */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-white">Summary Reports</h3>
              </div>
              <div className="flex gap-6">
                <div className="flex items-center gap-3">
                  <button onClick={() => setNotifications(n => ({ ...n, daily_summary: !n.daily_summary }))}>
                    {notifications.daily_summary
                      ? <ToggleRight className="w-6 h-6 text-green-400" />
                      : <ToggleLeft className="w-6 h-6 text-gray-500" />
                    }
                  </button>
                  <span className="text-sm text-gray-300">Daily Summary</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setNotifications(n => ({ ...n, weekly_report: !n.weekly_report }))}>
                    {notifications.weekly_report
                      ? <ToggleRight className="w-6 h-6 text-green-400" />
                      : <ToggleLeft className="w-6 h-6 text-gray-500" />
                    }
                  </button>
                  <span className="text-sm text-gray-300">Weekly Report</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveNotifications} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Notifications
              </button>
            </div>
          </div>
        )}

        {/* ─── TEAM ───────────────────────────────────────────────────────── */}
        {tab === 'team' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">Team Members</h2>
              </div>
              <button onClick={() => setShowAddUser(!showAddUser)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium">
                <Plus className="w-3.5 h-3.5" /> Invite User
              </button>
            </div>

            {showAddUser && (
              <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input value={newEmail} onChange={e => setNewEmail(e.target.value)} className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="Email" />
                  <input value={newName} onChange={e => setNewName(e.target.value)} className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="Display Name" />
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" placeholder="Password" />
                  <select value={newRole} onChange={e => setNewRole(e.target.value)} className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={addUser} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add User
                  </button>
                  <button onClick={() => setShowAddUser(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Last Login</th>
                    <th className="pb-2 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.user_id} className="border-b border-gray-800/50">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">
                            <User className="w-4 h-4 text-blue-400" />
                          </div>
                          <div>
                            <p className="text-sm text-white">{user.display_name || user.email.split('@')[0]}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          user.role === 'admin' ? 'bg-purple-900/30 text-purple-400' : 'bg-gray-800 text-gray-400'
                        }`}>
                          {user.role === 'admin' && <Shield className="w-3 h-3" />}
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                          user.is_active ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                        }`}>
                          {user.is_active ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-gray-400">
                        {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="py-3 text-sm text-gray-400">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {users.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No team members yet. Invite someone to get started.
              </div>
            )}
          </div>
        )}

        {/* ─── DATA EXPORT ────────────────────────────────────────────────── */}
        {tab === 'export' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Download className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Data Export</h2>
            </div>

            <p className="text-sm text-gray-400">Download a backup of your SalesHub data. Select the tables you want to export and choose your format.</p>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Export Format</label>
              <div className="flex gap-3">
                {(['json', 'csv'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      exportFormat === fmt
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
                    }`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Select Data</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { id: 'contacts', label: 'Contacts', icon: Users },
                  { id: 'deals', label: 'Deals', icon: Zap },
                  { id: 'activities', label: 'Activities', icon: FileText },
                  { id: 'sequences', label: 'Sequences', icon: Send },
                  { id: 'campaigns', label: 'Campaigns', icon: Send },
                  { id: 'leads', label: 'Leads', icon: Users },
                  { id: 'brain', label: 'Brain Content', icon: Brain },
                ].map(table => {
                  const Icon = table.icon;
                  const selected = exportTables.includes(table.id);
                  return (
                    <button
                      key={table.id}
                      onClick={() => toggleExportTable(table.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        selected
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {table.label}
                      {selected && <Check className="w-3.5 h-3.5 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleExport}
                disabled={exporting || exportTables.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export {exportTables.length} Table{exportTables.length !== 1 ? 's' : ''} as {exportFormat.toUpperCase()}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
