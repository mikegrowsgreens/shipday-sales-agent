'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, Search, MapPin, CheckCircle, XCircle, Clock, RefreshCw,
  ChevronDown, ChevronUp, Users, AlertTriangle
} from 'lucide-react';

interface ScrapingJob {
  job_id: string;
  search_query: string;
  city: string | null;
  state: string | null;
  cuisine_type: string | null;
  status: string;
  leads_found: number | null;
  leads_new: number | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

const US_STATES = [
  'WA', 'NV', 'ID', 'MT', 'AK', 'OR', 'CA', 'AZ', 'UT', 'CO',
  'NM', 'TX', 'NY', 'FL', 'IL', 'OH', 'PA', 'GA', 'NC', 'MI',
];

export default function ScraperPanel() {
  const [jobs, setJobs] = useState<ScrapingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [city, setCity] = useState('');
  const [state, setState] = useState('WA');
  const [cuisineType, setCuisineType] = useState('');
  const [maxResults, setMaxResults] = useState(50);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = useCallback(() => {
    fetch('/api/bdr/scraping')
      .then(r => r.json())
      .then(data => setJobs(data.jobs || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Auto-refresh when jobs are running
  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'running' || j.status === 'pending');
    if (hasRunning) {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchJobs, 10000);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobs, fetchJobs]);

  const handleTrigger = async () => {
    if (!city.trim()) return;
    setTriggering(true);
    setMessage(null);
    try {
      const res = await fetch('/api/bdr/scraping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, state, cuisine_type: cuisineType || undefined, max_results: maxResults }),
      });
      const data = await res.json();
      setMessage(data.message || 'Scraping triggered');
      setCity('');
      setCuisineType('');
      setTimeout(fetchJobs, 2000);
    } catch {
      setMessage('Failed to trigger scraping');
    } finally {
      setTriggering(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
    if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    if (status === 'running') return <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />;
    return <Clock className="w-3.5 h-3.5 text-gray-400" />;
  };

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return '--';
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const dur = Math.round((e - s) / 1000);
    if (dur < 60) return `${dur}s`;
    return `${Math.floor(dur / 60)}m ${dur % 60}s`;
  };

  // Stats
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const totalFound = jobs.reduce((sum, j) => sum + (j.leads_found || 0), 0);
  const totalNew = jobs.reduce((sum, j) => sum + (j.leads_new || 0), 0);
  const runningJobs = jobs.filter(j => j.status === 'running' || j.status === 'pending').length;

  const visibleJobs = showAllJobs ? jobs : jobs.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* New Scrape Form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">New Prospect Scrape</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTrigger()}
              placeholder="Seattle"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-1">State</label>
            <select
              value={state}
              onChange={e => setState(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-1">Cuisine (optional)</label>
            <input
              type="text"
              value={cuisineType}
              onChange={e => setCuisineType(e.target.value)}
              placeholder="pizza, sushi..."
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-1">Max Results</label>
            <input
              type="number"
              value={maxResults}
              onChange={e => setMaxResults(parseInt(e.target.value) || 50)}
              min={10}
              max={200}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleTrigger}
            disabled={triggering || !city.trim()}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs px-4 py-2 rounded-lg transition-colors"
          >
            {triggering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            Start Scraping
          </button>
          {message && (
            <span className="text-xs text-purple-300">{message}</span>
          )}
        </div>
      </div>

      {/* Stats cards */}
      {totalJobs > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-white">{totalJobs}</div>
            <div className="text-[10px] text-gray-500 uppercase">Total Jobs</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-white">{completedJobs}</div>
            <div className="text-[10px] text-gray-500 uppercase">Completed</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-purple-400">{totalFound.toLocaleString()}</div>
            <div className="text-[10px] text-gray-500 uppercase">Leads Found</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-green-400">{totalNew.toLocaleString()}</div>
            <div className="text-[10px] text-gray-500 uppercase">New Leads</div>
          </div>
        </div>
      )}

      {/* Jobs List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        </div>
      ) : jobs.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">
              Job History
              {runningJobs > 0 && (
                <span className="ml-2 text-yellow-400 text-xs font-normal">({runningJobs} running)</span>
              )}
            </h3>
            <button
              onClick={fetchJobs}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>

          {visibleJobs.map(job => (
            <div key={job.job_id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedJob(expandedJob === job.job_id ? null : job.job_id)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-800/30 transition-colors"
              >
                {statusIcon(job.status)}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm text-white truncate">{job.search_query}</p>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    {job.city && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5" /> {job.city}, {job.state}
                      </span>
                    )}
                    <span>{new Date(job.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                </div>
                {job.leads_found !== null && (
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <span className="flex items-center gap-1 text-gray-400">
                      <Users className="w-3 h-3" />
                      {job.leads_found}
                    </span>
                    {(job.leads_new || 0) > 0 && (
                      <span className="text-green-400">+{job.leads_new} new</span>
                    )}
                    {job.leads_found !== null && job.leads_new !== null && job.leads_found > 0 && job.leads_found - job.leads_new > 0 && (
                      <span className="text-orange-400/70 text-[10px]">{job.leads_found - job.leads_new} dupes</span>
                    )}
                  </div>
                )}
                {expandedJob === job.job_id ? (
                  <ChevronUp className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                )}
              </button>

              {expandedJob === job.job_id && (
                <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/50 text-xs space-y-1.5">
                  <div className="flex items-center gap-8">
                    <div>
                      <span className="text-gray-500">Status: </span>
                      <span className={`font-medium ${
                        job.status === 'completed' ? 'text-green-400' :
                        job.status === 'failed' ? 'text-red-400' :
                        job.status === 'running' ? 'text-yellow-400' : 'text-gray-400'
                      }`}>{job.status}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Duration: </span>
                      <span className="text-gray-300">{formatDuration(job.started_at, job.completed_at)}</span>
                    </div>
                    {job.cuisine_type && (
                      <div>
                        <span className="text-gray-500">Cuisine: </span>
                        <span className="text-gray-300">{job.cuisine_type}</span>
                      </div>
                    )}
                  </div>
                  {job.leads_found !== null && (
                    <div className="flex items-center gap-8">
                      <div>
                        <span className="text-gray-500">Found: </span>
                        <span className="text-gray-300">{job.leads_found} leads</span>
                      </div>
                      <div>
                        <span className="text-gray-500">New: </span>
                        <span className="text-green-400">{job.leads_new}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Duplicates: </span>
                        <span className="text-orange-400">{(job.leads_found || 0) - (job.leads_new || 0)}</span>
                      </div>
                    </div>
                  )}
                  {job.error_message && (
                    <div className="flex items-start gap-1 text-red-400 mt-1">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{job.error_message}</span>
                    </div>
                  )}
                  <div className="text-gray-600">
                    Started {job.started_at ? new Date(job.started_at).toLocaleString() : '--'}
                    {job.completed_at && ` - Completed ${new Date(job.completed_at).toLocaleString()}`}
                  </div>
                </div>
              )}
            </div>
          ))}

          {jobs.length > 10 && (
            <button
              onClick={() => setShowAllJobs(!showAllJobs)}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-300 py-2 transition-colors"
            >
              {showAllJobs ? `Show less` : `Show all ${jobs.length} jobs`}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-8">No scraping jobs yet. Start one above.</p>
      )}
    </div>
  );
}
