'use client';

import { useState } from 'react';
import { Phone, Loader2 } from 'lucide-react';

interface ClickToCallProps {
  contactId: number;
  phone: string | null;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  taskId?: number;
}

export default function ClickToCall({ contactId, phone, size = 'sm', showLabel = true, taskId }: ClickToCallProps) {
  const [loading, setLoading] = useState(false);
  const [called, setCalled] = useState(false);

  if (!phone) return null;

  const handleCall = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/twilio/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, task_id: taskId }),
      });
      const data = await res.json();
      if (data.success) {
        setCalled(true);
        setTimeout(() => setCalled(false), 5000);
      } else {
        alert(`Call failed: ${data.error}`);
      }
    } catch {
      alert('Call failed - check Twilio config');
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = size === 'md'
    ? 'px-3 py-2 text-sm gap-1.5'
    : 'px-2.5 py-1.5 text-xs gap-1';

  return (
    <button
      onClick={handleCall}
      disabled={loading || called}
      className={`inline-flex items-center ${sizeClasses} rounded-lg transition-colors ${
        called
          ? 'bg-green-800 text-green-300 cursor-default'
          : 'bg-green-600 hover:bg-green-700 text-white'
      } disabled:opacity-70 font-medium`}
      title={`Call ${phone}`}
    >
      {loading ? (
        <Loader2 className={`${size === 'md' ? 'w-4 h-4' : 'w-3 h-3'} animate-spin`} />
      ) : (
        <Phone className={size === 'md' ? 'w-4 h-4' : 'w-3 h-3'} />
      )}
      {showLabel && (called ? 'Calling...' : 'Call')}
    </button>
  );
}
