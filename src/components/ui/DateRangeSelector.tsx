'use client';

import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

interface DateRangeSelectorProps {
  value: string;
  onChange: (range: string, from?: string, to?: string) => void;
  className?: string;
}

const presets = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '14d', label: '14 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

export default function DateRangeSelector({ value, onChange, className = '' }: DateRangeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const activeLabel = presets.find(p => p.key === value)?.label || '30 Days';

  const handleSelect = (key: string) => {
    if (key === 'custom') {
      return; // stay open for date inputs
    }
    onChange(key);
    setOpen(false);
  };

  const handleCustomApply = () => {
    if (customFrom) {
      onChange('custom', customFrom, customTo || undefined);
      setOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600 transition-colors"
      >
        <Calendar className="w-3 h-3" />
        {activeLabel}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]">
            {presets.map(p => (
              <button
                key={p.key}
                onClick={() => handleSelect(p.key)}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  value === p.key ? 'text-blue-400 bg-blue-600/10' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                {p.label}
              </button>
            ))}

            {/* Custom date inputs */}
            <div className="border-t border-gray-800 px-3 py-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300"
                />
              </div>
              <button
                onClick={handleCustomApply}
                disabled={!customFrom}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[10px] font-medium px-2 py-1 rounded"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
