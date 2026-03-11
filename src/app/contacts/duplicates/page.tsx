'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  GitMerge, ArrowLeft, Mail, Phone, Building2, Star, Zap,
  Loader2, Check, ArrowRight, AlertTriangle, CheckCircle,
} from 'lucide-react';
import { Contact, DuplicateGroup } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

const matchTypeLabels: Record<string, { label: string; color: string }> = {
  email: { label: 'Same Email', color: 'bg-blue-600/20 text-blue-400' },
  phone: { label: 'Same Phone', color: 'bg-green-600/20 text-green-400' },
  business: { label: 'Same Business', color: 'bg-purple-600/20 text-purple-400' },
};

export default function DuplicatesPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);
  const [totalDupes, setTotalDupes] = useState(0);
  const { addToast } = useToast();

  const fetchDuplicates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/contacts/duplicates');
      const data = await res.json();
      setGroups(data.groups || []);
      setTotalDupes(data.total_duplicates || 0);
    } catch {
      addToast('Failed to detect duplicates', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDuplicates(); }, []);

  const handleMerge = async (winnerId: number, loserId: number, groupKey: string) => {
    setMerging(groupKey);
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winner_id: winnerId,
          loser_id: loserId,
          fields_from_loser: [],
        }),
      });
      if (res.ok) {
        addToast('Contacts merged successfully', 'success');
        fetchDuplicates();
      } else {
        const err = await res.json();
        addToast(err.error || 'Merge failed', 'error');
      }
    } catch {
      addToast('Merge failed', 'error');
    } finally {
      setMerging(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <Link href="/contacts" className="text-sm text-gray-400 hover:text-white flex items-center gap-1 w-fit mb-4">
          <ArrowLeft className="w-4 h-4" /> Contacts
        </Link>
        <div className="flex items-center gap-3">
          <GitMerge className="w-6 h-6 text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Duplicate Detection</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {groups.length} duplicate groups found · {totalDupes} total contacts affected
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle className="w-10 h-10 text-green-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No duplicates found</p>
          <p className="text-xs text-gray-600 mt-1">Your contact database is clean</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group, gi) => {
            const matchCfg = matchTypeLabels[group.match_type] || matchTypeLabels.email;
            const groupKey = `${group.match_type}-${group.match_value}`;

            return (
              <div key={groupKey} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* Group Header */}
                <div className="flex items-center gap-3 p-4 border-b border-gray-800">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${matchCfg.color}`}>
                    {matchCfg.label}
                  </span>
                  <span className="text-sm text-gray-300 font-medium">{group.match_value}</span>
                  <span className="text-xs text-gray-500 ml-auto">{group.contacts.length} contacts</span>
                </div>

                {/* Contact Cards */}
                <div className="p-4 space-y-3">
                  {group.contacts.map((c, ci) => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
                    const isFirst = ci === 0;

                    return (
                      <div
                        key={c.contact_id}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          isFirst ? 'border-green-600/30 bg-green-600/5' : 'border-gray-700 bg-gray-800/50'
                        }`}
                      >
                        {/* Winner indicator */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          isFirst ? 'bg-green-600/20' : 'bg-gray-800'
                        }`}>
                          {isFirst ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <span className="text-[10px] text-gray-500">{ci + 1}</span>
                          )}
                        </div>

                        {/* Contact Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link href={`/contacts/${c.contact_id}`} className="text-sm text-gray-200 hover:text-white font-medium truncate">
                              {name}
                            </Link>
                            {isFirst && <span className="text-[10px] text-green-400">Keep</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            {c.business_name && (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> {c.business_name}
                              </span>
                            )}
                            {c.email && (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {c.email}
                              </span>
                            )}
                            {c.phone && (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {c.phone}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Scores */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-500" />
                            <span className="text-xs text-yellow-500">{c.lead_score}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-cyan-500" />
                            <span className="text-xs text-cyan-500">{c.engagement_score}</span>
                          </div>
                        </div>

                        {/* Merge Button (for non-first contacts) */}
                        {!isFirst && (
                          <button
                            onClick={() => handleMerge(group.contacts[0].contact_id, c.contact_id, groupKey)}
                            disabled={merging === groupKey}
                            className="shrink-0 flex items-center gap-1 text-xs bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-600/30 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                          >
                            {merging === groupKey ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <GitMerge className="w-3 h-3" />
                            )}
                            Merge into #{group.contacts[0].contact_id}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
