'use client';

import { useState } from 'react';
import { NewsletterInsight } from '@/lib/types';
import { formatDate, cn } from '@/lib/utils';
import { Search, BookOpen } from 'lucide-react';

export function ResearchLibrary({ insights: initialInsights }: { insights: NewsletterInsight[] }) {
  const [insights, setInsights] = useState(initialInsights);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Get all unique tags
  const allTags = Array.from(new Set(insights.flatMap(i => i.tags || []))).sort();

  const filtered = insights.filter(insight => {
    const matchesSearch = !search || insight.insight_text.toLowerCase().includes(search.toLowerCase())
      || insight.source_subject?.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !selectedTag || (insight.tags || []).includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  async function handleSearch(query: string) {
    setSearch(query);
    if (query.length >= 3) {
      try {
        const res = await fetch(`/api/insights?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          setInsights(await res.json());
        }
      } catch { /* ignore */ }
    }
  }

  return (
    <div>
      {/* Search + Filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search insights..."
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Tags */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setSelectedTag(null)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs transition-colors',
              !selectedTag ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            )}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs transition-colors',
                tag === selectedTag ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
          <BookOpen className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-400">No insights yet</h3>
          <p className="text-sm text-gray-500 mt-1">Newsletter extraction will populate this library.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((insight) => (
            <div key={insight.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 leading-relaxed">{insight.insight_text}</p>
                </div>
                {insight.relevance_score && (
                  <span className="text-xs text-gray-500 flex-shrink-0 ml-3">
                    Score: {insight.relevance_score}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  {(insight.tags || []).map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-gray-500">
                  {insight.source_sender && <span>{insight.source_sender} | </span>}
                  {formatDate(insight.source_date)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
