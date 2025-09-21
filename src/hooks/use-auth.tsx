"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ShieldCheck } from "lucide-react";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Tracks whether we've synced the server session cookie for this client user
  const [sessionReady, setSessionReady] = useState(false);
  const sessionSyncing = useRef(false);

  const router = useRouter();
  const pathname = usePathname();

  // 1) Initialize auth persistence + finalize redirect sign-in
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    getRedirectResult(auth).catch(() => {}); // no-op if not a redirect

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      setLoading(false);
      setSessionReady(false);
      sessionSyncing.current = false;
    });

    return () => unsubscribe();
  }, []);

  // 1b) Refresh server cookie whenever Firebase rotates the ID token
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (!u) return;
      try {
        const token = await u.getIdToken(); // current token (no forced refresh)
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          keepalive: true,
        });
      } catch {
        // ignore; will re-sync on next change or page load
      }
    });
    return () => unsub();
  }, []);

  // 2) When we have a client user, create/refresh the server session cookie once on mount
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setSessionReady(false);
      sessionSyncing.current = false;
      return;
    }
    if (sessionSyncing.current || sessionReady) return;

    sessionSyncing.current = true;
    (async () => {
      try {
        const token = await user.getIdToken(true);
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          keepalive: true,
        });
        if (!res.ok) throw new Error(`Session sync failed: ${res.status}`);
        setSessionReady(true);
      } catch {
        sessionSyncing.current = false; // allow retry
      }
    })();
  }, [user, loading, sessionReady]);

  // 3) Routing guard (wait until sessionReady before leaving /login)
  useEffect(() => {
    if (loading) return;

    const isAuthPage = pathname === "/login";

    if (!user && !isAuthPage) {
      router.push("/login");
      return;
    }

    if (user && isAuthPage && sessionReady) {
      router.push("/");
    }
  }, [user, loading, sessionReady, router, pathname]);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider); // desktop-friendly
    } catch (e: any) {
      if (e?.code?.includes("popup")) {
        await signInWithRedirect(auth, provider); // fallback if popup blocked
      } else {
        // optional: surface toast or error UI
        console.error("Google sign-in failed", e);
      }
    }
  };

  const signOut = async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE", cache: "no-store", keepalive: true }).catch(() => {});
      await firebaseSignOut(auth);
      setSessionReady(false);
      sessionSyncing.current = false;
      router.push("/login");
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  // Initial blocking splash
  if (loading || (!user && pathname !== "/login")) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 animate-pulse">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <p className="text-muted-foreground">Loading user session...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
