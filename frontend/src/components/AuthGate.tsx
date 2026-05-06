"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, hasFirebaseConfig } from "@/lib/firebase";
import { clearLocalTransactionCache, TRANSACTION_CACHE_OWNER_KEY } from "@/lib/db";
import { useTransactionStore } from "@/store/useTransactionStore";

const PUBLIC_ROUTES = new Set(["/login", "/auth/bridge", "/reset-password"]);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const isPublic = PUBLIC_ROUTES.has(normalizedPath);
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const initialized = useRef(false);
  const authResolved = useRef(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!hasFirebaseConfig || !auth) {
      console.error("AuthGate: Firebase não configurado.");
      authResolved.current = true;
      setIsInitializing(false);
      return;
    }

    if (initialized.current) return;
    initialized.current = true;
    authResolved.current = false;
    setIsInitializing(true);

    console.log("AuthGate: Iniciando verificação de sessão...");

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("AuthGate: onAuthStateChanged ->", currentUser ? currentUser.email : "null");
      const nextUserId = currentUser?.uid ?? null;
      let cachedOwnerId: string | null = null;

      try {
        cachedOwnerId = window.localStorage.getItem(TRANSACTION_CACHE_OWNER_KEY);
      } catch {}

      // Preserve IndexedDB across logout; clear it only when another UID takes ownership.
      const shouldClearLocalCache =
        !!nextUserId &&
        ((lastUserId.current && lastUserId.current !== nextUserId) ||
          (cachedOwnerId && cachedOwnerId !== nextUserId));

      try {
        if (!nextUserId) {
          useTransactionStore.getState().resetLocalState();
        } else if (shouldClearLocalCache) {
          useTransactionStore.getState().resetLocalState();
          await clearLocalTransactionCache();
        }
      } catch (error) {
        console.error("AuthGate: Falha ao limpar cache local.", error);
      } finally {
        lastUserId.current = nextUserId;
        authResolved.current = true;
        setUser(currentUser);
        setIsInitializing(false);
      }
    });

    return () => {
      unsubscribe();
      initialized.current = false;
      authResolved.current = false;
    };
  }, []);

  useEffect(() => {
    if (isPublic || isInitializing || !authResolved.current) return;

    console.log(`AuthGate: [CHECK] User: ${!!user} | Path: ${normalizedPath} | Public: ${isPublic}`);

    if (!user) {
      console.log("AuthGate: Acesso negado. Redirecionando para /login");
      router.replace("/login");
    }
  }, [isInitializing, isPublic, normalizedPath, router, user]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (isInitializing || !authResolved.current) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center space-y-6"
        role="status"
        aria-live="polite"
        style={{ backgroundColor: '#020617', color: '#94a3b8' }}
      >
        <div className="relative">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-bold tracking-widest uppercase opacity-80">Verificando sessão</span>
          <span className="text-[10px] font-mono opacity-40 uppercase tracking-tighter">Preparando seu acesso...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
