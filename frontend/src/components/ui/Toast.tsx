'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { CheckCircle, XCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className='fixed top-4 right-4 z-50 space-y-2'>
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl backdrop-blur-xl border transition-all animate-slide-in ${
              toast.type === 'success'
                ? 'bg-green-500/10 border-green-500/30'
                : toast.type === 'error'
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-blue-500/10 border-blue-500/30'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className='text-green-400' size={20} />
            ) : toast.type === 'error' ? (
              <XCircle className='text-red-400' size={20} />
            ) : (
              <Info className='text-blue-400' size={20} />
            )}
            <p className='text-text-primary text-sm font-medium'>{toast.message}</p>
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
      return { showToast: () => {} };
    }
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
