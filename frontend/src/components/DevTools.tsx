'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Plus, Trash2, X, RefreshCw, AlertTriangle, Bug, Loader2 } from 'lucide-react';

export function DevTools() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Auto-hide DevTools in production unless explicitly forced
  if (process.env.NODE_ENV !== 'development' && process.env.NEXT_PUBLIC_ALLOW_SEED !== 'true') {
    return null;
  }

  const handleAction = async (endpoint: string, payload: any = {}) => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message || 'Action successful');
        // Force reload to fetch new data
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setMessage(data.error || 'Action failed');
      }
    } catch (e) {
      setMessage('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 left-4 z-[999] p-3 bg-indigo-600 text-white rounded-full shadow-2xl hover:bg-indigo-700 transition-all flex items-center gap-2 group border border-indigo-400/30"
        title="Open DevTools"
      >
        <Bug size={20} />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 ease-out whitespace-nowrap text-xs font-bold">
          DEV TOOLS
        </span>
      </button>

      {/* DevTools Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-36 left-4 z-[1000] w-72 bg-[#1E1E2E] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database size={16} className="text-indigo-400" />
                Mock Generator
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-white/50 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <button
                disabled={isLoading}
                onClick={() => handleAction('/api/seed', { action: 'seed', count: 100 })}
                className="w-full text-left p-3 text-sm font-medium text-white/90 bg-white/5 hover:bg-white/10 rounded-xl flex items-center gap-3 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={16} className="text-emerald-400" />
                Seed 100 Transactions
              </button>
              
              <button
                disabled={isLoading}
                onClick={() => handleAction('/api/seed', { action: 'seed', count: 500 })}
                className="w-full text-left p-3 text-sm font-medium text-white/90 bg-white/5 hover:bg-white/10 rounded-xl flex items-center gap-3 transition-colors disabled:opacity-50"
              >
                <Database size={16} className="text-emerald-400" />
                Seed 500 Transactions
              </button>

              <button
                disabled={isLoading}
                onClick={() => handleAction('/api/seed', { action: 'fast-forward' })}
                className="w-full text-left p-3 text-sm font-medium text-white/90 bg-white/5 hover:bg-white/10 rounded-xl flex items-center gap-3 transition-colors disabled:opacity-50"
              >
                <Plus size={16} className="text-blue-400" />
                Fast-forward 30 days
              </button>

              <button
                disabled={isLoading}
                onClick={() => handleAction('/api/seed', { action: 'anomaly' })}
                className="w-full text-left p-3 text-sm font-medium text-white/90 bg-white/5 hover:bg-white/10 rounded-xl flex items-center gap-3 transition-colors disabled:opacity-50"
              >
                <AlertTriangle size={16} className="text-amber-400" />
                Trigger Fraud Alert
              </button>

              <div className="h-px w-full bg-white/10 my-2" />

              <button
                disabled={isLoading}
                onClick={() => handleAction('/api/seed', { action: 'clear' })}
                className="w-full text-left p-3 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl flex items-center gap-3 transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
                Clear All Data
              </button>

              {/* Status Message */}
              {isLoading ? (
                <p className="text-xs text-center text-white/50 flex items-center justify-center gap-2 mt-2">
                  <Loader2 size={12} className="animate-spin" /> Processing...
                </p>
              ) : message ? (
                <p className="text-xs text-center text-emerald-400 mt-2 bg-emerald-500/10 p-2 rounded-lg break-words">
                  {message}
                </p>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
