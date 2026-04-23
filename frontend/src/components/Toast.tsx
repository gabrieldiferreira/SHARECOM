"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message, duration }]);
    
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const icons = {
    success: <CheckCircle size={20} />,
    error: <AlertCircle size={20} />,
    warning: <AlertTriangle size={20} />,
    info: <Info size={20} />,
  };

  const colors = {
    success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    error: "text-red-400 bg-red-500/10 border-red-500/30",
    warning: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    info: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Global Toast Container - Fixed Top-Right */}
      <div className="fixed top-4 right-4 z-[500] flex flex-col gap-2 pointer-events-none" style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
      }}>
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`pointer-events-auto p-4 rounded-2xl flex items-center gap-3 min-w-[280px] max-w-sm border backdrop-blur-xl ${colors[toast.type]}`}
            >
              <div className="shrink-0">{icons[toast.type]}</div>
              <p className="text-sm font-medium text-white flex-1">{toast.message}</p>
              <button 
                onClick={() => removeToast(toast.id)}
                className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={16} className="text-white/60" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// Error State with Retry Button Component
interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "Algo deu errado", message, onRetry }: ErrorStateProps) {
  return (
    <div 
      className="p-8 rounded-2xl text-center"
      style={{ 
        background: 'rgba(239, 68, 68, 0.05)',
        border: '1px solid rgba(239, 68, 68, 0.15)',
      }}
    >
      <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
      <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/50 mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
            boxShadow: '0 4px 20px rgba(139, 92, 246, 0.3)',
          }}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

// Skeleton Loader Component
interface SkeletonProps {
  className?: string;
  variant?: "card" | "list" | "chart";
}

export function Skeleton({ className = "", variant = "card" }: SkeletonProps) {
  const variants = {
    card: "h-32 rounded-2xl",
    list: "h-16 rounded-xl",
    chart: "h-48 rounded-2xl",
  };
  
  return (
    <div className={`skeleton-glass ${variants[variant]} ${className}`} />
  );
}