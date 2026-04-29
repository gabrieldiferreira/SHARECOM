'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { CheckCircle, XCircle, Info, Trash2 } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
  showToastWithUndo: (message: string, onUndo: () => void | Promise<void>) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismissToast(id), 4000);
  };

  const showToastWithUndo = (message: string, onUndo: () => void | Promise<void>) => {
    const id = Date.now();
    setToasts(prev => [
      ...prev,
      {
        id,
        message,
        type: 'error',
        action: {
          label: 'Desfazer',
          onClick: async () => {
            await onUndo();
            dismissToast(id);
          },
        },
      },
    ]);
    setTimeout(() => dismissToast(id), 4000);
  };

  return (
    <ToastContext.Provider value={{ showToast, showToastWithUndo, dismissToast }}>
      {children}
      <div className='fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 space-y-2 sm:left-auto sm:right-4 sm:w-auto sm:translate-x-0'>
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl backdrop-blur-xl border shadow-2xl transition-all animate-slide-in ${
              toast.type === 'success'
                ? 'bg-green-500/10 border-green-500/30'
                : toast.type === 'error'
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-blue-500/10 border-blue-500/30'
            }`}
          >
            {toast.action ? (
              <Trash2 className='text-red-400 shrink-0' size={18} />
            ) : toast.type === 'success' ? (
              <CheckCircle className='text-green-400' size={20} />
            ) : toast.type === 'error' ? (
              <XCircle className='text-red-400' size={20} />
            ) : (
              <Info className='text-blue-400' size={20} />
            )}
            <p className='text-text-primary text-sm font-medium flex-1'>{toast.message}</p>
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className='text-red-400 font-semibold text-sm hover:text-red-300 transition-colors'
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Return no-op functions during SSR
    if (typeof window === 'undefined') {
      return { showToast: () => {}, showToastWithUndo: () => {}, dismissToast: () => {} };
    }
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
