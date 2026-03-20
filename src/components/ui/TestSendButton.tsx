'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FlaskConical, Loader2, Check, Send } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface TestSendButtonProps {
  onSend: (email: string) => Promise<void>;
  disabled?: boolean;
  size?: 'sm' | 'md';
  defaultEmail?: string;
}

export default function TestSendButton({
  onSend,
  disabled = false,
  size = 'md',
  defaultEmail = '',
}: TestSendButtonProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  useEffect(() => {
    if (defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail]);

  // Calculate popover position when opened
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom + 4,
      left: rect.right - 288, // 288 = w-72 (18rem)
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSend = async () => {
    if (!email.trim()) {
      addToast('Enter an email address', 'error');
      return;
    }
    setSending(true);
    try {
      await onSend(email.trim());
      setSent(true);
      addToast(`Test sent to ${email.trim()}`, 'success');
      setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 2000);
    } catch (err) {
      addToast('Test send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const btnPadding = size === 'sm' ? 'px-1.5 py-1' : 'px-2 py-1.5';

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        disabled={disabled || sending}
        className={`${btnPadding} rounded-lg transition-colors flex items-center gap-1 ${
          sent
            ? 'bg-green-600/30 text-green-400'
            : 'bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 disabled:opacity-30'
        }`}
        title={sent ? 'Test sent!' : 'Send test email'}
      >
        {sending ? (
          <Loader2 className={`${iconSize} animate-spin`} />
        ) : sent ? (
          <Check className={iconSize} />
        ) : (
          <FlaskConical className={iconSize} />
        )}
        <span className="text-xs font-medium">Test</span>
      </button>

      {open && !sent && popoverPos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-3 w-72"
          style={{ top: popoverPos.top, left: popoverPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <label className="block text-[10px] text-gray-500 mb-1.5">Send test email to:</label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              placeholder="you@example.com"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={sending || !email.trim()}
              className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors shrink-0"
            >
              {sending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              Send
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
