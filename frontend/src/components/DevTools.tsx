'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Plus, Trash2, X, RefreshCw, AlertTriangle, Bug, Loader2, RotateCcw } from 'lucide-react';

export function DevTools() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Keyboard shortcut: Ctrl+Shift+X triggers clear confirmation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'X') {
      e.preventDefault();
      setShowConfirm(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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

  const handleClearConfirm = async () => {
    setShowConfirm(false);
    setIsOpen(false);
    await handleAction('/api/clear-data');
  };

  return (
    <>
      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="bg-[#1E1E2E] border border-red-500/30 rounded-2xl p-6 w-80 max-w-[90vw] shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-500/20 rounded-xl">
                  <Trash2 size={24} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Clear All Data?</h3>
                  <p className="text-xs text-white/50">This cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-white/70 mb-6">
                This will delete all transactions, alerts, budgets, goals, and accounts.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-white/70 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearConfirm}
                  className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-colors"
                >
                  Delete All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-32 left-4 z-[999] p-3 bg-indigo-600 text-white rounded-full shadow-2xl hover:bg-indigo-700 transition-all flex items-center gap-2 group border border-indigo-400/30"
        title="Open DevTools (Ctrl+Shift+X)"
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
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-36 left-4 z-[1000] w-72 bg-[#1E1E2E] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database size={16} className="text-indigo-400" />
                Dev Tools
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

              {/* One-Click Reset: Clear + Reseed */}
              <button
                disabled={isLoading}
                onClick={async () => {
                  await handleAction('/api/clear-data');
                  await handleAction('/api/seed', { action: 'seed', count: 100 });
                }}
                className="w-full text-left p-3 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl flex items-center gap-3 transition-colors disabled:opacity-50"
              >
                <RotateCcw size={16} />
                Reset & Reseed
              </button>

              <button
                disabled={isLoading}
                onClick={() => setShowConfirm(true)}
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
