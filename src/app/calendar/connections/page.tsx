'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Video, Calendar, Loader2, CheckCircle, XCircle, ExternalLink, Trash2,
  Download, AlertCircle, Key, Eye, EyeOff, Save, ShieldCheck, ShieldAlert,
} from 'lucide-react';

interface Connection {
  connection_id: number;
  provider: 'google' | 'zoom';
  account_email: string;
  is_active: boolean;
  created_at: string;
}

interface ImportCounts {
  imported: number;
  skipped: number;
  errors: string[];
  contactsLinked?: number;
}

interface ImportResult {
  eventTypes: ImportCounts;
  availability: ImportCounts;
  bookings: ImportCounts;
  legacyMigrated: ImportCounts;
  user: { name: string; email: string };
}

interface GoogleHealthStatus {
  configured: boolean;
  clientIdSet: boolean;
  clientSecretSet: boolean;
  redirectUri: string;
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);

  // Google OAuth health
  const [googleHealth, setGoogleHealth] = useState<GoogleHealthStatus | null>(null);

  // Calendly API key state
  const [calendlyKeyConfigured, setCalendlyKeyConfigured] = useState(false);
  const [calendlyKeyMasked, setCalendlyKeyMasked] = useState('');
  const [calendlyKeyInput, setCalendlyKeyInput] = useState('');
  const [calendlyKeyVisible, setCalendlyKeyVisible] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keySaveMessage, setKeySaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Calendly import state
  const [importing, setImporting] = useState(false);
  const [importPhase, setImportPhase] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/scheduling/connections');
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch (err) {
      console.error('Failed to fetch connections:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCalendlyKey = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/calendly-key');
      if (res.ok) {
        const data = await res.json();
        setCalendlyKeyConfigured(data.configured);
        setCalendlyKeyMasked(data.masked);
      }
    } catch (err) {
      console.error('Failed to fetch Calendly key status:', err);
    }
  }, []);

  const fetchGoogleHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/google-health');
      if (res.ok) {
        const data = await res.json();
        setGoogleHealth(data);
      }
    } catch (err) {
      console.error('Failed to fetch Google health:', err);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    fetchCalendlyKey();
    fetchGoogleHealth();
  }, [fetchConnections, fetchCalendlyKey, fetchGoogleHealth]);

  const googleConnection = connections.find(c => c.provider === 'google');
  const zoomConnection = connections.find(c => c.provider === 'zoom');

  async function disconnect(connectionId: number) {
    setDisconnecting(connectionId);
    try {
      const res = await fetch(`/api/scheduling/connections/${connectionId}`, { method: 'DELETE' });
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.connection_id !== connectionId));
      }
    } catch (err) {
      console.error('Failed to disconnect:', err);
    } finally {
      setDisconnecting(null);
    }
  }

  async function saveCalendlyKey() {
    if (!calendlyKeyInput.trim()) return;

    setSavingKey(true);
    setKeySaveMessage(null);

    try {
      const res = await fetch('/api/calendar/calendly-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: calendlyKeyInput.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setKeySaveMessage({ type: 'error', text: data.error || 'Failed to save' });
        return;
      }

      setKeySaveMessage({ type: 'success', text: 'Calendly API key saved.' });
      setCalendlyKeyInput('');
      setCalendlyKeyVisible(false);
      fetchCalendlyKey();
    } catch (err) {
      setKeySaveMessage({ type: 'error', text: 'Network error saving key.' });
    } finally {
      setSavingKey(false);
    }
  }

  async function startCalendlyImport() {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    setImportPhase('Connecting to Calendly...');

    try {
      const res = await fetch('/api/calendar/import-calendly', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setImportError(data.error || 'Import failed');
        if (data.partialResult) {
          setImportResult(data.partialResult);
        }
        return;
      }

      setImportResult(data.result);
      setImportPhase('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Network error during import');
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-1">Calendar Connections</h1>
      <p className="text-gray-400 mb-8">
        Connect your calendars to check availability and auto-create meeting links.
      </p>

      {/* Google OAuth Health Check */}
      {googleHealth && !googleHealth.configured && (
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-yellow-400 font-medium mb-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            Google OAuth Not Configured
          </div>
          <div className="text-xs text-yellow-300/80 space-y-1">
            <p>Google Calendar connection requires OAuth credentials in <code className="bg-gray-800 px-1 rounded">.env.local</code>:</p>
            <ul className="ml-4 space-y-0.5">
              <li className={googleHealth.clientIdSet ? 'text-green-400' : ''}>
                {googleHealth.clientIdSet ? '✓' : '✗'} GOOGLE_CLIENT_ID
              </li>
              <li className={googleHealth.clientSecretSet ? 'text-green-400' : ''}>
                {googleHealth.clientSecretSet ? '✓' : '✗'} GOOGLE_CLIENT_SECRET
              </li>
            </ul>
            <p className="mt-2 text-gray-500">Redirect URI: {googleHealth.redirectUri}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Google Calendar */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-medium">Google Calendar</h3>
                  {googleHealth?.configured && (
                    <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                  )}
                </div>
                <p className="text-sm text-gray-400">
                  {googleConnection
                    ? googleConnection.account_email
                    : 'Check availability and create Google Meet links'}
                </p>
              </div>
            </div>

            {googleConnection ? (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" /> Connected
                </span>
                <button
                  onClick={() => disconnect(googleConnection.connection_id)}
                  disabled={disconnecting === googleConnection.connection_id}
                  className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                >
                  {disconnecting === googleConnection.connection_id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ) : (
              <a
                href="/api/auth/google-calendar"
                className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${
                  googleHealth?.configured
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-gray-700 cursor-not-allowed opacity-50'
                }`}
                onClick={(e) => {
                  if (!googleHealth?.configured) {
                    e.preventDefault();
                  }
                }}
              >
                <ExternalLink className="w-4 h-4" /> Connect
              </a>
            )}
          </div>
        </div>

        {/* Zoom */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Video className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Zoom</h3>
                <p className="text-sm text-gray-400">
                  {zoomConnection
                    ? zoomConnection.account_email
                    : 'Auto-create Zoom meeting links for bookings'}
                </p>
              </div>
            </div>

            {zoomConnection ? (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" /> Connected
                </span>
                <button
                  onClick={() => disconnect(zoomConnection.connection_id)}
                  disabled={disconnecting === zoomConnection.connection_id}
                  className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                >
                  {disconnecting === zoomConnection.connection_id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ) : (
              <a
                href="/api/auth/zoom"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Connect
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Data Migration */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-white mb-1">Data Migration</h2>
        <p className="text-gray-400 text-sm mb-4">
          Import event types, availability, and past bookings from Calendly.
        </p>

        {/* Calendly API Key */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Key className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-white font-medium">Calendly API Key</h3>
              <p className="text-sm text-gray-400">
                {calendlyKeyConfigured
                  ? <span className="text-green-400">Configured: {calendlyKeyMasked}</span>
                  : 'Required for import — get from calendly.com/integrations/api_webhooks'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={calendlyKeyVisible ? 'text' : 'password'}
                value={calendlyKeyInput}
                onChange={(e) => setCalendlyKeyInput(e.target.value)}
                placeholder={calendlyKeyConfigured ? 'Paste new key to replace...' : 'Paste Calendly Personal Access Token...'}
                className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
              <button
                onClick={() => setCalendlyKeyVisible(!calendlyKeyVisible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {calendlyKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={saveCalendlyKey}
              disabled={savingKey || !calendlyKeyInput.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>

          {keySaveMessage && (
            <div className={`mt-3 p-2 rounded-lg text-xs flex items-center gap-2 ${
              keySaveMessage.type === 'success'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {keySaveMessage.type === 'success' ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {keySaveMessage.text}
            </div>
          )}
        </div>

        {/* Import Button */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Import from Calendly</h3>
                <p className="text-sm text-gray-400">
                  Migrate event types, schedules, and 6 months of bookings
                </p>
              </div>
            </div>

            <button
              onClick={startCalendlyImport}
              disabled={importing || !calendlyKeyConfigured}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!calendlyKeyConfigured ? 'Add Calendly API key first' : undefined}
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Importing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Import
                </>
              )}
            </button>
          </div>

          {!calendlyKeyConfigured && !importing && (
            <div className="mt-3 p-2 bg-gray-800/50 rounded-lg text-xs text-gray-500">
              Add your Calendly API key above before importing.
            </div>
          )}

          {/* Import Progress */}
          {importing && importPhase && (
            <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                {importPhase}
              </div>
            </div>
          )}

          {/* Import Error */}
          {importError && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {importError}
              </div>
            </div>
          )}

          {/* Import Results */}
          {importResult && <ImportSummary result={importResult} />}
        </div>
      </div>

      {/* Status messages from OAuth redirects */}
      <ConnectionNotice />
    </div>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  const sections = [
    { label: 'Event Types', data: result.eventTypes },
    { label: 'Availability Schedules', data: result.availability },
    { label: 'Bookings (Calendly API)', data: result.bookings },
    { label: 'Legacy Events (DB)', data: result.legacyMigrated },
  ];

  const totalImported =
    result.eventTypes.imported +
    result.availability.imported +
    result.bookings.imported +
    result.legacyMigrated.imported;

  const totalSkipped =
    result.eventTypes.skipped +
    result.availability.skipped +
    result.bookings.skipped +
    result.legacyMigrated.skipped;

  const allErrors = [
    ...result.eventTypes.errors,
    ...result.availability.errors,
    ...result.bookings.errors,
    ...result.legacyMigrated.errors,
  ];

  return (
    <div className="mt-4 space-y-3">
      {/* Summary Banner */}
      <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>
            Import complete for <strong>{result.user.name}</strong> ({result.user.email}).
            {' '}{totalImported} imported, {totalSkipped} skipped
            {result.bookings.contactsLinked ? `, ${result.bookings.contactsLinked} contacts linked` : ''}.
          </span>
        </div>
      </div>

      {/* Detail Grid */}
      <div className="grid grid-cols-2 gap-2">
        {sections.map(({ label, data }) => (
          <div key={label} className="p-3 bg-gray-800/50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-green-400">{data.imported} imported</span>
              {data.skipped > 0 && (
                <span className="text-gray-500">{data.skipped} skipped</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Errors */}
      {allErrors.length > 0 && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <div className="text-xs text-yellow-400 mb-2 font-medium">
            {allErrors.length} error{allErrors.length === 1 ? '' : 's'} during import:
          </div>
          <ul className="space-y-1">
            {allErrors.slice(0, 10).map((err, i) => (
              <li key={i} className="text-xs text-yellow-300/80">{err}</li>
            ))}
            {allErrors.length > 10 && (
              <li className="text-xs text-yellow-300/60">
                ...and {allErrors.length - 10} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConnectionNotice() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const email = params.get('email');
    const error = params.get('error');

    if (connected) {
      setMessage({
        type: 'success',
        text: `${connected === 'google' ? 'Google Calendar' : 'Zoom'} connected${email ? ` as ${email}` : ''}.`,
      });
    } else if (error) {
      const messages: Record<string, string> = {
        denied: 'Connection was cancelled.',
        missing_params: 'OAuth callback missing parameters.',
        invalid_state: 'Invalid OAuth state.',
        exchange_failed: 'Failed to complete connection. Please try again.',
      };
      setMessage({ type: 'error', text: messages[error] || 'Connection failed.' });
    }

    // Clean URL
    if (connected || error) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  if (!message) return null;

  return (
    <div
      className={`mt-6 p-3 rounded-lg text-sm flex items-center gap-2 ${
        message.type === 'success'
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
      }`}
    >
      {message.type === 'success' ? (
        <CheckCircle className="w-4 h-4 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 shrink-0" />
      )}
      {message.text}
    </div>
  );
}
