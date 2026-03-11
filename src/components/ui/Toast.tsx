'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'loading' | 'info';
  duration?: number;
}

interface ToastContextType {
  addToast: (message: string, type?: Toast['type'], duration?: number) => string;
  updateToast: (id: string, message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info', duration = 4000): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const updateToast = useCallback((id: string, message: string, type?: Toast['type']) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, message, ...(type && { type }) } : t));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, updateToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    if (toast.type === 'loading') return; // Don't auto-dismiss loading toasts
    const timer = setTimeout(() => onRemove(toast.id), toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast, onRemove]);

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
    loading: <Loader2 className="w-4 h-4 text-blue-400 shrink-0 animate-spin" />,
    info: <AlertCircle className="w-4 h-4 text-blue-400 shrink-0" />,
  };

  const borderColors = {
    success: 'border-green-800/40',
    error: 'border-red-800/40',
    loading: 'border-blue-800/40',
    info: 'border-gray-700',
  };

  return (
    <div className={`pointer-events-auto flex items-center gap-2.5 bg-gray-900 border ${borderColors[toast.type]} rounded-xl px-4 py-3 shadow-lg animate-slide-in min-w-[280px] max-w-[400px]`}>
      {icons[toast.type]}
      <span className="text-xs text-gray-200 flex-1">{toast.message}</span>
      {toast.type !== 'loading' && (
        <button onClick={() => onRemove(toast.id)} className="text-gray-500 hover:text-white shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
