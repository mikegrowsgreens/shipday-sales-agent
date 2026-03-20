'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, Building2, User, Target, Mail, Upload,
  ChevronRight, ChevronLeft, Check, Plus, X, Loader2,
} from 'lucide-react';

interface OnboardingData {
  // Step 1: Company
  company_name: string;
  industry: string;
  website_url: string;
  description: string;
  // Step 2: Role
  full_name: string;
  title: string;
  sender_email: string;
  // Step 3: Value Prop
  product_description: string;
  value_props: string[];
  pain_points: string[];
  // Step 4: SMTP
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
}

const INDUSTRIES = ['SaaS', 'E-commerce', 'Services', 'Real Estate', 'Healthcare', 'Finance', 'Other'];
const STEPS = ['Company Info', 'Your Role', 'Value Proposition', 'Email Setup', 'Import Contacts'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [data, setData] = useState<OnboardingData>({
    company_name: '',
    industry: 'SaaS',
    website_url: '',
    description: '',
    full_name: '',
    title: '',
    sender_email: '',
    product_description: '',
    value_props: [''],
    pain_points: [''],
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
  });

  const update = (field: keyof OnboardingData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setData(d => ({ ...d, [field]: e.target.value }));

  const addListItem = (field: 'value_props' | 'pain_points') => {
    if (data[field].length < 5) {
      setData(d => ({ ...d, [field]: [...d[field], ''] }));
    }
  };

  const removeListItem = (field: 'value_props' | 'pain_points', idx: number) => {
    setData(d => ({ ...d, [field]: d[field].filter((_, i) => i !== idx) }));
  };

  const updateListItem = (field: 'value_props' | 'pain_points', idx: number, value: string) => {
    setData(d => ({
      ...d,
      [field]: d[field].map((item, i) => (i === idx ? value : item)),
    }));
  };

  async function testSmtp() {
    setSmtpTesting(true);
    setSmtpStatus('idle');
    try {
      const res = await fetch('/api/settings/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          host: data.smtp_host,
          port: parseInt(data.smtp_port),
          username: data.smtp_user,
          password: data.smtp_pass,
        }),
      });
      setSmtpStatus(res.ok ? 'success' : 'error');
    } catch {
      setSmtpStatus('error');
    }
    setSmtpTesting(false);
  }

  async function handleComplete() {
    setLoading(true);

    // Save org config
    const config = {
      company_name: data.company_name,
      industry: data.industry,
      persona: {
        sender_name: data.full_name,
        sender_title: data.title,
        sender_email: data.sender_email,
      },
      value_props: data.value_props.filter(v => v.trim()),
      pain_points: data.pain_points.filter(v => v.trim()),
      branding: {
        app_name: data.company_name,
      },
      urls: {
        default_redirect: data.website_url || 'https://example.com',
      },
    };

    await fetch('/api/settings/org-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    // Save SMTP if configured
    if (data.smtp_host && data.smtp_user) {
      await fetch('/api/settings/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          host: data.smtp_host,
          port: parseInt(data.smtp_port),
          username: data.smtp_user,
          password: data.smtp_pass,
        }),
      });
    }

    router.push('/');
    router.refresh();
  }

  const canProceed = () => {
    switch (step) {
      case 0: return data.company_name.trim().length > 0;
      case 1: return data.full_name.trim().length > 0;
      case 2: return true; // Optional
      case 3: return true; // Optional
      case 4: return true; // Optional
      default: return true;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Progress bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-400" />
              <span className="text-white font-semibold">SalesHub Setup</span>
            </div>
            <span className="text-sm text-gray-400">Step {step + 1} of {STEPS.length}</span>
          </div>
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ? 'bg-blue-500' : 'bg-gray-800'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {STEPS.map((name, i) => (
              <span key={i} className={`text-xs ${i === step ? 'text-blue-400' : 'text-gray-600'}`}>
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {step === 0 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/10 rounded-lg"><Building2 className="w-5 h-5 text-blue-400" /></div>
                <div>
                  <h2 className="text-xl font-bold text-white">Tell us about your company</h2>
                  <p className="text-sm text-gray-400">This helps SalesHub personalize your experience</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Company Name</label>
                  <input type="text" value={data.company_name} onChange={update('company_name')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Acme Inc." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Industry</label>
                  <select value={data.industry} onChange={update('industry')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Website URL</label>
                  <input type="url" value={data.website_url} onChange={update('website_url')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="https://acme.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Company Description <span className="text-gray-500">(for AI context)</span></label>
                  <textarea value={data.description} onChange={update('description')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none h-24 resize-none" placeholder="Briefly describe what your company does..." />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/10 rounded-lg"><User className="w-5 h-5 text-blue-400" /></div>
                <div>
                  <h2 className="text-xl font-bold text-white">Your role</h2>
                  <p className="text-sm text-gray-400">How should emails appear from you?</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Your Name</label>
                  <input type="text" value={data.full_name} onChange={update('full_name')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Jane Smith" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Your Title</label>
                  <input type="text" value={data.title} onChange={update('title')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Account Executive" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Your Email <span className="text-gray-500">(for sending)</span></label>
                  <input type="email" value={data.sender_email} onChange={update('sender_email')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="jane@acme.com" />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/10 rounded-lg"><Target className="w-5 h-5 text-blue-400" /></div>
                <div>
                  <h2 className="text-xl font-bold text-white">Value Proposition</h2>
                  <p className="text-sm text-gray-400">Help our AI craft better outreach for you</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">What does your product/service do?</label>
                  <textarea value={data.product_description} onChange={update('product_description')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none h-24 resize-none" placeholder="Describe your product or service..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Key Value Propositions <span className="text-gray-500">(up to 5)</span></label>
                  {data.value_props.map((vp, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input type="text" value={vp} onChange={(e) => updateListItem('value_props', i, e.target.value)} className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm" placeholder={`Value prop ${i + 1}`} />
                      {data.value_props.length > 1 && (
                        <button onClick={() => removeListItem('value_props', i)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                      )}
                    </div>
                  ))}
                  {data.value_props.length < 5 && (
                    <button onClick={() => addListItem('value_props')} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">
                      <Plus className="w-3 h-3" /> Add value prop
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Common Pain Points You Solve <span className="text-gray-500">(up to 5)</span></label>
                  {data.pain_points.map((pp, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input type="text" value={pp} onChange={(e) => updateListItem('pain_points', i, e.target.value)} className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm" placeholder={`Pain point ${i + 1}`} />
                      {data.pain_points.length > 1 && (
                        <button onClick={() => removeListItem('pain_points', i)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                      )}
                    </div>
                  ))}
                  {data.pain_points.length < 5 && (
                    <button onClick={() => addListItem('pain_points')} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">
                      <Plus className="w-3 h-3" /> Add pain point
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/10 rounded-lg"><Mail className="w-5 h-5 text-blue-400" /></div>
                <div>
                  <h2 className="text-xl font-bold text-white">Email Setup</h2>
                  <p className="text-sm text-gray-400">Configure SMTP to send emails from SalesHub</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">SMTP Host</label>
                    <input type="text" value={data.smtp_host} onChange={update('smtp_host')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="smtp.gmail.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Port</label>
                    <input type="text" value={data.smtp_port} onChange={update('smtp_port')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="587" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
                  <input type="text" value={data.smtp_user} onChange={update('smtp_user')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="your@email.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                  <input type="password" value={data.smtp_pass} onChange={update('smtp_pass')} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="App password or SMTP password" />
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={testSmtp} disabled={smtpTesting || !data.smtp_host || !data.smtp_user} className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2">
                    {smtpTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Test Connection
                  </button>
                  {smtpStatus === 'success' && <span className="text-green-400 text-sm flex items-center gap-1"><Check className="w-4 h-4" /> Connected</span>}
                  {smtpStatus === 'error' && <span className="text-red-400 text-sm">Connection failed</span>}
                </div>
              </div>
              <button onClick={() => setStep(4)} className="text-sm text-gray-400 hover:text-gray-300">
                Skip for now →
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/10 rounded-lg"><Upload className="w-5 h-5 text-blue-400" /></div>
                <div>
                  <h2 className="text-xl font-bold text-white">Import Contacts</h2>
                  <p className="text-sm text-gray-400">Upload a CSV to get started, or skip for now</p>
                </div>
              </div>
              <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center">
                <Upload className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400 mb-2">Drag and drop a CSV file here</p>
                <p className="text-gray-600 text-sm mb-4">or click to browse</p>
                <label className="inline-block px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white hover:bg-gray-700 cursor-pointer">
                  Choose File
                  <input type="file" accept=".csv" className="hidden" onChange={() => { /* CSV import logic */ }} />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                CSV should have columns: first_name, last_name, email, phone, business_name, title
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-800">
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex items-center gap-1 px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
                className="flex items-center gap-1 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white font-medium rounded-lg transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {loading ? 'Setting up...' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
