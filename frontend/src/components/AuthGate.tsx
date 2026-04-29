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
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const initialized = useRef(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!hasFirebaseConfig || !auth) {
      console.error("AuthGate: Firebase não configurado.");
      setIsInitializing(false);
      return;
    }

    if (initialized.current) return;
    initialized.current = true;

    const initAuth = async () => {
      console.log("AuthGate: Iniciando verificação de sessão...");

      if (!auth) return;
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        console.log("AuthGate: onAuthStateChanged ->", currentUser ? currentUser.email : "null");
        const nextUserId = currentUser?.uid ?? null;
        let cachedOwnerId: string | null = null;

        try {
          cachedOwnerId = window.localStorage.getItem(TRANSACTION_CACHE_OWNER_KEY);
        } catch {}

        if (
          !nextUserId ||
          (lastUserId.current && lastUserId.current !== nextUserId) ||
          (cachedOwnerId && cachedOwnerId !== nextUserId)
        ) {
          await clearLocalTransactionCache();
          useTransactionStore.getState().resetLocalState();
        }

        lastUserId.current = nextUserId;
        setUser(currentUser);

        // Pequeno delay para garantir que o estado do Next.js se estabilize
        setTimeout(() => setIsInitializing(false), 300);
      });

      return unsubscribe;
    };

    let unsub: (() => void) | undefined;
    initAuth().then(u => {
      if (typeof u === 'function') unsub = u;
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
    // Não redireciona enquanto o Firebase estiver "pensando"
    if (isInitializing) return;

    const normalizedPath = pathname.replace(/\/$/, "") || "/";
    const isPublic = PUBLIC_ROUTES.has(normalizedPath);

    console.log(`AuthGate: [CHECK] User: ${!!user} | Path: ${normalizedPath} | Public: ${isPublic}`);

    if (!user && !isPublic) {
      console.log("AuthGate: Acesso negado. Redirecionando para /login");
      router.replace("/login");
    }
  }, [isInitializing, pathname, router, user]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-6" style={{ backgroundColor: '#020617', color: '#94a3b8' }}>
        <div className="relative">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-bold tracking-widest uppercase opacity-80">SHARECOM GATEWAY</span>
          <span className="text-[10px] font-mono opacity-40 uppercase tracking-tighter">Handshaking Session...</span>
        </div>
      </div>
    );
  }

  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const isPublic = PUBLIC_ROUTES.has(normalizedPath);

  // Evita o "flicker" de mostrar a página errada por 1 frame
  if (!user && !isPublic) return null;

  return <>{children}</>;
}
