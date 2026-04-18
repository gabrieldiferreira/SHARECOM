"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, hasFirebaseConfig } from "@/lib/firebase";

const PUBLIC_ROUTES = new Set(["/login"]);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!hasFirebaseConfig || !auth) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const isPublic = PUBLIC_ROUTES.has(pathname);

    if (!user && !isPublic) {
      router.replace("/login");
      return;
    }

    if (user && isPublic) {
      router.replace("/");
    }
  }, [isLoading, pathname, router, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
        Verificando acesso...
      </div>
    );
  }

  const isPublic = PUBLIC_ROUTES.has(pathname);
  if (!user && !isPublic) return null;
  if (user && isPublic) return null;

  return <>{children}</>;
}
