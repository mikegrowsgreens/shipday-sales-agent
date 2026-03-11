'use client';

import { useState } from 'react';
import { Clock, Shuffle } from 'lucide-react';

export interface SendTiming {
  mode: 'now' | 'scheduled';
  send_hour: number;       // 0-23
  send_minute: number;     // 0 or 30
  timezone: string;
  deviation_minutes: number; // 0 = exact, 15/30/60/120
}

interface SendTimePreferencesProps {
  value: SendTiming;
  onChange: (timing: SendTiming) => void;
  showDeviation?: boolean;
  compact?: boolean;
}

const defaultTiming: SendTiming = {
  mode: 'scheduled',
  send_hour: 9,
  send_minute: 0,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  deviation_minutes: 30,
};

export function getDefaultTiming(): SendTiming {
  return { ...defaultTiming };
}

/**
 * Compute a concrete send timestamp from timing preferences.
 * For 'now' mode, returns current time.
 * For 'scheduled' mode, returns next occurrence of the preferred time + random deviation.
 */
export function computeSendAt(timing: SendTiming, baseDate?: Date): string {
  if (timing.mode === 'now') {
    return new Date().toISOString();
  }

  const now = baseDate || new Date();
  const target = new Date(now);
  target.setHours(timing.send_hour, timing.send_minute, 0, 0);

  // If the time has already passed today, schedule for tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  // Apply deviation
  if (timing.deviation_minutes > 0) {
    const deviationMs = timing.deviation_minutes * 60 * 1000;
    const offset = (Math.random() * 2 - 1) * deviationMs; // ±deviation
    target.setTime(target.getTime() + offset);
  }

  return target.toISOString();
}

/**
 * For multi-touch follow-ups: compute send times spaced across days with deviation.
 */
export function computeFollowUpTimes(
  timing: SendTiming,
  touchCount: number,
  daySpacing: number[] // days between touches, e.g. [0, 2, 4, 7, 10, 14, 21]
): string[] {
  const now = new Date();
  return daySpacing.slice(0, touchCount).map((daysOut) => {
    const base = new Date(now);
    base.setDate(base.getDate() + daysOut);
    base.setHours(timing.send_hour, timing.send_minute, 0, 0);

    if (timing.deviation_minutes > 0) {
      const deviationMs = timing.deviation_minutes * 60 * 1000;
      const offset = (Math.random() * 2 - 1) * deviationMs;
      base.setTime(base.getTime() + offset);
    }

    return base.toISOString();
  });
}

function formatTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

export default function SendTimePreferences({
  value,
  onChange,
  showDeviation = true,
  compact = false,
}: SendTimePreferencesProps) {
  const [open, setOpen] = useState(false);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const deviationOptions = [
    { value: 0, label: 'Exact time' },
    { value: 15, label: '±15 min' },
    { value: 30, label: '±30 min' },
    { value: 60, label: '±1 hour' },
    { value: 120, label: '±2 hours' },
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange({ ...value, mode: 'now' })}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
            value.mode === 'now'
              ? 'border-green-600 text-green-400 bg-green-600/10'
              : 'border-gray-700 text-gray-500 hover:text-gray-300'
          }`}
        >
          Send Now
        </button>
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
            value.mode === 'scheduled'
              ? 'border-blue-600 text-blue-400 bg-blue-600/10'
              : 'border-gray-700 text-gray-500 hover:text-gray-300'
          }`}
        >
          <Clock className="w-2.5 h-2.5" />
          {value.mode === 'scheduled' ? formatTime(value.send_hour, value.send_minute) : 'Schedule'}
        </button>
        {value.mode === 'scheduled' && value.deviation_minutes > 0 && (
          <span className="text-[10px] text-gray-600 flex items-center gap-0.5">
            <Shuffle className="w-2.5 h-2.5" />±{value.deviation_minutes}m
          </span>
        )}

        {open && (
          <div className="absolute z-20 mt-28 bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-xl w-56">
            <TimeControls
              value={value}
              onChange={(v) => { onChange(v); }}
              showDeviation={showDeviation}
              deviationOptions={deviationOptions}
              hours={hours}
            />
            <button
              onClick={() => setOpen(false)}
              className="w-full mt-2 text-[10px] text-gray-500 hover:text-white text-center"
            >
              Done
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Clock className="w-3.5 h-3.5" />
        <span className="font-medium">Send Timing</span>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => onChange({ ...value, mode: 'now' })}
          className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
            value.mode === 'now'
              ? 'border-green-600 text-green-400 bg-green-600/10'
              : 'border-gray-700 text-gray-500 hover:text-gray-300'
          }`}
        >
          Send Now
        </button>
        <button
          onClick={() => onChange({ ...value, mode: 'scheduled' })}
          className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
            value.mode === 'scheduled'
              ? 'border-blue-600 text-blue-400 bg-blue-600/10'
              : 'border-gray-700 text-gray-500 hover:text-gray-300'
          }`}
        >
          Schedule
        </button>
      </div>

      {value.mode === 'scheduled' && (
        <TimeControls
          value={value}
          onChange={onChange}
          showDeviation={showDeviation}
          deviationOptions={deviationOptions}
          hours={hours}
        />
      )}
    </div>
  );
}

function TimeControls({
  value,
  onChange,
  showDeviation,
  deviationOptions,
  hours,
}: {
  value: SendTiming;
  onChange: (v: SendTiming) => void;
  showDeviation: boolean;
  deviationOptions: { value: number; label: string }[];
  hours: number[];
}) {
  return (
    <div className="space-y-2">
      {/* Time picker */}
      <div className="flex items-center gap-2">
        <select
          value={value.send_hour}
          onChange={(e) => onChange({ ...value, mode: 'scheduled', send_hour: parseInt(e.target.value) })}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
        >
          {hours.map(h => (
            <option key={h} value={h}>{formatTime(h, 0).split(':')[0]}</option>
          ))}
        </select>
        <span className="text-gray-600">:</span>
        <select
          value={value.send_minute}
          onChange={(e) => onChange({ ...value, mode: 'scheduled', send_minute: parseInt(e.target.value) })}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
        >
          <option value={0}>00</option>
          <option value={15}>15</option>
          <option value={30}>30</option>
          <option value={45}>45</option>
        </select>
        <select
          value={value.send_hour < 12 ? 'AM' : 'PM'}
          onChange={(e) => {
            const isPM = e.target.value === 'PM';
            let h = value.send_hour % 12;
            if (isPM) h += 12;
            onChange({ ...value, mode: 'scheduled', send_hour: h });
          }}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
        >
          <option>AM</option>
          <option>PM</option>
        </select>
      </div>

      <div className="text-[10px] text-gray-600">
        {value.timezone.replace(/_/g, ' ')}
      </div>

      {/* Deviation */}
      {showDeviation && (
        <div>
          <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-1">
            <Shuffle className="w-2.5 h-2.5" />
            <span>Send window deviation</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {deviationOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => onChange({ ...value, deviation_minutes: opt.value })}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  value.deviation_minutes === opt.value
                    ? 'border-purple-600 text-purple-400 bg-purple-600/10'
                    : 'border-gray-700 text-gray-500 hover:text-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {value.deviation_minutes > 0 && (
            <p className="text-[10px] text-gray-600 mt-1">
              Emails send between {formatTime(
                Math.max(0, value.send_hour - Math.floor(value.deviation_minutes / 60)),
                Math.max(0, value.send_minute - (value.deviation_minutes % 60))
              )} – {formatTime(
                Math.min(23, value.send_hour + Math.floor(value.deviation_minutes / 60)),
                Math.min(59, value.send_minute + (value.deviation_minutes % 60))
              )} to look more natural
            </p>
          )}
        </div>
      )}
    </div>
  );
}
